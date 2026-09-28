import { db } from "../config/db.js";
import { classifyDocument, buildAlertTitle } from "../services/documentClassifier.service.js";

/**
 * Recalcule niveau/titre/category/actionable pour les alertes créées avec
 * l'ancien classificateur (mots-clés devinés, titres au format `[cle] ...`).
 *
 * Le nouveau classificateur (documentClassifier.service.js) a été calé sur
 * les 106 types réellement observés — voir son en-tête pour le détail des
 * erreurs qu'il corrige (ex : « Avis de paiement » qui tombait en
 * `autre_document / info`, ou les amendes administratives qui remontaient en
 * `info` au lieu de `critical`).
 *
 * Ciblage : uniquement les lignes au format legacy (`titre LIKE '[%'`), pour
 * que ce backfill soit un no-op rapide une fois exécuté — il tourne à chaque
 * démarrage du serveur (voir server.js), comme ensureDatabaseSchema().
 *
 * Reclassification : on rejoint `documents` pour recuperer le LocalizedString
 * complet (`metadata.docType.name`, FR/NL/DE) quand il est disponible — c'est
 * exactement ce que `processDocumentSyncJob` passe au classificateur pour les
 * nouveaux documents. À défaut (document supprimé/absent), on retombe sur le
 * seul libellé conservé sur l'alerte (`document_type_fps`).
 */
async function backfillAlertClassification() {
  const { rows } = await db.query(`
    SELECT a.id, a.document_type_fps, d.metadata #> '{docType,name}' AS labels
    FROM alerts a
    LEFT JOIN documents d ON d.document_fps_id = a.document_fps_id
    WHERE a.titre LIKE '[%'
  `);

  if (rows.length === 0) {
    return { scanned: 0, updated: 0 };
  }

  const ids = [];
  const niveaux = [];
  const titres = [];
  const categories = [];
  const actionables = [];

  for (const row of rows) {
    const documentType = row.labels && typeof row.labels === "object" ? row.labels : row.document_type_fps;
    const { level, titleKey, category, actionable } = classifyDocument(documentType);

    ids.push(row.id);
    niveaux.push(level);
    titres.push(buildAlertTitle(titleKey, row.document_type_fps));
    categories.push(category);
    actionables.push(actionable === true);
  }

  const result = await db.query(
    `
    UPDATE alerts AS a
    SET niveau = u.niveau,
        titre = u.titre,
        category = u.category,
        actionable = u.actionable
    FROM unnest(
      $1::uuid[],
      $2::text[],
      $3::text[],
      $4::text[],
      $5::boolean[]
    ) AS u(id, niveau, titre, category, actionable)
    WHERE a.id = u.id
    `,
    [ids, niveaux, titres, categories, actionables]
  );

  return { scanned: rows.length, updated: result.rowCount };
}

export { backfillAlertClassification };
