/**
 * Sauvegarde locale de l'inventaire des documents.
 *
 * La base PostgreSQL est sur un plan Free qui expire le 11/09/2026 : sa
 * suppression emporterait les 647 documents d'acceptation, leurs UUID et leurs
 * dates — c'est-à-dire la possibilité de retélécharger un échantillon plus tard.
 * Ce script en fait une copie locale.
 *
 * ⚠️ N'exporte AUCUN jeton : les colonnes access_token_encrypted,
 * refresh_token_encrypted et token_expiry sont volontairement exclues.
 *
 * Usage (depuis backend/) :
 *   node scripts/doc-export.mjs
 *
 * Produit documents-export.json dans le dossier courant.
 */

import "../src/config/env.js";
import fs from "node:fs";
import { db } from "../src/config/db.js";

const OUT = process.env.EXPORT_FILE || "documents-export.json";

async function main() {
  const documents = await db.query(`
    SELECT document_fps_id, mandant_ecb, owner_type, owner_identifier,
           document_type_fps, document_date, publish_date, metadata,
           first_seen_at, last_seen_at
    FROM documents
    ORDER BY document_type_fps, document_date DESC NULLS LAST
  `);

  // Pas de colonnes de jetons : on ne met aucun secret sur le disque.
  const mandants = await db.query(`
    SELECT ecb_number, company_name, status, consent_given_at, last_sync_at, created_at
    FROM mandants
    ORDER BY ecb_number
  `).catch(() => ({ rows: [] }));

  const payload = {
    exportedAt: new Date().toISOString(),
    environment: process.env.FPS_ENV || "inconnu",
    counts: {
      documents: documents.rows.length,
      types: new Set(documents.rows.map((r) => r.document_type_fps)).size,
      mandants: mandants.rows.length
    },
    mandants: mandants.rows,
    documents: documents.rows
  };

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Export écrit : ${OUT}`);
  console.log(`  ${payload.counts.documents} documents`);
  console.log(`  ${payload.counts.types} types distincts`);
  console.log(`  ${payload.counts.mandants} mandants (sans aucun jeton)`);
  console.log(`  ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko`);

  await db.end();
}

main().catch(async (error) => {
  console.error("Échec de l'export :", error.message);
  await db.end().catch(() => {});
  process.exit(1);
});
