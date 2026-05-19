import { db } from "../config/db.js";

async function upsertDocument({
  documentFpsId,
  mandantEcb,
  ownerType,
  ownerIdentifier,
  documentTypeFps,
  documentDate,
  publishDate,
  metadata
}) {
  const query = `
    INSERT INTO documents (
      document_fps_id,
      mandant_ecb,
      owner_type,
      owner_identifier,
      document_type_fps,
      document_date,
      publish_date,
      metadata,
      first_seen_at,
      last_seen_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6::timestamptz,
      $7::timestamptz,
      $8::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (document_fps_id) DO UPDATE SET
      mandant_ecb = EXCLUDED.mandant_ecb,
      owner_type = EXCLUDED.owner_type,
      owner_identifier = EXCLUDED.owner_identifier,
      document_type_fps = EXCLUDED.document_type_fps,
      document_date = EXCLUDED.document_date,
      publish_date = EXCLUDED.publish_date,
      metadata = EXCLUDED.metadata,
      last_seen_at = NOW()
    RETURNING id, document_fps_id, first_seen_at, last_seen_at
  `;

  const result = await db.query(query, [
    documentFpsId,
    mandantEcb,
    ownerType,
    ownerIdentifier,
    documentTypeFps || null,
    documentDate || null,
    publishDate || null,
    metadata ? JSON.stringify(metadata) : null
  ]);

  return result.rows[0];
}

async function findByFpsId(documentFpsId) {
  const query = `
    SELECT
      id,
      document_fps_id,
      mandant_ecb,
      owner_type,
      owner_identifier,
      document_type_fps,
      document_date,
      publish_date,
      metadata,
      first_seen_at,
      last_seen_at
    FROM documents
    WHERE document_fps_id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [documentFpsId]);
  return result.rows[0] || null;
}

async function listByMandant(mandantEcb, { limit = 50, offset = 0, since } = {}) {
  const params = [mandantEcb];
  let whereClause = "WHERE mandant_ecb = $1";

  if (since) {
    params.push(since);
    whereClause += ` AND publish_date >= $${params.length}::timestamptz`;
  }

  params.push(limit, offset);

  const query = `
    SELECT
      id,
      document_fps_id,
      mandant_ecb,
      owner_type,
      owner_identifier,
      document_type_fps,
      document_date,
      publish_date,
      metadata,
      first_seen_at,
      last_seen_at
    FROM documents
    ${whereClause}
    ORDER BY publish_date DESC NULLS LAST, document_fps_id
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows;
}

async function markAsSeen(documentFpsIds) {
  if (!Array.isArray(documentFpsIds) || documentFpsIds.length === 0) {
    return 0;
  }

  const query = `
    UPDATE documents
    SET last_seen_at = NOW()
    WHERE document_fps_id = ANY($1::text[])
  `;

  const result = await db.query(query, [documentFpsIds]);
  return result.rowCount || 0;
}

async function countByMandant(mandantEcb) {
  const query = `
    SELECT COUNT(*)::int AS total
    FROM documents
    WHERE mandant_ecb = $1
  `;

  const result = await db.query(query, [mandantEcb]);
  return result.rows[0]?.total || 0;
}

export { upsertDocument, findByFpsId, listByMandant, markAsSeen, countByMandant };
