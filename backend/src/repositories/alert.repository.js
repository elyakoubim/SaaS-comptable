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

/**
 * Alertes du cabinet apparues depuis une date donnee - sert au recap
 * quotidien par email (cf. vatu/decisions.md, 24/09/2026). Base sur
 * `triggered_at`, pas sur `statut` : le recap montre ce qui est nouveau,
 * qu'il ait deja ete acquitte entre-temps ou non.
 */
async function listAlertsSince(cabinetId, since) {
  if (!cabinetId || !since) {
    throw new Error("cabinetId and since are required");
  }

  const query = `
    SELECT
      a.id,
      a.niveau,
      a.titre,
      a.category,
      a.document_date,
      a.triggered_at,
      m.company_name,
      m.ecb_number
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE m.cabinet_id = $1::uuid
      AND a.triggered_at > $2::timestamptz
    ORDER BY
      CASE a.niveau
        WHEN 'critical' THEN 0
        WHEN 'warning' THEN 1
        WHEN 'info' THEN 2
        ELSE 3
      END,
      a.triggered_at DESC
  `;

  const result = await db.query(query, [cabinetId, since]);
  return result.rows;
}

/**
 * Alerte par id, sans verification de cabinet - reserve a l'outil interne de
 * revue de la precision de "Lire avec l'IA" (point #21, cf. admin.routes.js),
 * qui doit pouvoir relire le document de n'importe quel cabinet pour
 * echantillonner des extractions reelles. Jamais expose aux comptables.
 */
async function getAlertForAdmin(alertId) {
  if (!alertId) {
    throw new Error("alertId is required");
  }

  const query = `
    SELECT a.id, a.mandant_ecb, a.document_fps_id, a.category
    FROM alerts a
    WHERE a.id = $1::uuid
    LIMIT 1
  `;

  const result = await db.query(query, [alertId]);
  return result.rows[0] || null;
}

/**
 * Extractions deja faites, pretes a etre verifiees a la main (point #21).
 * `onlyUnverified` (par defaut) exclut celles deja revues, pour ne pas
 * repasser sur le meme echantillon a chaque ouverture de l'outil.
 */
async function listExtractionsForReview({ limit = 50, onlyUnverified = true } = {}) {
  const condition = onlyUnverified ? "AND a.extraction_verified_at IS NULL" : "";

  const query = `
    SELECT
      a.id,
      a.mandant_ecb,
      a.category,
      a.titre,
      a.document_fps_id,
      a.extracted_montant,
      a.extracted_date_echeance,
      a.extracted_reference,
      a.extracted_accroche,
      a.extracted_at,
      a.extraction_verified_at,
      a.extraction_montant_correct,
      a.extraction_date_correct,
      a.extraction_reference_correct,
      a.extraction_verified_by,
      m.company_name
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE a.extracted_at IS NOT NULL
    ${condition}
    ORDER BY a.extracted_at DESC
    LIMIT $1
  `;

  const result = await db.query(query, [limit]);
  return result.rows;
}

/**
 * Enregistre le verdict humain sur une extraction (point #21) - un booleen
 * par champ, jamais un verdict global : le montant peut etre juste alors que
 * la date est fausse, et melanger les deux masquerait quel champ doit etre
 * ameliore dans le prompt.
 */
async function saveExtractionVerification(alertId, { montantCorrect, dateCorrect, referenceCorrect, verifiedBy }) {
  const query = `
    UPDATE alerts
    SET
      extraction_montant_correct = $2,
      extraction_date_correct = $3,
      extraction_reference_correct = $4,
      extraction_verified_at = NOW(),
      extraction_verified_by = $5
    WHERE id = $1::uuid
    RETURNING
      id,
      extraction_montant_correct,
      extraction_date_correct,
      extraction_reference_correct,
      extraction_verified_at,
      extraction_verified_by
  `;

  const result = await db.query(query, [
    alertId,
    montantCorrect === undefined ? null : montantCorrect,
    dateCorrect === undefined ? null : dateCorrect,
    referenceCorrect === undefined ? null : referenceCorrect,
    verifiedBy || null
  ]);

  return result.rows[0] || null;
}

/**
 * Taux d'exactitude par champ, regroupe par categorie de document (point
 * #21) - permet de voir si un type de document precis pose probleme (ex: le
 * montant mal extrait uniquement sur les avis de paiement) plutot qu'un seul
 * chiffre global qui noierait le signal.
 */
async function getExtractionAccuracyStats() {
  const query = `
    SELECT
      category,
      COUNT(*) FILTER (WHERE extraction_verified_at IS NOT NULL) AS verified_count,
      COUNT(*) FILTER (WHERE extraction_montant_correct = true) AS montant_correct,
      COUNT(*) FILTER (WHERE extraction_montant_correct = false) AS montant_incorrect,
      COUNT(*) FILTER (WHERE extraction_date_correct = true) AS date_correct,
      COUNT(*) FILTER (WHERE extraction_date_correct = false) AS date_incorrect,
      COUNT(*) FILTER (WHERE extraction_reference_correct = true) AS reference_correct,
      COUNT(*) FILTER (WHERE extraction_reference_correct = false) AS reference_incorrect
    FROM alerts
    WHERE extracted_at IS NOT NULL
    GROUP BY category
    ORDER BY category
  `;

  const result = await db.query(query);
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
  getPortfolioSummary,
  listAlertsSince,
  getAlertForAdmin,
  listExtractionsForReview,
  saveExtractionVerification,
  getExtractionAccuracyStats
};
