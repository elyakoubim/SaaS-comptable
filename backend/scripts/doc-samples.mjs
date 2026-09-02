/**
 * Échantillonne un document réel par type MyMinfin et en extrait le texte.
 *
 * Objectif : concevoir l'affichage et les notifications du SaaS à partir du
 * contenu réel des documents, pas de suppositions. L'API du SPF ne fournit
 * aucune métadonnée (ni montant, ni échéance, ni référence de paiement) —
 * tout doit venir du PDF. Ce script montre où ces informations se trouvent
 * dans chaque famille de document.
 *
 * Usage (Render Web Shell, depuis backend/) :
 *   npm run docs:samples              # les 12 types les plus volumineux
 *   npm run docs:samples 25           # les 25 types les plus volumineux
 *   npm run docs:samples 5 sommation  # les types dont le libellé contient "sommation"
 *
 * ⚠️ Quota SPF en acceptation : 5 actions/min et par dossier. Le script espace
 * ses téléchargements de 15 s et respecte l'en-tête Retry-After sur 429.
 * Compter ~15 s par document.
 */

import "../src/config/env.js";
import { createRequire } from "node:module";
import { db } from "../src/config/db.js";
import { getValidAccessToken } from "../src/services/fpsAuth.service.js";
import { downloadDocument } from "../src/services/myMinfinClient.service.js";

const require = createRequire(import.meta.url);

const LIMIT = Number.parseInt(process.argv[2] || "12", 10);
const FILTER = (process.argv[3] || "").toLowerCase();
const PAUSE_MS = 15_000;
// Assez pour couvrir la premiere page : montant, echeance, reference de paiement.
const EXCERPT = Number.parseInt(process.env.SAMPLE_CHARS || "2400", 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "0662348959" et "662348959" désignent la même entreprise. */
const sameEntity = (a, b) =>
  String(a || "").replace(/^0+/, "") === String(b || "").replace(/^0+/, "");

function loadPdfParse() {
  try {
    return require("pdf-parse");
  } catch {
    console.log("⚠️  pdf-parse absent — installe-le puis relance :");
    console.log("      npm install --no-save pdf-parse@1.1.1\n");
    return null;
  }
}

function tidy(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const pdfParse = loadPdfParse();

  const { rows } = await db.query(
    `
    SELECT DISTINCT ON (document_type_fps)
      document_type_fps AS type,
      document_fps_id   AS uuid,
      mandant_ecb,
      owner_type,
      owner_identifier,
      document_date,
      (SELECT COUNT(*)::int FROM documents d2
        WHERE d2.document_type_fps IS NOT DISTINCT FROM d.document_type_fps) AS total
    FROM documents d
    WHERE document_type_fps IS NOT NULL
      AND ($1 = '' OR lower(document_type_fps) LIKE '%' || $1 || '%')
    ORDER BY document_type_fps, document_date DESC NULLS LAST
  `,
    [FILTER]
  );

  const picked = rows.sort((a, b) => b.total - a.total).slice(0, LIMIT);

  console.log(`\n═══ Échantillons de documents — ${picked.length} types ═══`);
  console.log(`(un exemplaire par type, le plus récent ; ~15 s entre chaque appel)\n`);

  for (const [index, doc] of picked.entries()) {
    console.log("\n" + "═".repeat(100));
    console.log(`[${index + 1}/${picked.length}] ${doc.type}`);
    console.log(
      `${doc.total} exemplaires en base · mandant ${doc.mandant_ecb} · ` +
        `propriétaire ${doc.owner_type} ${doc.owner_identifier} · ` +
        `${doc.document_date ? new Date(doc.document_date).toISOString().slice(0, 10) : "sans date"}`
    );
    console.log(`uuid ${doc.uuid}`);

    // Le propriétaire n'est à préciser que s'il diffère du mandant lui-même
    // (scénario S05 : sans lui, le SPF répond 403 ; scénario S03 : inutile).
    const owner =
      doc.owner_type === "CBE" && sameEntity(doc.owner_identifier, doc.mandant_ecb)
        ? null
        : { ownerType: doc.owner_type, ownerIdentifier: doc.owner_identifier };

    try {
      const token = await getValidAccessToken(doc.mandant_ecb);
      const { content, contentType, extension } = await downloadDocument(token, doc.uuid, owner);
      console.log(`${content.length} octets · ${contentType}${extension ? ` (.${extension})` : ""}`);

      if (!pdfParse) {
        console.log("(extraction de texte indisponible)");
      } else if (contentType !== "application/pdf") {
        console.log("(pas un PDF — extraction ignorée)");
      } else {
        const parsed = await pdfParse(content);
        const text = tidy(parsed.text);
        console.log(`${parsed.numpages} page(s), ${text.length} caractères de texte`);
        console.log("──── texte ────");
        console.log(text.slice(0, EXCERPT) || "(aucun texte extractible — document scanné ?)");
        if (text.length > EXCERPT) {
          console.log(`… (${text.length - EXCERPT} caractères non affichés)`);
        }
        console.log("──── fin ────");
      }
    } catch (error) {
      console.log(`❌ ${error.message}`);
    }

    if (index < picked.length - 1) {
      await sleep(PAUSE_MS);
    }
  }

  console.log("\n" + "═".repeat(100));
  console.log("Terminé.\n");
  await db.end();
}

main().catch(async (error) => {
  console.error("Échec :", error);
  await db.end().catch(() => {});
  process.exit(1);
});
