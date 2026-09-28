import { db } from "../config/db.js";

/**
 * Journalise une tentative de synchronisation (succes ou echec).
 *
 * Ecrite depuis processDocumentSyncJob (scheduler.js) a chaque issue : succes,
 * rate limit, erreur d'authentification, erreur API ou erreur inattendue.
 * Volontairement tolerante aux erreurs d'ecriture (voir l'appelant) : un souci
 * sur ce journal ne doit jamais faire echouer la synchronisation elle-meme.
 */
async function recordSyncRun({
  mandantEcb,
  jobType,
  status,
  errorCode = null,
  errorDetail = null,
  startedAt,
  finishedAt = new Date()
}) {
  const query = `
    INSERT INTO sync_runs (mandant_ecb, job_type, status, error_code, error_detail, started_at, finished_at)
    VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
    RETURNING id
  `;
  const result = await db.query(query, [
    mandantEcb,
    jobType,
    status,
    errorCode,
    errorDetail,
    (startedAt || new Date()).toISOString(),
    finishedAt.toISOString()
  ]);
  return result.rows[0];
}

/**
 * Historique de synchronisation pour un cabinet, tous mandants confondus.
 * Jointure sur mandants pour ne jamais exposer les runs d'un autre cabinet.
 */
async function listSyncRunsForCabinet(cabinetId, { ecbNumber = null, limit = 50 } = {}) {
  const params = [cabinetId];
  let ecbFilter = "";
  if (ecbNumber) {
    params.push(ecbNumber);
    ecbFilter = `AND sr.mandant_ecb = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const query = `
    SELECT sr.id, sr.mandant_ecb, m.company_name, sr.job_type, sr.status,
           sr.error_code, sr.error_detail, sr.started_at, sr.finished_at
    FROM sync_runs sr
    JOIN mandants m ON m.ecb_number = sr.mandant_ecb
    WHERE m.cabinet_id = $1::uuid ${ecbFilter}
    ORDER BY sr.started_at DESC
    LIMIT $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows;
}

export { recordSyncRun, listSyncRunsForCabinet };
