/**
 * Backfill company_name pour les mandants existants (NULL en base) via la
 * BCE Public Search, une fois le webservice débloqué et KBO_WS_USERNAME /
 * KBO_WS_PASSWORD ajoutés à l'Environment Group vatu-shared (23/09/2026,
 * cf. vatu/decisions.md).
 *
 * Usage (Render Web Shell, service SaaS-comptable) :
 *   node scripts/backfill-company-name.mjs
 * (rapide, quelques mandants seulement — pas besoin de nohup/&)
 */
import "../src/config/env.js";
import { db } from "../src/config/db.js";
import { lookupCompanyNameByEcb } from "../src/services/bceClient.service.js";

async function main() {
  console.log("[backfill-company-name] démarrage");

  const { rows: pending } = await db.query(
    "SELECT ecb_number FROM mandants WHERE company_name IS NULL"
  );

  console.log(`[backfill-company-name] ${pending.length} mandant(s) à traiter`);

  if (pending.length === 0) {
    console.log("[backfill-company-name] rien à faire");
    await db.end();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const { ecb_number: ecbNumber } of pending) {
    const nom = await lookupCompanyNameByEcb(ecbNumber);
    if (!nom) {
      console.log(`[backfill-company-name] ${ecbNumber} : pas de nom trouvé (voir warning ci-dessus)`);
      failed += 1;
      continue;
    }
    await db.query("UPDATE mandants SET company_name = $1 WHERE ecb_number = $2", [nom, ecbNumber]);
    console.log(`[backfill-company-name] ${ecbNumber} -> "${nom}"`);
    updated += 1;
  }

  console.log(`[backfill-company-name] terminé : ${updated} mis à jour, ${failed} échec(s)`);
  await db.end();
}

main().catch((error) => {
  console.error("[backfill-company-name] erreur fatale :", error);
  process.exitCode = 1;
});
