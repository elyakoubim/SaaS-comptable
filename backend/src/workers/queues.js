import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

const DOCUMENT_SYNC_QUEUE_NAME = "fps-document-sync";

const refreshQueue = new Queue("fps-token-refresh", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    backoff: {
      type: "exponential",
      delay: 3000
    }
  }
});

const documentSyncQueue = new Queue(DOCUMENT_SYNC_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: false,
    backoff: {
      type: "exponential",
      delay: 5 * 60 * 1000
    }
  }
});

async function enqueueRefreshForMandant(ecbNumber) {
  await refreshQueue.add("refresh-one", { ecbNumber });
}

async function enqueueBulkRefresh() {
  await refreshQueue.add("refresh-all", { initiatedAt: new Date().toISOString() });
}

/**
 * Enqueue une sync de documents MyMinfin pour un mandant.
 *
 * Idempotence : jobId = `sync-${ecbNumber}` — un seul job actif/queued à la fois
 * par CBE. Si un job existe déjà avec ce jobId, l'appel est un no-op côté BullMQ.
 *
 * ⚠️ Piège corrigé ici : avec `removeOnFail: false`, un job terminé (failed ou
 * completed) conserve son jobId dans Redis. Tout nouvel ajout était alors ignoré
 * en silence — un seul échec bloquait donc définitivement toutes les synchros
 * de ce dossier, pendant que l'API continuait de répondre 202 {queued:true}.
 * Un job "delayed" (en attente de backoff, 5 à 20 min) produisait le même effet
 * de façon temporaire. On purge donc tout job qui n'est ni actif ni en file, et
 * on ne préserve l'idempotence que pour ceux-là.
 *
 * @param {string} ecbNumber - BCE 10 chiffres (validé en amont)
 * @param {Object} [options]
 * @param {Date} [options.since] - Date plancher (sinon worker utilisera son défaut)
 * @param {number} [options.delay] - Délai d'attente avant exécution en ms (utilisé
 *   pour reschedule après RateLimitError avec Retry-After)
 * @returns {Promise<import('bullmq').Job>}
 */
async function enqueueDocumentSyncForMandant(ecbNumber, options = {}) {
  const data = {
    ecbNumber,
    since: options.since instanceof Date ? options.since.toISOString() : null
  };

  const jobId = `sync-${ecbNumber}`;

  // On ne conserve l'idempotence que pour un job réellement en cours ou prêt à
  // partir. Un job "delayed" attend un backoff de 5 à 20 minutes : le laisser
  // bloquer l'id ferait qu'une demande explicite de synchronisation ne se
  // déclencherait pas avant ce délai, sans que rien ne le signale.
  const BLOCKING_STATES = new Set(["active", "waiting", "waiting-children", "prioritized"]);

  const existing = await documentSyncQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState().catch(() => null);
    if (!BLOCKING_STATES.has(state)) {
      await existing.remove().catch((error) => {
        console.warn(`[queues] could not remove job ${jobId} (state=${state}): ${error.message}`);
      });
    }
  }

  const jobOptions = { jobId };
  if (typeof options.delay === "number" && options.delay > 0) {
    jobOptions.delay = options.delay;
  }

  return documentSyncQueue.add("sync-documents", data, jobOptions);
}

export {
  refreshQueue,
  enqueueRefreshForMandant,
  enqueueBulkRefresh,
  documentSyncQueue,
  enqueueDocumentSyncForMandant,
  DOCUMENT_SYNC_QUEUE_NAME
};
