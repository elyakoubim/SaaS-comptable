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

  const jobOptions = { jobId: `sync-${ecbNumber}` };
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
