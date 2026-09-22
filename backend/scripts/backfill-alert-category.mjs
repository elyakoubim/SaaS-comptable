/**
 * Backfill category / actionable pour les alertes créées avant l'ajout de ces
 * colonnes (23/09/2026, cf. database/schema.sql et vatu/decisions.md).
 *
 * classifyDocument() est calculé depuis longtemps (11/09) mais n'était pas
 * persisté avant ce changement : 6551 alertes ont category = NULL.
 *
 * Usage (Render Web Shell, service SaaS-comptable) :
 *   nohup node scripts/backfill-alert-category.mjs &>/tmp/backfill.log &
 * puis, pour suivre :
 *   tail -f /tmp/backfill.log
 *
 * Le Web Shell coupe la connexion avant la fin d'un script long — nohup + &
 * laisse le process tourner en arrière-plan (même pattern que mmf:scenarios,
 * documenté dans vatu/etat-des-lieux.md).
 */

import "../src/config/env.js";
import { db } from "../src/config/db.js";
import { classifyDocument } from "../src/services/documentClassifier.service.js";

const BATCH_SIZE = 500;

async function main() {
  console.log("[backfill] démarrage");

  const { rows: pending } = await db.query(
    "SELECT id, document_type_fps FROM alerts WHERE category IS NULL"
  );

  console.log(`[backfill] ${pending.length} alertes à traiter`);

  if (pending.length === 0) {
    console.log("[backfill] rien à faire");
    await db.end();
    return;
  }

  const perCategory = new Map();
  let actionableCount = 0;
  let updated = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    const values = [];
    const params = [];
    batch.forEach((row, idx) => {
      const { category, actionable } = classifyDocument(row.document_type_fps);
      perCategory.set(category, (perCategory.get(category) || 0) + 1);
      if (actionable) actionableCount += 1;

      const base = idx * 3;
      values.push(`($${base + 1}::uuid, $${base + 2}::text, $${base + 3}::boolean)`);
      params.push(row.id, category, actionable);
    });

    const query = `
      UPDATE alerts AS a
      SET category = d.category, actionable = d.actionable
      FROM (VALUES ${values.join(", ")}) AS d(id, category, actionable)
      WHERE a.id = d.id
    `;

    const result = await db.query(query, params);
    updated += result.rowCount;
    console.log(`[backfill] batch ${i / BATCH_SIZE + 1} : ${result.rowCount} lignes mises à jour (${updated}/${pending.length})`);
  }

  console.log("[backfill] terminé");
  console.log(`[backfill] total mis à jour : ${updated}`);
  console.log(`[backfill] actionable=true : ${actionableCount}`);
  console.log("[backfill] répartition par category :");
  for (const [category, count] of [...perCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category.padEnd(20)} ${count}`);
  }

  await db.end();
}

main().catch((error) => {
  console.error("[backfill] erreur fatale :", error);
  process.exitCode = 1;
});
