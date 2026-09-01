import { db } from "../config/db.js";

async function upsertMandantTokens({
  ecbNumber,
  companyName,
  accountantId,
  accessTokenEncrypted,
  refreshTokenEncrypted,
  tokenExpiry,
  consentGivenAt,
  consentGivenBy,
  status = "ok"
}) {
  const query = `
    INSERT INTO mandants (
      ecb_number,
      company_name,
      accountant_id,
      access_token_encrypted,
      refresh_token_encrypted,
      token_expiry,
      status,
      consent_given_at,
      consent_given_by,
      updated_at
    ) VALUES (
      $1,
      $2,
      $3::uuid,
      $4,
      $5,
      $6::timestamptz,
      $7,
      $8::timestamptz,
      $9,
      NOW()
    )
    ON CONFLICT (ecb_number) DO UPDATE SET
      company_name = EXCLUDED.company_name,
      accountant_id = EXCLUDED.accountant_id,
      access_token_encrypted = EXCLUDED.access_token_encrypted,
      refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
      token_expiry = EXCLUDED.token_expiry,
      status = EXCLUDED.status,
      consent_given_at = COALESCE(mandants.consent_given_at, EXCLUDED.consent_given_at),
      consent_given_by = COALESCE(mandants.consent_given_by, EXCLUDED.consent_given_by),
      updated_at = NOW()
  `;

  await db.query(query, [
    ecbNumber,
    companyName || null,
    accountantId,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiry,
    status,
    consentGivenAt,
    consentGivenBy || null
  ]);
}

async function findMandantByEcb(ecbNumber) {
  const query = `
    SELECT
      ecb_number,
      company_name,
      accountant_id,
      access_token_encrypted,
      refresh_token_encrypted,
      token_expiry,
      status,
      consent_given_at,
      consent_given_by,
      last_sync_at
    FROM mandants
    WHERE ecb_number = $1
    LIMIT 1
  `;

  const result = await db.query(query, [ecbNumber]);
  return result.rows[0] || null;
}

async function listMandantsSummary(accountantId) {
  if (!accountantId) {
    throw new Error("accountantId is required");
  }

  const query = `
    SELECT
      m.ecb_number,
      m.company_name,
      m.status,
      m.token_expiry,
      m.consent_given_at,
      m.last_sync_at,
      COUNT(a.id) FILTER (WHERE a.statut = 'active' AND a.niveau IN ('warning', 'critical')) AS active_alert_count
    FROM mandants m
    LEFT JOIN alerts a ON a.mandant_ecb = m.ecb_number
    WHERE m.accountant_id = $1::uuid
    GROUP BY m.ecb_number, m.company_name, m.status, m.token_expiry, m.consent_given_at, m.last_sync_at
    ORDER BY m.company_name NULLS LAST, m.ecb_number
  `;

  const result = await db.query(query, [accountantId]);
  return result.rows.map((row) => ({
    ecbNumber: row.ecb_number,
    companyName: row.company_name,
    status: row.status,
    tokenExpiry: row.token_expiry,
    consentGivenAt: row.consent_given_at,
    lastSyncAt: row.last_sync_at,
    activeAlertCount: Number(row.active_alert_count || 0)
  }));
}

async function listRefreshCandidates(cutoffIsoDate) {
  const query = `
    SELECT ecb_number, refresh_token_encrypted, token_expiry, status
    FROM mandants
    WHERE token_expiry <= $1::timestamptz OR token_expiry IS NULL
  `;
  const result = await db.query(query, [cutoffIsoDate]);
  return result.rows;
}

async function updateMandantStatus(ecbNumber, status) {
  const query = `
    UPDATE mandants
    SET status = $2,
        updated_at = NOW()
    WHERE ecb_number = $1
  `;
  await db.query(query, [ecbNumber, status]);
}

/**
 * Horodate la dernière synchronisation réussie d'un mandant.
 *
 * Sémantique : « quand Vatu a-t-il collecté ce dossier pour la dernière fois ».
 * À ne pas confondre avec le champ `lastSyncDate` renvoyé par MyMinfin dans un
 * DocumentCollection, qui décrit la dernière synchronisation interne du SPF.
 */
async function updateLastSyncAt(ecbNumber, at = new Date()) {
  const query = `
    UPDATE mandants
    SET last_sync_at = $2::timestamptz,
        updated_at = NOW()
    WHERE ecb_number = $1
  `;
  await db.query(query, [ecbNumber, at.toISOString()]);
}

export {
  upsertMandantTokens,
  findMandantByEcb,
  listMandantsSummary,
  listRefreshCandidates,
  updateLastSyncAt,
  updateMandantStatus
};
