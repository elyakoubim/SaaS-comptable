import { db } from "../config/db.js";

/**
 * Agrégats servant la page « Analyse ».
 *
 * Tout ce qui suit sort de nos deux tables — `documents` et `alerts` — et de
 * rien d'autre. C'est délibéré : la version précédente de la page fabriquait
 * une « variation TVA vs N-1 » et un « score de risque » à partir des quatre
 * derniers chiffres du numéro BCE. Ces chiffres n'existaient nulle part, et
 * l'API MyMinfin ne les fournit pas — elle livre des documents, pas des
 * déclarations chiffrées.
 *
 * Tant qu'on n'extrait pas les montants du contenu des PDF, la seule analyse
 * honnête est une analyse de flux : combien de documents, de quelles familles,
 * depuis quand, et depuis quand non traités.
 */

/**
 * Volumétrie par type de document, par mandant, sur une fenêtre glissante.
 * La classification en familles se fait ensuite en JS : la table `documents`
 * ne stocke que le libellé brut du SPF.
 */
async function countDocumentsByType(accountantId, windowDays = 60) {
  const query = `
    SELECT
      m.ecb_number,
      m.company_name,
      m.status,
      m.last_sync_at,
      d.document_type_fps,
      COUNT(d.document_fps_id)::int AS total,
      MAX(d.publish_date) AS last_publish_date
    FROM mandants m
    LEFT JOIN documents d
      ON d.mandant_ecb = m.ecb_number
     AND d.publish_date >= NOW() - make_interval(days => $2::int)
    WHERE m.accountant_id = $1::uuid
    GROUP BY m.ecb_number, m.company_name, m.status, m.last_sync_at, d.document_type_fps
    ORDER BY m.ecb_number, total DESC
  `;

  const result = await db.query(query, [accountantId, windowDays]);
  return result.rows;
}

/**
 * Alertes actives par mandant et par niveau, avec l'ancienneté de la plus
 * vieille. C'est l'ancienneté qui porte le signal : une alerte critique
 * ouverte depuis trois semaines dit quelque chose qu'un simple compteur tait.
 */
async function countActiveAlertsByLevel(accountantId) {
  const query = `
    SELECT
      a.mandant_ecb,
      a.niveau,
      COUNT(*)::int AS total,
      MIN(a.triggered_at) AS oldest_triggered_at
    FROM alerts a
    INNER JOIN mandants m ON m.ecb_number = a.mandant_ecb
    WHERE m.accountant_id = $1::uuid
      AND a.statut = 'active'
    GROUP BY a.mandant_ecb, a.niveau
  `;

  const result = await db.query(query, [accountantId]);
  return result.rows;
}

export { countDocumentsByType, countActiveAlertsByLevel };
