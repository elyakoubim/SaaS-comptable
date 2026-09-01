/**
 * Harnais des scénarios de validation MyMinfin (S01 → S15).
 *
 * Rejoue les scénarios de test officiels du SPF Finances tels que définis dans
 * TECHNICAL_DOCUMENTATION_MMFAPI.docx, et produit un rapport à joindre au
 * formulaire « Validation-test to use MMF-API in PRD ».
 *
 * Usage (depuis backend/, avec les variables d'environnement du service) :
 *   node scripts/mmf-scenarios.mjs
 *
 * Prérequis : les mandants 0662348959 (PM1) et 0663895516 (PM2) doivent être
 * connectés dans l'application (représentant légal test.fediam-1090).
 *
 * ⚠️ Quota SPF : 1 recherche / 10 min / dossier. Le script attend de lui-même
 * entre deux recherches d'un même CBE, et respecte l'en-tête Retry-After sur 429.
 * Compter une vingtaine de minutes pour un déroulé complet.
 */

import "../src/config/env.js";
import crypto from "node:crypto";
import { fpsConfig } from "../src/config/fps.config.js";
import { findMandantByEcb } from "../src/repositories/mandant.repository.js";
import { refreshMandantByEcb } from "../src/services/fpsAuth.service.js";
import { decryptText } from "../src/utils/tokenCrypto.js";

const PM1 = "0662348959";
const PM2 = "0663895516";
const PM3 = "999998932";
const PP_SSIN = "01520605978";

const SEARCH_COOLDOWN_MS = 10 * 60 * 1000 + 15_000; // quota + marge
const lastSearchAt = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function yesterday() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Token d'accès valide pour un mandant, rafraîchi si nécessaire. */
async function accessTokenFor(ecb) {
  let mandant = await findMandantByEcb(ecb);
  if (!mandant) {
    throw new Error(`mandant ${ecb} absent — connecte-le dans l'app avant de lancer le script`);
  }
  const expiry = mandant.token_expiry ? new Date(mandant.token_expiry).getTime() : 0;
  if (!mandant.access_token_encrypted || expiry <= Date.now() + 60_000) {
    await refreshMandantByEcb(ecb);
    mandant = await findMandantByEcb(ecb);
  }
  return decryptText(mandant.access_token_encrypted);
}

/** Appel brut : les scénarios négatifs envoient volontairement des requêtes invalides. */
async function call(ecb, path, { accept = "application/json", isSearch = false } = {}) {
  if (isSearch) {
    const previous = lastSearchAt.get(ecb);
    if (previous) {
      const wait = SEARCH_COOLDOWN_MS - (Date.now() - previous);
      if (wait > 0) {
        console.log(`   ⏳ quota recherche ${ecb} : attente ${Math.ceil(wait / 1000)}s`);
        await sleep(wait);
      }
    }
    lastSearchAt.set(ecb, Date.now());
  }

  const token = await accessTokenFor(ecb);
  const correlationId = crypto.randomUUID();
  const url = new URL(path, fpsConfig.mmfBaseUrl);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "Minfin-Ws-Correlation": correlationId,
      "User-Agent": "Vatu/0.1 (+https://connect.vatu.be)"
    }
  });

  const contentType = response.headers.get("content-type") || "";
  let body = null;
  let bytes = 0;
  if (contentType.includes("json") || contentType.includes("problem")) {
    body = await response.json().catch(() => null);
  } else {
    bytes = (await response.arrayBuffer().catch(() => new ArrayBuffer(0))).byteLength;
  }

  if (response.status === 429) {
    const retryAfter = Number.parseInt(response.headers.get("Retry-After") || "60", 10);
    console.log(`   ⏳ 429 reçu : attente ${retryAfter}s puis nouvel essai`);
    await sleep((retryAfter + 5) * 1000);
    return call(ecb, path, { accept, isSearch });
  }

  return { status: response.status, contentType, body, bytes, correlationId };
}

const results = [];

async function scenario(id, description, expectation, run) {
  process.stdout.write(`\n${id} — ${description}\n`);
  try {
    const res = await run();
    const verdict = expectation(res);
    results.push({ id, description, status: res.status, ok: verdict.ok, note: verdict.note, correlationId: res.correlationId });
    console.log(`   ${verdict.ok ? "✅" : "❌"} HTTP ${res.status} — ${verdict.note}`);
  } catch (error) {
    results.push({ id, description, status: null, ok: false, note: error.message });
    console.log(`   ❌ erreur : ${error.message}`);
  }
}

const docs = { search: "/FineAPI/Generic/OAU/v2/documents", content: (u) => `/FineAPI/Generic/OAU/v2/documents/${u}/content` };
const D = {
  pm1Own: "662c6014-9f62-4956-acdc-0e25a233107d",
  ppNoOwnerParam: "63c407ac-f56f-4b28-b36b-4e1336d6be89",
  ppUboOnly: "e1c2ee09-6319-422f-b353-f043fca78f57",
  ppTooOld: "51f1f9ad-d4db-496d-b724-06f32b2a4647",
  pm3Big: "ef01ac97-e683-4d78-a001-6ebbbc03a4ed",
  invalidUuid: "ef01ac97-e683-4d78-a001-6ebbbc03a4ef"
};

async function main() {
  console.log("═══ Scénarios de validation MyMinfin — environnement", fpsConfig.env, "═══");
  console.log("Base URL :", fpsConfig.mmfBaseUrl);
  const since = yesterday();

  await scenario("S01", `PM1 — recherche sans filtre owner (since=${since})`,
    (r) => {
      const n = r.body?.items?.length ?? 0;
      return { ok: r.status === 200 && n > 2, note: `${n} documents (attendu : les documents de PP via mandat + les 2 propres à PM1)` };
    },
    () => call(PM1, `${docs.search}?since=${since}`, { isSearch: true }));

  await scenario("S02", "PM1 — recherche restreinte à PM1 lui-même",
    (r) => {
      const n = r.body?.items?.length ?? 0;
      return { ok: r.status === 200 && n >= 1, note: `${n} documents (attendu : uniquement ceux de PM1)` };
    },
    () => call(PM1, `${docs.search}?ownerType=CBE&ownerIdentifier=${PM1}&since=${since}`, { isSearch: true }));

  await scenario("S03", "PM1 — téléchargement d'un document lui appartenant",
    (r) => ({ ok: r.status === 200 && r.bytes > 0, note: `${r.bytes} octets, ${r.contentType}` }),
    () => call(PM1, docs.content(D.pm1Own), { accept: "application/pdf" }));

  await scenario("S04", "PM1 — document de PP sans préciser le propriétaire → 403 attendu",
    (r) => ({ ok: r.status === 403, note: r.status === 403 ? "403 Forbidden, conforme" : `attendu 403, reçu ${r.status}` }),
    () => call(PM1, docs.content(D.ppNoOwnerParam), { accept: "application/pdf" }));

  await scenario("S05", "PM1 — même document AVEC ownerType=SSIN → 200 attendu",
    (r) => ({ ok: r.status === 200 && r.bytes > 0, note: `${r.bytes} octets, ${r.contentType}` }),
    () => call(PM1, `${docs.content(D.ppNoOwnerParam)}?ownerType=SSIN&ownerIdentifier=${PP_SSIN}`, { accept: "application/pdf" }));

  await scenario("S06", "PM1 — recherche sur PM2 (aucun mandat) → 204 attendu",
    (r) => ({ ok: r.status === 204, note: r.status === 204 ? "204 No Content, conforme" : `attendu 204, reçu ${r.status}` }),
    () => call(PM1, `${docs.search}?ownerType=CBE&ownerIdentifier=${PM2}&since=${since}`, { isSearch: true }));

  await scenario("S07", "PM1 — document nécessitant un mandat UBO → 403 attendu",
    (r) => ({ ok: r.status === 403, note: r.status === 403 ? "403 Forbidden, conforme" : `attendu 403, reçu ${r.status}` }),
    () => call(PM1, `${docs.content(D.ppUboOnly)}?ownerType=SSIN&ownerIdentifier=${PP_SSIN}`, { accept: "application/pdf" }));

  await scenario("S08", "PM1 — document de plus de 60 jours → 403 attendu",
    (r) => ({ ok: r.status === 403, note: r.status === 403 ? "403 Forbidden, conforme" : `attendu 403, reçu ${r.status}` }),
    () => call(PM1, `${docs.content(D.ppTooOld)}?ownerType=SSIN&ownerIdentifier=${PP_SSIN}`, { accept: "application/pdf" }));

  await scenario("S09", "PM2 — recherche sans filtre (mandats de PM1 et PM3)",
    (r) => {
      const n = r.body?.items?.length ?? 0;
      return { ok: r.status === 200 && n >= 5, note: `${n} documents (attendu : 2 de PM1 + 3 de PM3 + 2 propres)` };
    },
    () => call(PM2, `${docs.search}?since=${since}`, { isSearch: true }));

  await scenario("S10", "PM2 — téléchargement d'un gros document (~20 Mo) de PM3",
    (r) => ({ ok: r.status === 200 && r.bytes > 1_000_000, note: `${(r.bytes / 1_048_576).toFixed(1)} Mo, ${r.contentType}` }),
    () => call(PM2, `${docs.content(D.pm3Big)}?ownerType=CBE&ownerIdentifier=${PM3}`, { accept: "application/pdf" }));

  await scenario("S11", "PM2 — UUID inexistant → 400 attendu",
    (r) => ({ ok: r.status === 400, note: `${r.status} — ${r.body?.detail || r.body?.title || "sans détail"}` }),
    () => call(PM2, `${docs.content(D.invalidUuid)}?ownerType=CBE&ownerIdentifier=${PM3}`, { accept: "application/pdf" }));

  await scenario("S12", "PM2 — ownerType=CBE avec un identifiant SSIN → 400 attendu",
    (r) => ({ ok: r.status === 400, note: `${r.status} — ${r.body?.detail || r.body?.title || "sans détail"}` }),
    () => call(PM2, `${docs.content(D.pm3Big)}?ownerType=CBE&ownerIdentifier=${PP_SSIN}`, { accept: "application/pdf" }));

  await scenario("S13", "PM2 — ownerType sans ownerIdentifier → 400 attendu",
    (r) => ({ ok: r.status === 400, note: `${r.status} — ${r.body?.detail || r.body?.title || "sans détail"}` }),
    () => call(PM2, `${docs.content(D.pm3Big)}?ownerType=CBE`, { accept: "application/pdf" }));

  await scenario("S14", "PM2 — ownerIdentifier sans ownerType → 400 attendu",
    (r) => ({ ok: r.status === 400, note: `${r.status} — ${r.body?.detail || r.body?.title || "sans détail"}` }),
    () => call(PM2, `${docs.content(D.pm3Big)}?ownerIdentifier=${PP_SSIN}`, { accept: "application/pdf" }));

  await scenario("S15", "PM2 — recherche sans since ni until → 400 attendu",
    (r) => ({ ok: r.status === 400, note: `${r.status} — ${r.body?.detail || r.body?.title || "sans détail"}` }),
    () => call(PM2, docs.search, { isSearch: true }));

  console.log("\n═══════════════════ RAPPORT ═══════════════════");
  for (const r of results) {
    console.log(`${r.ok ? "✅" : "❌"} ${r.id}  HTTP ${r.status ?? "—"}  ${r.description}`);
    console.log(`        ${r.note}${r.correlationId ? `  [correlationId ${r.correlationId}]` : ""}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} scénarios conformes.`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("Échec du harnais :", error);
  process.exit(1);
});
