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
import { findMandantByEcb } from "../repositories/mandant.repository.js";
import { upsertDocument } from "../repositories/document.repository.js";
import { createAlert, existsForDocument } from "../repositories/alert.repository.js";
import { decryptText } from "../utils/tokenCrypto.js";
import {
  DOCUMENT_SYNC_QUEUE_NAME,
  enqueueDocumentSyncForMandant,
  refreshQueue
} from "./queues.js";

const DEFAULT_SINCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  const since = job.data?.since
    ? new Date(job.data.since)
    : new Date(Date.now() - DEFAULT_SINCE_WINDOW_MS);

  if (!/^\d{10}$/.test(ecbNumber)) {
    throw new Error(`invalid ecbNumber in job data: "${ecbNumber}"`);
  }

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

const documentSyncWorker = new Worker(
  DOCUMENT_SYNC_QUEUE_NAME,
  processDocumentSyncJob,
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

console.log("BullMQ scheduler/worker started");
console.log("Document sync worker started");
