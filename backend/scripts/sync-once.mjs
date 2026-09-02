/**
 * Synchronisation ponctuelle d'un mandant, sans BullMQ ni Redis.
 *
 * Le worker ne se déclenche qu'à l'heure pile (`0 * * * *`) et le front n'a
 * pas encore de bouton « Synchroniser » — `forceSync()` existe dans api.js mais
 * rien ne l'appelle. Ce script rejoue la même logique que
 * `processDocumentSyncJob`, en direct, pour un seul dossier.
 *
 * Usage (depuis backend/) :
 *   node scripts/sync-once.mjs 1022158878
 *   node scripts/sync-once.mjs 1022158878 30      # fenêtre de 30 jours
 *
 * ⚠️ Utilise le FPS_ENV du .env LOCAL. Pour synchroniser un mandant de
 * production, mettre FPS_ENV=prod dans backend/.env.
 */

import "../src/config/env.js";
import { fpsConfig } from "../src/config/fps.config.js";
import { db } from "../src/config/db.js";
import { getValidAccessToken } from "../src/services/fpsAuth.service.js";
import { searchDocuments } from "../src/services/myMinfinClient.service.js";
import { classifyDocument } from "../src/services/documentClassifier.service.js";
import { findMandantByEcb, updateLastSyncAt } from "../src/repositories/mandant.repository.js";
import { upsertDocument } from "../src/repositories/document.repository.js";
import { createAlert, existsForDocument } from "../src/repositories/alert.repository.js";

// Plusieurs CBE possibles ; le dernier argument numerique court est le nombre
// de jours. Defaut 60 : c'est la fenetre reelle du SPF, pas 7 comme le worker.
const ARGS = process.argv.slice(2);
const ECBS = ARGS.filter((a) => /^\d{10}$/.test(a));
const DAYS = Number.parseInt(ARGS.find((a) => /^\d{1,3}$/.test(a)) || "60", 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function syncOne(ECB) {

  console.log(`\n═══ Synchronisation de ${ECB} ═══`);
  console.log(`Environnement : ${fpsConfig.env} — ${fpsConfig.mmfBaseUrl}`);
  console.log(`Fenêtre : ${DAYS} jours\n`);

  const mandant = await findMandantByEcb(ECB);
  if (!mandant) {
    console.log(`❌ Mandant ${ECB} absent de la base — connecte-le dans l'app d'abord.`);
    return;
  }
  console.log(`Mandant : ${mandant.company_name || "(sans nom)"} · statut ${mandant.status}`);

  const since = new Date(Date.now() - DAYS * 86_400_000);
  let documents;
  try {
    documents = await searchDocuments(await getValidAccessToken(ECB), ECB, since);
  } catch (error) {
    if (!/429|quota|rate|too many/i.test(error.message)) throw error;
    console.log("   quota de recherche atteint — nouvel essai dans 10 min");
    await sleep(10 * 60 * 1000 + 15_000);
    documents = await searchDocuments(await getValidAccessToken(ECB), ECB, since);
  }

  console.log(`\n${documents.length} documents retournés par l'API.\n`);

  let created = 0;
  let withMetadata = 0;
  const types = new Map();

  for (const doc of documents) {
    if (!doc.uuid) continue;

    // Le champ metadata est vide en acceptation ; c'est la question ouverte
    // la plus lourde de conséquences pour l'offre payante.
    if (Array.isArray(doc.metadata) && doc.metadata.length > 0) withMetadata += 1;
    types.set(doc.documentType, (types.get(doc.documentType) || 0) + 1);

    const isNew = !(await existsForDocument(doc.uuid));

    await upsertDocument({
      documentFpsId: doc.uuid,
      mandantEcb: ECB,
      ownerType: doc.ownerType || "CBE",
      ownerIdentifier: doc.ownerIdentifier || ECB,
      documentTypeFps: doc.documentType,
      documentDate: doc.documentDate,
      publishDate: doc.publishDate,
      metadata: doc.raw
    });

    if (isNew) {
      const { level, titleKey } = classifyDocument(doc.documentType);
      await createAlert({
        mandantEcb: ECB,
        niveau: level,
        titre: `[${titleKey}] ${doc.documentType || "document"}`,
        detail: doc.documentDate ? `Date: ${doc.documentDate}` : null,
        documentFpsId: doc.uuid,
        documentTypeFps: doc.documentType,
        documentDate: doc.documentDate
      });
      created += 1;
    }
  }

  await updateLastSyncAt(ECB);

  console.log(`Enregistrés : ${documents.length} · nouvelles alertes : ${created}`);
  console.log(`Documents portant des métadonnées : ${withMetadata}/${documents.length}`);

  console.log(`\n─── Types rencontrés ───`);
  for (const [type, n] of [...types.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} × ${type}`);
  }

  if (documents.length) {
    console.log(`\n─── Premier document, brut (réponse API telle quelle) ───`);
    console.log(JSON.stringify(documents[0].raw, null, 2).slice(0, 2000));
  }

  console.log();
}

async function main() {
  if (!ECBS.length) {
    console.log("Usage : node scripts/sync-once.mjs <CBE> [<CBE>...] [jours]");
    process.exit(1);
  }
  for (const [i, ecb] of ECBS.entries()) {
    if (i > 0) await sleep(20_000);
    try {
      await syncOne(ecb);
    } catch (error) {
      console.log(`❌ ${ecb} : ${error.message}\n`);
    }
  }
  await db.end();
}

main().catch(async (error) => {
  console.error("Échec :", error.message);
  await db.end().catch(() => {});
  process.exit(1);
});
