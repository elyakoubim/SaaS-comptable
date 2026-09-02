import "dotenv/config";
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import {
  getValidAccessToken,
  refreshExpiredMandants,
  refreshMandantByEcb
} from "../services/fpsAuth.service.js";
import { searchDocuments } from "../services/myMinfinClient.service.js";
import { ApiError, AuthError, RateLimitError } from "../services/myMinfinErrors.js";
import { classifyDocument } from "../services/documentClassifier.service.js";
import {
  findMandantByEcb,
  listSyncCandidates,
  updateLastSyncAt
} from "../repositories/mandant.repository.js";
import { upsertDocument } from "../repositories/document.repository.js";
import { createAlert, existsForDocument } from "../repositories/alert.repository.js";
import { decryptText } from "../utils/tokenCrypto.js";
import {
  DOCUMENT_SYNC_QUEUE_NAME,
  documentSyncQueue,
  enqueueDocumentSyncForMandant,
  refreshQueue
} from "./queues.js";

// Le SPF conserve 60 jours glissants : au-dela, un document n'est plus
// telechargeable. C'est donc le plancher absolu de toute recherche.
const FPS_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

// Marge de recouvrement d'une synchronisation a l'autre : couvre les executions
// manquees et les documents publies pendant qu'une collecte tournait.
const SYNC_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;

// Etalement des recherches lors du balayage horaire. Le quota du SPF (1 recherche
// / 10 min) s'applique PAR DOSSIER, donc rien n'oblige a espacer ; on le fait
// malgre tout pour ne pas ouvrir 200 connexions dans la meme seconde.
const FAN_OUT_STEP_MS = 20 * 1000;

/**
 * Fenetre de recherche d'une synchronisation.
 *
 * - `since` explicite (reprise apres 429) : on le respecte tel quel.
 * - jamais synchronise : toute la fenetre de retention du SPF. C'est le premier
 *   contact d'un client avec le produit — il doit y trouver deux mois
 *   d'historique, pas une semaine.
 * - deja synchronise : depuis la derniere collecte, moins la marge, sans jamais
 *   descendre sous le plancher des 60 jours (inutile : le SPF ne renverra rien).
 */
function resolveSince(explicitSince, lastSyncAt) {
  if (explicitSince) {
    return new Date(explicitSince);
  }
  const floor = new Date(Date.now() - FPS_RETENTION_MS);
  if (!lastSyncAt) {
    return floor;
  }
  const incremental = new Date(new Date(lastSyncAt).getTime() - SYNC_OVERLAP_MS);
  return incremental < floor ? floor : incremental;
}

const worker = new Worker(
  "fps-token-refresh",
  async (job) => {
    if (job.name === "refresh-one") {
      await refreshMandantByEcb(job.data.ecbNumber);
      return;
    }

    await refreshExpiredMandants();
  },
  {
    connection: redisConnection,
    concurrency: 3
  }
);

worker.on("completed", (job) => {
  console.log(`[worker] job completed: ${job.id} (${job.name})`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job failed: ${job?.id} (${job?.name}) -> ${err.message}`);
});

await refreshQueue.upsertJobScheduler("hourly-token-refresh", {
  pattern: "0 * * * *"
}, {
  name: "refresh-all",
  data: { source: "scheduler" }
});


async function processDocumentSyncJob(job) {
  const ecbNumber = String(job.data?.ecbNumber || "");
  if (!/^\d{10}$/.test(ecbNumber)) {
    throw new Error(`invalid ecbNumber in job data: "${ecbNumber}"`);
  }

  const mandant = await findMandantByEcb(ecbNumber);
  const since = resolveSince(job.data?.since, mandant?.last_sync_at);
  console.log(
    `[doc-sync] ${ecbNumber}: fenetre depuis ${since.toISOString().slice(0, 10)}` +
      (mandant?.last_sync_at ? " (incrementale)" : " (initiale, 60 jours)")
  );

  const accessToken = await getValidAccessToken(ecbNumber);

  try {
    const documents = await searchDocuments(accessToken, ecbNumber, since);
    let createdAlerts = 0;

    for (const doc of documents) {
      if (!doc.uuid) {
        continue;
      }

      const isNew = !(await existsForDocument(doc.uuid));

      await upsertDocument({
        documentFpsId: doc.uuid,
        mandantEcb: ecbNumber,
        ownerType: doc.ownerType || "CBE",
        ownerIdentifier: doc.ownerIdentifier || ecbNumber,
        documentTypeFps: doc.documentType,
        documentDate: doc.documentDate,
        publishDate: doc.publishDate,
        metadata: doc.raw
      });

      if (isNew) {
        const { level, titleKey } = classifyDocument(doc.documentType);
        await createAlert({
          mandantEcb: ecbNumber,
          niveau: level,
          titre: `[${titleKey}] ${doc.documentType || "document"}`,
          detail: doc.documentDate ? `Date: ${doc.documentDate}` : null,
          documentFpsId: doc.uuid,
          documentTypeFps: doc.documentType,
          documentDate: doc.documentDate
        });
        createdAlerts += 1;
      }
    }

    // Horodate la synchronisation : sans cela le tableau de bord affiche
    // « Dernière sync : - » en permanence, même quand tout fonctionne.
    await updateLastSyncAt(ecbNumber);

    console.log(
      `[doc-sync] ${ecbNumber}: ${documents.length} documents, ${createdAlerts} new alerts`
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      const delayMs = Math.max(1, error.retryAfterSeconds || 60) * 1000;
      console.warn(
        `[doc-sync] rate limit hit for ${ecbNumber}, rescheduling in ${delayMs}ms (instance=${error.instance || "n/a"})`
      );
      await enqueueDocumentSyncForMandant(ecbNumber, { delay: delayMs, since });
      throw error;
    }

    if (error instanceof AuthError) {
      if (error.retryable) {
        console.warn(
          `[doc-sync] auth retryable for ${ecbNumber} (likely token expired) — BullMQ will retry after backoff; hourly refresh scheduler should renew the token in the meantime`
        );
        throw error;
      }
      // TODO: marquer le mandant comme "needs_reconnect" — pas de valeur dans
      // le CHECK actuel (mandants.status IN ('ok','warning','alert')).
      // Migration à prévoir : ajouter 'needs_reconnect' au CHECK + un champ
      // last_auth_error_at, puis updateMandantStatus ici.
      console.error(
        `[doc-sync] auth NON-retryable for ${ecbNumber}: ${error.message} (status=${error.status}, instance=${error.instance || "n/a"})`
      );
      return;
    }

    if (error instanceof ApiError) {
      console.error(
        `[doc-sync] API error for ${ecbNumber}: ${error.message} (status=${error.status}, instance=${error.instance || "n/a"})`
      );
      throw error;
    }

    console.error(`[doc-sync] unexpected error for ${ecbNumber}:`, error.stack || error.message);
    throw error;
  }
}

/**
 * Balayage : enfile une synchronisation par mandant.
 *
 * Sans cela, rien ne collecte de documents. Le seul travail recurrent etait le
 * rafraichissement des JETONS ; la file documents n'avait aucun planificateur et
 * n'etait alimentee que par POST /api/sync/:cbe, qu'aucun bouton n'appelle.
 * La promesse « on centralise vos documents et on vous previent » ne tenait donc
 * pas : personne ne prevenait personne.
 */
async function processSyncAllJob() {
  const mandants = await listSyncCandidates();
  if (!mandants.length) {
    console.log("[doc-sync-all] aucun mandant a synchroniser");
    return;
  }

  console.log(`[doc-sync-all] ${mandants.length} mandant(s) a synchroniser`);
  for (const [index, { ecb_number: ecbNumber, last_sync_at: lastSyncAt }] of mandants.entries()) {
    try {
      await enqueueDocumentSyncForMandant(ecbNumber, { delay: index * FAN_OUT_STEP_MS });
      console.log(
        `[doc-sync-all] ${ecbNumber} enfile (+${index * FAN_OUT_STEP_MS / 1000}s)` +
          (lastSyncAt ? "" : " — jamais synchronise, reprise sur 60 jours")
      );
    } catch (error) {
      console.error(`[doc-sync-all] ${ecbNumber} non enfile : ${error.message}`);
    }
  }
}

const documentSyncWorker = new Worker(
  DOCUMENT_SYNC_QUEUE_NAME,
  async (job) => {
    if (job.name === "sync-all") {
      return processSyncAllJob();
    }
    return processDocumentSyncJob(job);
  },
  {
    connection: redisConnection,
    concurrency: 1
  }
);

documentSyncWorker.on("completed", (job) => {
  console.log(`[doc-sync-worker] job completed: ${job.id} (${job.name})`);
});

documentSyncWorker.on("failed", (job, err) => {
  console.error(`[doc-sync-worker] job failed: ${job?.id} (${job?.name}) -> ${err.message}`);
});

// Minute 20 : decale du rafraichissement des jetons (minute 0), pour ne pas
// demander un token au moment ou tous les autres sont renouveles.
await documentSyncQueue.upsertJobScheduler("hourly-document-sync", {
  pattern: "20 * * * *"
}, {
  name: "sync-all",
  data: { source: "scheduler" }
});

console.log("BullMQ scheduler/worker started");
console.log("Document sync worker started (hourly fan-out at minute 20)");
