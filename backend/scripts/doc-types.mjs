/**
 * Inventaire des types de documents MyMinfin réellement collectés.
 *
 * Objectif : construire les catégories du tableau de bord à partir de ce que le
 * SPF envoie vraiment, plutôt qu'à partir de suppositions. Le script imprime
 * chaque `document_type_fps` distinct, son volume, sa répartition par mandant,
 * et la classification que `documentClassifier.service.js` lui attribue
 * aujourd'hui — ce qui rend visibles les types qui tombent en « autre_document »
 * faute de règle.
 *
 * Usage (Render Web Shell, depuis backend/) :
 *   npm run docs:types
 */

import "../src/config/env.js";
import { db } from "../src/config/db.js";
import { classifyDocument } from "../src/services/documentClassifier.service.js";

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(value, width) {
  const s = String(value);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

async function main() {
  const totals = await db.query("SELECT COUNT(*)::int AS n FROM documents");
  const total = totals.rows[0]?.n ?? 0;
  console.log(`\n═══ Types de documents collectés — ${total} documents en base ═══\n`);

  if (total === 0) {
    console.log("Aucun document en base. Lance une synchronisation d'abord.");
    await db.end();
    return;
  }

  const { rows } = await db.query(`
    SELECT
      COALESCE(document_type_fps, '(null)') AS type,
      COUNT(*)::int AS n,
      COUNT(DISTINCT mandant_ecb)::int AS mandants,
      COUNT(*) FILTER (WHERE owner_type = 'SSIN')::int AS ssin,
      MIN(document_date) AS oldest,
      MAX(document_date) AS newest
    FROM documents
    GROUP BY 1
    ORDER BY n DESC, type ASC
  `);

  console.log(
    `${pad("TYPE FPS", 58)}${padLeft("N", 6)}${padLeft("MAND", 6)}${padLeft("PP", 5)}  ${pad("NIVEAU", 9)}CLÉ DE TITRE`
  );
  console.log("─".repeat(130));

  const unmatched = [];
  for (const r of rows) {
    const { level, titleKey } = classifyDocument(r.type);
    if (titleKey === "autre_document") unmatched.push(r);
    const label = r.type.length > 56 ? r.type.slice(0, 55) + "…" : r.type;
    console.log(
      `${pad(label, 58)}${padLeft(r.n, 6)}${padLeft(r.mandants, 6)}${padLeft(r.ssin, 5)}  ${pad(level, 9)}${titleKey}`
    );
  }

  console.log("─".repeat(130));
  console.log(`${rows.length} types distincts.`);

  const covered = rows.length - unmatched.length;
  console.log(
    `Classés par une règle explicite : ${covered}/${rows.length} types ` +
      `(${total - unmatched.reduce((s, r) => s + r.n, 0)}/${total} documents).`
  );

  if (unmatched.length) {
    console.log(`\n⚠️  ${unmatched.length} types tombent en « autre_document » — ce sont eux qui manquent au classifier :`);
    for (const r of unmatched) {
      console.log(`   ${padLeft(r.n, 5)} × ${r.type}`);
    }
  }

  // Les clés de métadonnées disent ce qu'on pourra extraire sans lire le PDF.
  // La forme exacte des entrées n'est pas documentée : on affiche un échantillon
  // brut avant d'agréger, pour ne pas agréger sur un champ qui n'existe pas.
  const sample = await db.query(`
    SELECT metadata
    FROM documents
    WHERE jsonb_typeof(metadata) = 'array' AND jsonb_array_length(metadata) > 0
    LIMIT 2
  `).catch(() => ({ rows: [] }));

  console.log(`\n─── Métadonnées : échantillon brut ───`);
  if (sample.rows.length) {
    for (const r of sample.rows) {
      console.log("   " + JSON.stringify(r.metadata).slice(0, 600));
    }
  } else {
    console.log("   (aucun document ne porte de métadonnées)");
  }

  const meta = await db.query(`
    SELECT key, COUNT(*)::int AS n
    FROM documents, LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(metadata) = 'array' THEN metadata ELSE '[]'::jsonb END
    ) AS item, LATERAL (
      -- Metadata = {name: LocalizedString, values: [string]} (fineapi-v1.yaml).
      -- Le champ name est un objet : le lire comme une chaine ne rend jamais rien.
      SELECT COALESCE(
        item->'name'->>'fr', item->'name'->>'nl',
        item->'name'->>'en', item->'name'->>'de'
      ) AS key
    ) k
    WHERE k.key IS NOT NULL
    GROUP BY key
    ORDER BY n DESC
    LIMIT 40
  `).catch(() => ({ rows: [] }));

  if (meta.rows.length) {
    console.log(`\n─── Clés de métadonnées présentes (exploitables sans lire le PDF) ───`);
    for (const r of meta.rows) {
      console.log(`   ${padLeft(r.n, 6)} × ${r.key}`);
    }
  } else {
    console.log(`\n(Aucune métadonnée nommée exploitable — tout devra venir de la lecture du PDF.)`);
  }

  console.log();
  await db.end();
}

main().catch(async (error) => {
  console.error("Échec :", error);
  await db.end().catch(() => {});
  process.exit(1);
});
