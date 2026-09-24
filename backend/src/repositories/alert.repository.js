import { db } from "../config/db.js";

async function createAlert({
  mandantEcb,
  niveau,
  titre,
  detail,
  category,
  actionable,
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
      category,
      actionable,
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
      $7,
      $8,
      $9::date,
      'active',
      NOW()
    )
    RETURNING id, mandant_ecb, niveau, titre, category, actionable, statut, triggered_at
  `;

  const result = await db.query(query, [
    mandantEcb,
    niveau,
    titre,
    detail || null,
    category || null,
    actionable === true,
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

async function listByAccountant(cabinetId, filters = {}) {
  if (!cabinetId) {
    throw new Error("cabinetId is required");
  }

  const { level, category, mandantEcb, acknowledged, limit = 50, offset = 0 } = filters;
  const params = [cabinetId];
  const conditions = ["m.cabinet_id = $1::uuid"];

  if (level) {
    params.push(level);
    conditions.push(`a.niveau = $${params.length}`);
  }

  if (category) {
    params.push(category);
    conditions.push(`a.category = $${params.length}`);
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
      a.category,
      a.actionable,
      a.document_fps_id,
      a.document_type_fps,
      a.document_date,
      a.triggered_at,
      a.statut,
      a.acknowledged_at,
      a.acknowledged_by,
      a.extracted_montant,
      a.extracted_date_echeance,
      a.extracted_reference,
      a.extracted_accroche,
      a.extracted_at,
      m.company_name
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE ${conditions.join(" AND ")}
    ORDER BY
      CASE a.niveau
        WHEN 'critical' THEN 0
        WHEN 'warning' THEN 1
        WHEN 'info' THEN 2
        ELSE 3
      END,
      a.triggered_at DESC
    LIMIT $${params.length - 1}
    OFFSET $${params.length}
  `;

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Charge une alerte avec verification d'appartenance au cabinet comptable
 * (via le mandant), pour la route d'extraction IA - on ne veut jamais
 * declencher une lecture de document pour un cabinet qui n'y a pas droit.
 */
async function getAlertForAccountant(alertId, cabinetId) {
  if (!alertId || !cabinetId) {
    throw new Error("alertId and cabinetId are required");
  }

  const query = `
    SELECT
      a.id,
      a.mandant_ecb,
      a.category,
      a.document_fps_id,
      a.extracted_montant,
      a.extracted_date_echeance,
      a.extracted_reference,
      a.extracted_accroche,
      a.extracted_at
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE a.id = $1::uuid
      AND m.cabinet_id = $2::uuid
    LIMIT 1
  `;

  const result = await db.query(query, [alertId, cabinetId]);
  return result.rows[0] || null;
}

/**
 * Enregistre le resultat de "Lire avec l'IA" - fait une seule fois par
 * document, `extracted_at` sert ensuite de cache (cf. extraction.service.js
 * et la route POST /alerts/:id/extract).
 */
async function saveExtraction(alertId, { montant, dateEcheance, reference, accroche }) {
  const query = `
    UPDATE alerts
    SET
      extracted_montant = $2,
      extracted_date_echeance = $3::date,
      extracted_reference = $4,
      extracted_accroche = $5,
      extracted_at = NOW()
    WHERE id = $1::uuid
    RETURNING id, extracted_montant, extracted_date_echeance, extracted_reference, extracted_accroche, extracted_at
  `;

  const result = await db.query(query, [
    alertId,
    montant || null,
    dateEcheance || null,
    reference || null,
    accroche || null
  ]);

  return result.rows[0] || null;
}

// `accountantId` reste l'identite qui a traite l'alerte (audit), tandis que
// `cabinetId` verifie que le mandant appartient bien au cabinet du demandeur -
// n'importe quel membre du cabinet peut acquitter une alerte de ses dossiers.
async function acknowledgeAlert(alertId, { cabinetId, accountantId }) {
  if (!alertId || !cabinetId || !accountantId) {
    throw new Error("alertId, cabinetId and accountantId are required");
  }

  const query = `
    UPDATE alerts a
    SET
      statut = 'acknowledged',
      acknowledged_at = NOW(),
      acknowledged_by = $3::uuid
    FROM mandants m
    WHERE a.id = $1::uuid
      AND a.mandant_ecb = m.ecb_number
      AND m.cabinet_id = $2::uuid
    RETURNING a.id, a.statut, a.acknowledged_at, a.acknowledged_by
  `;

  const result = await db.query(query, [alertId, cabinetId, accountantId]);
  return result.rows[0] || null;
}

async function countActiveByAccountant(cabinetId) {
  if (!cabinetId) {
    throw new Error("cabinetId is required");
  }

  const query = `
    SELECT COUNT(*)::int AS total
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE m.cabinet_id = $1::uuid
      AND a.statut = 'active'
  `;

  const result = await db.query(query, [cabinetId]);
  return result.rows[0]?.total || 0;
}

/**
 * Vue portefeuille : une ligne par dossier (mandant) du cabinet, avec les
 * compteurs d'alertes actives par niveau et l'alerte la plus urgente.
 *
 * "La plus urgente" = la plus sévère (critical > warning > info), puis la
 * plus récente à niveau égal. Un `category` optionnel restreint le calcul
 * (compteurs et alerte la plus urgente) aux alertes de cette catégorie
 * seulement — les onze valeurs de `CATEGORIES` dans documentClassifier.service.js.
 */
async function getPortfolioSummary(cabinetId, filters = {}) {
  if (!cabinetId) {
    throw new Error("cabinetId is required");
  }

  const { category = null } = filters;

  const query = `
    WITH counts AS (
      SELECT
        m.ecb_number,
        m.company_name,
        m.last_sync_at,
        COUNT(*) FILTER (WHERE a.niveau = 'critical' AND a.statut = 'active') AS critical_count,
        COUNT(*) FILTER (WHERE a.niveau = 'warning' AND a.statut = 'active') AS warning_count,
        COUNT(*) FILTER (WHERE a.niveau = 'info' AND a.statut = 'active') AS info_count
      FROM mandants m
      LEFT JOIN alerts a
        ON a.mandant_ecb = m.ecb_number
        AND ($2::text IS NULL OR a.category = $2::text)
      WHERE m.cabinet_id = $1::uuid
      GROUP BY m.ecb_number, m.company_name, m.last_sync_at
    ),
    ranked AS (
      SELECT
        a.mandant_ecb,
        a.titre,
        a.niveau,
        a.category,
        a.document_date,
        ROW_NUMBER() OVER (
          PARTITION BY a.mandant_ecb
          ORDER BY
            CASE a.niveau WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC,
            a.triggered_at DESC
        ) AS rn
      FROM alerts a
      WHERE a.statut = 'active'
        AND ($2::text IS NULL OR a.category = $2::text)
    )
    SELECT
      c.ecb_number,
      c.company_name,
      c.last_sync_at,
      c.critical_count,
      c.warning_count,
      c.info_count,
      r.titre AS top_title,
      r.niveau AS top_level,
      r.category AS top_category,
      r.document_date AS top_document_date
    FROM counts c
    LEFT JOIN ranked r ON r.mandant_ecb = c.ecb_number AND r.rn = 1
    ORDER BY c.critical_count DESC, c.warning_count DESC, c.info_count DESC, c.company_name ASC
  `;

  const result = await db.query(query, [cabinetId, category]);
  return result.rows;
}

export {
  createAlert,
  existsForDocument,
  listByAccountant,
  getAlertForAccountant,
  saveExtraction,
  acknowledgeAlert,
  countActiveByAccountant,
  getPortfolioSummary
};
