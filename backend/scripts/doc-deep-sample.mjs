/**
 * Échantillonne PLUSIEURS exemplaires d'un même type de document, et mesure ce
 * qu'on peut réellement en extraire.
 *
 * `doc-samples.mjs` prend **un** document par type, le plus récent. C'est ce qui
 * nous a induits en erreur : pour « Avis de paiement » — 1737 exemplaires, le
 * type le plus volumineux du jeu — il est tombé sur une copie appartenant au
 * mandant 0662348959, dont le SPF ne sert que des coquilles techniques. Nous en
 * avons conclu que le contenu de ce type était inconnu, alors que 1700 de ces
 * documents appartiennent à 0806154033, dont tous les échantillons sont de vrais
 * courriers.
 *
 * Ce script corrige ça : il prend N exemplaires, écarte les coquilles, et dit
 * pour chacun si un montant, une échéance, un IBAN et une communication
 * structurée sont présents. La sortie n'est donc pas un vidage de texte mais une
 * mesure — celle dont dépend la spécification du moteur d'extraction.
 *
 * Usage (depuis backend/) :
 *   node scripts/doc-deep-sample.mjs "avis de paiement" 5
 *   node scripts/doc-deep-sample.mjs "avis de paiement" 5 0806154033
 *   node scripts/doc-deep-sample.mjs sommation 4
 *
 * Arguments : <filtre sur le libellé> [nombre, défaut 5] [mandant, optionnel]
 *
 * ⚠️ Quota SPF en acceptation : 5 actions/min et par dossier. 15 s entre chaque
 * téléchargement. Compter ~15 s par document. Lancer en détaché si N est grand :
 *   nohup node scripts/doc-deep-sample.mjs "avis de paiement" 8 &>/tmp/deep.log &
 */

import "../src/config/env.js";
import { createRequire } from "node:module";
import fs from "node:fs";
import { format } from "node:util";
import { db } from "../src/config/db.js";
import { getValidAccessToken } from "../src/services/fpsAuth.service.js";
import { downloadDocument } from "../src/services/myMinfinClient.service.js";

const require = createRequire(import.meta.url);

const FILTER = String(process.argv[2] || "").toLowerCase();
const COUNT = Number.parseInt(process.argv[3] || "5", 10);
const MANDANT = String(process.argv[4] || "");
const PAUSE_MS = 15_000;
const EXCERPT = Number.parseInt(process.env.SAMPLE_CHARS || "1800", 10);

// Journal écrit par le script : une redirection PowerShell produirait de
// l'UTF-16 et abîmerait les accents.
const LOG_PATH = process.env.LOG_FILE || "deep-sample.log";
const JSON_PATH = process.env.SAMPLES_JSON || "deep-sample.json";
const logStream = fs.createWriteStream(LOG_PATH, { encoding: "utf8" });
const printToTerminal = console.log.bind(console);
console.log = (...args) => {
  const line = format(...args);
  printToTerminal(line);
  logStream.write(line + "\n");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameEntity = (a, b) =>
  String(a || "").replace(/^0+/, "") === String(b || "").replace(/^0+/, "");

/**
 * Une coquille technique du SPF : document de vérification de téléchargement,
 * sans aucun contenu métier. À écarter avant toute conclusion, sinon on mesure
 * du vide et on en déduit qu'un type ne porte rien.
 */
const STUB = /This document was generated the|You can communicate the code/i;

/**
 * Détecteurs calés sur ce que les documents contiennent réellement
 * (voir `vatu/anatomie-documents.md`) :
 *   - le symbole € précède le nombre : « € 14,00 », et non « 14,00 EUR » ;
 *   - deux formats de communication structurée coexistent, +++ et *** ;
 *   - les délais s'expriment en heures autant qu'en jours.
 */
const DETECTORS = {
  montant: /(?:€|EUR)\s*\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d{1,3}(?:[.\s]\d{3})*,\d{2}\s*(?:€|EUR)/,
  iban: /\bBE\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}\b/,
  communication: /\*{3}\d{3}\/\d{4}\/\d{5}\*{3}|\+{3}\d{3}\/\d{4}\/\d{5}\+{3}/,
  echeance:
    /\b\d+\s*(?:uur|heures?|u\.|jours?|dagen|kalenderdagen|werkdagen|maanden?|mois)\b|binnen\s+\d|dans\s+le\s+mois|avant\s+le\s+\d|uiterlijk|ten\s+laatste|au\s+plus\s+tard/i
};

function loadPdfParse() {
  try {
    return require("pdf-parse");
  } catch {
    console.log("⚠️  pdf-parse absent : npm install --no-save pdf-parse@1.1.1\n");
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

function detect(text) {
  const found = {};
  for (const [name, pattern] of Object.entries(DETECTORS)) {
    const match = pattern.exec(text || "");
    found[name] = match ? match[0].trim() : null;
  }
  return found;
}

async function main() {
  if (!FILTER) {
    console.log('Usage : node scripts/doc-deep-sample.mjs "<filtre>" [nombre] [mandant]');
    await db.end();
    process.exit(1);
  }

  const pdfParse = loadPdfParse();

  // On ne prend pas « les plus récents » : on répartit sur les mandants, en
  // commençant par ceux qui ont le plus d'exemplaires de ce type. C'est la
  // correction de fond par rapport à doc-samples.mjs.
  const { rows } = await db.query(
    `
    SELECT document_fps_id AS uuid, document_type_fps AS type, mandant_ecb,
           owner_type, owner_identifier, document_date,
           COUNT(*) OVER (PARTITION BY mandant_ecb) AS par_mandant
    FROM documents
    WHERE document_type_fps IS NOT NULL
      AND lower(document_type_fps) LIKE '%' || $1 || '%'
      AND ($2 = '' OR mandant_ecb = $2)
    ORDER BY par_mandant DESC, document_date DESC NULLS LAST
    LIMIT $3
  `,
    [FILTER, MANDANT, COUNT]
  );

  if (!rows.length) {
    console.log(`Aucun document ne correspond à « ${FILTER} »${MANDANT ? ` chez ${MANDANT}` : ""}.`);
    await db.end();
    return;
  }

  console.log(`\n═══ ${rows.length} exemplaire(s) · filtre « ${FILTER} » ═══`);
  console.log(`Type(s) : ${[...new Set(rows.map((r) => r.type))].join(" | ")}`);
  console.log(`Mandant(s) : ${[...new Set(rows.map((r) => r.mandant_ecb))].join(", ")}\n`);

  const collected = [];

  for (const [index, doc] of rows.entries()) {
    console.log("\n" + "═".repeat(100));
    console.log(`[${index + 1}/${rows.length}] ${doc.type}`);
    console.log(
      `mandant ${doc.mandant_ecb} · propriétaire ${doc.owner_type} ${doc.owner_identifier} · ` +
        `${doc.document_date ? new Date(doc.document_date).toISOString().slice(0, 10) : "sans date"}`
    );

    // Le propriétaire n'est à préciser que s'il diffère du mandant (S05 : sans
    // lui le SPF répond 403 ; S03 : inutile).
    const owner =
      doc.owner_type === "CBE" && sameEntity(doc.owner_identifier, doc.mandant_ecb)
        ? null
        : { ownerType: doc.owner_type, ownerIdentifier: doc.owner_identifier };

    const entry = {
      uuid: doc.uuid,
      type: doc.type,
      mandant: doc.mandant_ecb,
      documentDate: doc.document_date,
      bytes: null,
      contentType: null,
      isStub: null,
      found: null,
      text: null
    };

    try {
      const token = await getValidAccessToken(doc.mandant_ecb);
      const { content, contentType, extension } = await downloadDocument(token, doc.uuid, owner);
      entry.bytes = content.length;
      entry.contentType = contentType;
      console.log(`${content.length} octets · ${contentType}${extension ? ` (.${extension})` : ""}`);

      if (pdfParse && contentType === "application/pdf") {
        const parsed = await pdfParse(content);
        const text = tidy(parsed.text);
        entry.text = text;
        entry.isStub = STUB.test(text);

        if (entry.isStub) {
          console.log("⚠️  COQUILLE TECHNIQUE — aucun contenu métier, écartée de la mesure");
        } else {
          entry.found = detect(text);
          const summary = Object.entries(entry.found)
            .map(([k, v]) => `${v ? "✅" : "  "} ${k}${v ? ` : ${v}` : ""}`)
            .join("\n      ");
          console.log(`${parsed.numpages} page(s), ${text.length} caractères`);
          console.log("      " + summary);
          console.log("──── texte ────");
          console.log(text.slice(0, EXCERPT));
          if (text.length > EXCERPT) console.log(`… (${text.length - EXCERPT} caractères de plus)`);
          console.log("──── fin ────");
        }
      } else {
        console.log("(pas un PDF — extraction ignorée)");
      }
    } catch (error) {
      console.log(`❌ ${error.message}`);
    }

    collected.push(entry);
    if (index < rows.length - 1) await sleep(PAUSE_MS);
  }

  // Le verdict : c'est pour ça que le script existe.
  const real = collected.filter((e) => e.isStub === false && e.found);
  const stubs = collected.filter((e) => e.isStub === true);

  console.log("\n" + "═".repeat(100));
  console.log(`VERDICT — ${real.length} document(s) réel(s), ${stubs.length} coquille(s)`);

  if (!real.length) {
    console.log("Aucun exemplaire exploitable. Essayer un autre mandant en 3ᵉ argument.");
  } else {
    for (const champ of Object.keys(DETECTORS)) {
      const n = real.filter((e) => e.found[champ]).length;
      console.log(`  ${champ.padEnd(14)} ${n}/${real.length}`);
    }
    console.log(
      `\n➡️  ${
        real.every((e) => e.found.montant || e.found.echeance)
          ? "Ce type est ACTIONNABLE sur tous les exemplaires réels."
          : "Ce type est actionnable de façon inégale — relire les textes ci-dessus."
      }`
    );
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(collected, null, 1), "utf8");
  console.log(`\n${JSON_PATH} écrit · journal : ${LOG_PATH}\n`);
  await db.end();
}

main().catch(async (error) => {
  console.error("Échec :", error);
  await db.end().catch(() => {});
  process.exit(1);
});
