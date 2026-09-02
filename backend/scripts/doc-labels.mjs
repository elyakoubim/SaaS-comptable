/**
 * Extrait les libellés de type de document dans les quatre langues du SPF.
 *
 * `docType.name` est un LocalizedString belgif `{nl, fr, de, en}` : l'API livre
 * les quatre langues dans la même réponse. `pickLocalized()` n'en garde qu'une
 * et jette les autres, ce qui rend l'interface monolingue alors que la matière
 * multilingue est gratuite.
 *
 * Ce script rejoue une recherche S01 par mandant et imprime, pour chaque type
 * rencontré, le libellé dans les quatre langues — de quoi alimenter directement
 * les traductions du tableau de bord et des notifications.
 *
 * Usage (Render Web Shell, depuis backend/) :
 *   npm run docs:labels
 *
 * ⚠️ Quota SPF : 1 recherche / 10 min / dossier. Avec deux mandants, compter
 * ~10 minutes. Lancer en détaché :
 *   nohup npm run docs:labels &>/tmp/labels.log &
 */

import "../src/config/env.js";
import { db } from "../src/config/db.js";
import { getValidAccessToken } from "../src/services/fpsAuth.service.js";
import { searchDocuments } from "../src/services/myMinfinClient.service.js";

const SEARCH_COOLDOWN_MS = 10 * 60 * 1000 + 15_000;
const LANGS = ["fr", "nl", "de", "en"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function since(days = 55) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  const { rows: mandants } = await db.query(
    `SELECT DISTINCT mandant_ecb FROM documents ORDER BY mandant_ecb`
  );

  if (!mandants.length) {
    console.log("Aucun mandant avec des documents en base.");
    await db.end();
    return;
  }

  console.log(`\n═══ Libellés multilingues des types de documents ═══`);
  console.log(`${mandants.length} mandant(s) · une recherche chacun · quota 1/10 min\n`);

  /** @type {Map<string, {name: object, n: number}>} */
  const byType = new Map();

  for (const [index, { mandant_ecb: ecb }] of mandants.entries()) {
    if (index > 0) {
      console.log(`⏳ quota : attente 10 min avant la recherche suivante…`);
      await sleep(SEARCH_COOLDOWN_MS);
    }

    process.stdout.write(`Recherche sur ${ecb}… `);
    try {
      const token = await getValidAccessToken(ecb);
      const docs = await searchDocuments(token, ecb, since());
      console.log(`${docs.length} documents`);

      for (const doc of docs) {
        const name = doc?.raw?.docType?.name;
        if (!name || typeof name !== "object") continue;
        const key = JSON.stringify(LANGS.map((l) => name[l] ?? ""));
        const entry = byType.get(key);
        if (entry) entry.n += 1;
        else byType.set(key, { name, n: 1 });
      }
    } catch (error) {
      console.log(`❌ ${error.message}`);
    }
  }

  const types = [...byType.values()].sort((a, b) => b.n - a.n);
  console.log(`\n${types.length} types distincts.\n`);

  const missing = { fr: 0, nl: 0, de: 0, en: 0 };

  for (const { name, n } of types) {
    console.log("─".repeat(96));
    console.log(`(${n} document${n > 1 ? "s" : ""})`);
    for (const lang of LANGS) {
      const value = name[lang];
      if (!value) missing[lang] += 1;
      console.log(`  ${lang.toUpperCase()}  ${value || "— absent —"}`);
    }
  }

  console.log("─".repeat(96));
  console.log(`\nCouverture des traductions sur ${types.length} types :`);
  for (const lang of LANGS) {
    const have = types.length - missing[lang];
    console.log(
      `  ${lang.toUpperCase()} : ${have}/${types.length}` +
        (missing[lang] ? `  (${missing[lang]} sans traduction)` : "  ✅ complet")
    );
  }
  console.log();

  await db.end();
}

main().catch(async (error) => {
  console.error("Échec :", error);
  await db.end().catch(() => {});
  process.exit(1);
});
