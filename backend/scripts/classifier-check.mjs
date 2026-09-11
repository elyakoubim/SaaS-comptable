/**
 * Vérifie le classificateur sur les 106 types réellement observés.
 *
 * Ne touche ni la base ni le SPF : il rejoue `classifyDocument()` sur
 * `labels-merged.json`, le relevé FR/NL/DE produit par `docs:labels`. C'est le
 * garde-fou qui a déjà attrapé deux erreurs :
 *   • « amende » matchait « amendement », et 81 demandes de documents
 *     partaient en alerte rouge ;
 *   • « vrijstelling » dans le libellé NL faisait passer 798 récapitulatifs
 *     de demande pour des décisions favorables.
 *
 * Usage (depuis backend/) :
 *   node scripts/classifier-check.mjs
 *   node scripts/classifier-check.mjs --critical    # n'affiche que les rouges
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDocument, buildAlertTitle } from "../src/services/documentClassifier.service.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABELS = process.env.LABELS_FILE || path.join(HERE, "..", "labels-merged.json");
const ONLY_CRITICAL = process.argv.includes("--critical");

if (!fs.existsSync(LABELS)) {
  console.error(`Relevé introuvable : ${LABELS}`);
  console.error("Le produire avec `npm run docs:labels` (quota SPF : 1 recherche / 10 min / dossier).");
  process.exit(1);
}

const types = JSON.parse(fs.readFileSync(LABELS, "utf8")).sort((a, b) => b.n - a.n);
const ICON = { critical: "🔴", warning: "🟠", info: "  " };

const countByLevel = { critical: 0, warning: 0, info: 0 };
const volumeByLevel = { critical: 0, warning: 0, info: 0 };
const unclassified = [];

for (const type of types) {
  const c = classifyDocument({ fr: type.fr, nl: type.nl, de: type.de });
  countByLevel[c.level] += 1;
  volumeByLevel[c.level] += type.n;
  if (c.titleKey === "autre_document") unclassified.push(type);

  if (ONLY_CRITICAL && c.level !== "critical") continue;
  console.log(
    `${ICON[c.level]} ${String(type.n).padStart(4)}  ${c.titleKey.padEnd(28)}` +
      ` ${c.category.padEnd(15)} ${buildAlertTitle(c.titleKey, type.fr).slice(0, 90)}`
  );
}

const total = types.reduce((sum, t) => sum + t.n, 0);
console.log(`\n─── ${types.length} types · ${total} documents ───`);
for (const level of ["critical", "warning", "info"]) {
  const share = ((volumeByLevel[level] * 100) / total).toFixed(1);
  console.log(
    `  ${level.padEnd(9)} ${String(countByLevel[level]).padStart(3)} types` +
      `  ${String(volumeByLevel[level]).padStart(5)} documents  (${share} %)`
  );
}

console.log(
  `\nNon classés : ${unclassified.length} type(s), ` +
    `${unclassified.reduce((s, t) => s + t.n, 0)} document(s)`
);
for (const t of unclassified) console.log(`   ${String(t.n).padStart(4)}  ${t.fr}`);

// Un taux de critique élevé est presque toujours le signe d'une règle trop
// large, pas d'un mandant en difficulté : sur le jeu d'acceptation il tourne
// autour de 5 %. Au-delà de 15 %, une règle a débordé.
const criticalShare = (volumeByLevel.critical * 100) / total;
if (criticalShare > 15) {
  console.log(`\n⚠️  ${criticalShare.toFixed(1)} % de documents en critique — une règle déborde probablement.`);
  process.exitCode = 1;
}
