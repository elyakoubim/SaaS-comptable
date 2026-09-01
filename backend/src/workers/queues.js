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
 * ⚠️ Piège corrigé ici : avec `removeOnFail: false`, un job TERMINÉ (failed ou
 * completed) conserve son jobId dans Redis. Tout nouvel ajout était alors ignoré
 * en silence — un seul échec bloquait donc définitivement toutes les synchros
 * de ce dossier, pendant que l'API continuait de répondre 202 {queued:true}.
 * On purge donc un job déjà terminé avant de ré-enfiler. Un job encore
 * waiting/active/delayed est laissé intact : c'est l'idempotence voulue.
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

  const existing = await documentSyncQueue.getJob(jobId);
  if (existing) {
    const state = await existing.getState().catch(() => null);
    if (state === "completed" || state === "failed") {
      await existing.remove().catch((error) => {
        console.warn(`[queues] could not remove finished job ${jobId}: ${error.message}`);
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
