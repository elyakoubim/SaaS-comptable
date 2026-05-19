import { db } from "../config/db.js";

async function createAlert({
  mandantEcb,
  niveau,
  titre,
  detail,
  documentFpsId,
  documentTypeFps,
  documentDate
}) {
  const query = `
    INSERT INTO alerts (
      mandant_ecb,
      niveau,
      titre,
      detail,
      document_fps_id,
      document_type_fps,
      document_date,
      statut,
      triggered_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7::date,
      'active',
      NOW()
    )
    RETURNING id, mandant_ecb, niveau, titre, statut, triggered_at
  `;

  const result = await db.query(query, [
    mandantEcb,
    niveau,
    titre,
    detail || null,
    documentFpsId,
    documentTypeFps || null,
    documentDate || null
  ]);

  return result.rows[0];
}

async function existsForDocument(documentFpsId) {
  const query = `
    SELECT 1
    FROM alerts
    WHERE document_fps_id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [documentFpsId]);
  return result.rowCount > 0;
}

async function listByAccountant(accountantId, filters = {}) {
  if (!accountantId) {
    throw new Error("accountantId is required");
  }

  const { level, mandantEcb, acknowledged, limit = 50, offset = 0 } = filters;
  const params = [accountantId];
  const conditions = ["m.accountant_id = $1::uuid"];

  if (level) {
    params.push(level);
    conditions.push(`a.niveau = $${params.length}`);
  }

  if (mandantEcb) {
    params.push(mandantEcb);
    conditions.push(`a.mandant_ecb = $${params.length}`);
  }

  if (acknowledged === true) {
    conditions.push("a.statut = 'acknowledged'");
  } else if (acknowledged === false) {
    conditions.push("a.statut = 'active'");
  }

  params.push(limit, offset);

  const query = `
    SELECT
      a.id,
      a.mandant_ecb,
      a.niveau,
      a.titre,
      a.detail,
      a.document_fps_id,
      a.document_type_fps,
      a.document_date,
      a.triggered_at,
      a.statut,
      a.acknowledged_at,
      a.acknowledged_by,
      m.company_name
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.triggered_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows;
}

async function acknowledgeAlert(alertId, accountantId) {
  if (!alertId || !accountantId) {
    throw new Error("alertId and accountantId are required");
  }

  const query = `
    UPDATE alerts a
    SET
      statut = 'acknowledged',
      acknowledged_at = NOW(),
      acknowledged_by = $2::uuid
    FROM mandants m
    WHERE a.id = $1::uuid
      AND a.mandant_ecb = m.ecb_number
      AND m.accountant_id = $2::uuid
    RETURNING a.id, a.statut, a.acknowledged_at, a.acknowledged_by
  `;

  const result = await db.query(query, [alertId, accountantId]);
  return result.rows[0] || null;
}

async function countActiveByAccountant(accountantId) {
  if (!accountantId) {
    throw new Error("accountantId is required");
  }

  const query = `
    SELECT COUNT(*)::int AS total
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE m.accountant_id = $1::uuid
      AND a.statut = 'active'
  `;

  const result = await db.query(query, [accountantId]);
  return result.rows[0]?.total || 0;
}

export {
  createAlert,
  existsForDocument,
  listByAccountant,
  acknowledgeAlert,
  countActiveByAccountant
};
