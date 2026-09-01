/**
 * Extrait les « valeurs de contrôle » des documents de test MyMinfin.
 *
 * Le formulaire « Test de validation pour l'utilisation de l'API MyMinFin en PRD »
 * demande le texte contenu dans chacun des documents téléchargés pendant les
 * scénarios. Ce script retélécharge les trois documents concernés (S03, S05, S10)
 * et en imprime le contenu textuel.
 *
 * Usage (depuis backend/) :
 *   npm install --no-save pdf-parse
 *   node scripts/mmf-control-values.mjs
 *
 * Quota FPS : 5 actions/min par dossier en acceptation. Le script espace ses appels.
 */

import "../src/config/env.js";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fpsConfig } from "../src/config/fps.config.js";
import { getValidAccessToken } from "../src/services/fpsAuth.service.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DOCS = [
  {
    scenario: "S03",
    label: "Document appartenant à PM1",
    ecb: "0662348959",
    uuid: "662c6014-9f62-4956-acdc-0e25a233107d",
    owner: null
  },
  {
    scenario: "S05",
    label: "Document de la personne physique, via mandat MYMINFIN",
    ecb: "0662348959",
    uuid: "63c407ac-f56f-4b28-b36b-4e1336d6be89",
    owner: { ownerType: "SSIN", ownerIdentifier: "01520605978" }
  },
  {
    scenario: "S10",
    label: "Document volumineux de PM3, via mandat BIZTAX",
    ecb: "0663895516",
    uuid: "ef01ac97-e683-4d78-a001-6ebbbc03a4ed",
    owner: { ownerType: "CBE", ownerIdentifier: "999998932" }
  }
];

async function download({ ecb, uuid, owner }) {
  const token = await getValidAccessToken(ecb);
  const url = new URL(
    `/FineAPI/Generic/OAU/v2/documents/${uuid}/content`,
    fpsConfig.mmfBaseUrl
  );
  if (owner) {
    url.searchParams.set("ownerType", owner.ownerType);
    url.searchParams.set("ownerIdentifier", owner.ownerIdentifier);
  }

  const correlationId = crypto.randomUUID();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/pdf",
      "Minfin-Ws-Correlation": correlationId,
      "User-Agent": "Vatu/0.1 (+https://connect.vatu.be)"
    }
  });

  if (response.status === 429) {
    const wait = Number.parseInt(response.headers.get("Retry-After") || "60", 10);
    console.log(`   ⏳ quota atteint, attente ${wait}s`);
    await sleep((wait + 5) * 1000);
    return download({ ecb, uuid, owner });
  }

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} (correlationId ${correlationId})`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "(inconnu)",
    correlationId
  };
}

async function main() {
  console.log("═══ Valeurs de contrôle des documents de test MyMinfin ═══");
  console.log("Environnement :", fpsConfig.env, "—", fpsConfig.mmfBaseUrl, "\n");

  for (const doc of DOCS) {
    console.log(`\n─────────────────────────────────────────────────────────`);
    console.log(`${doc.scenario} — ${doc.label}`);
    console.log(`UUID ${doc.uuid}`);

    try {
      const { buffer, contentType, correlationId } = await download(doc);
      console.log(`${buffer.length} octets · ${contentType} · correlationId ${correlationId}`);

      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").replace(/\r/g, "").split("\n")
        .map((l) => l.trim()).filter(Boolean).join("\n");

      console.log(`Pages : ${parsed.numpages}`);
      console.log("──── texte extrait ────");
      console.log(text.slice(0, 3000) || "(aucun texte extractible — document scanné ?)");
      if (text.length > 3000) {
        console.log(`… (${text.length - 3000} caractères supplémentaires non affichés)`);
      }
      console.log("──── fin ────");
    } catch (error) {
      console.log(`❌ ${error.message}`);
    }

    await sleep(15000); // quota : 5 actions/min/dossier en acceptation
  }

  console.log("\nTerminé.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Échec :", error);
  process.exit(1);
});
