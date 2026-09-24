import { createRequire } from "node:module";
import { anthropicClient, extractionModel } from "../config/anthropic.config.js";
import { CATEGORIES } from "./documentClassifier.service.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// "Lire avec l'IA" (Vatu Pro) ne se declenche que sur les categories ou un
// montant/echeance a du sens - inutile de payer pour extraire d'une
// attestation ou d'un accuse de reception qui n'en contiennent pas.
const ALLOWED_EXTRACTION_CATEGORIES = new Set([
  CATEGORIES.PAIEMENT,
  CATEGORIES.RECOUVREMENT,
  CATEGORIES.SANCTION,
  CATEGORIES.DECLARATION,
  CATEGORIES.CONTROLE
]);

// Plafond de caracteres envoyes a Claude, independant de la taille reelle du
// PDF : les documents MyMinfin sont des courriers administratifs courts
// (1-2 pages), ce plafond est deja large pour eux, et il protege le cout par
// document si un jour un PDF anormalement long passe par la.
const MAX_INPUT_CHARS = 8000;

const EXTRACTION_TOOL = {
  name: "extraction_resultat",
  description:
    "Enregistre les elements cles extraits d'un document administratif belge (montant, echeance, reference, accroche).",
  input_schema: {
    type: "object",
    properties: {
      montant: {
        type: ["string", "null"],
        description:
          "Le montant principal a payer ou concerne, tel qu'ecrit dans le document (ex: \"1234,56 EUR\"). null si absent."
      },
      date_echeance: {
        type: ["string", "null"],
        description: "La date limite ou d'echeance au format ISO YYYY-MM-DD. null si absente ou ambigue."
      },
      reference: {
        type: ["string", "null"],
        description: "La reference/numero de dossier du document, si visible. null sinon."
      },
      accroche: {
        type: "string",
        description:
          "Une phrase courte (12 mots maximum), en francais, qui resume pourquoi ce document merite d'etre ouvert. Doit se baser uniquement sur le contenu reel du document, jamais invente."
      }
    },
    required: ["montant", "date_echeance", "reference", "accroche"]
  }
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ExtractionUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionUnavailableError";
  }
}

class ExtractionNotEligibleError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExtractionNotEligibleError";
  }
}

function isEligibleCategory(category) {
  return ALLOWED_EXTRACTION_CATEGORIES.has(category);
}

/**
 * Extrait montant/echeance/reference/accroche d'un PDF via Claude Haiku.
 *
 * Ne leve jamais pour un souci de contenu (PDF illisible, reponse
 * inattendue) - retourne des champs a null avec une accroche de repli plutot
 * que de casser le clic "Lire avec l'IA" de l'utilisateur. Leve seulement si
 * la cle API est absente (erreur de configuration, pas de contenu) ou si la
 * categorie n'est pas eligible (erreur d'appel).
 */
async function extractAlertInsights({ pdfBuffer, category, titre }) {
  if (!isEligibleCategory(category)) {
    throw new ExtractionNotEligibleError(
      `La categorie "${category || "inconnue"}" n'est pas eligible a la lecture IA.`
    );
  }

  if (!anthropicClient) {
    throw new ExtractionUnavailableError("Lecture IA indisponible (configuration manquante).");
  }

  let text = "";
  try {
    const parsed = await pdfParse(pdfBuffer);
    text = String(parsed.text || "").trim();
  } catch (_error) {
    // PDF illisible (scan, format inattendu) : on retourne un resultat vide
    // plutot que de faire echouer la requete - l'utilisateur peut toujours
    // ouvrir le document lui-meme via "Voir le document".
    return {
      montant: null,
      dateEcheance: null,
      reference: null,
      accroche: "Document illisible automatiquement - ouvrez-le pour le consulter."
    };
  }

  if (!text) {
    return {
      montant: null,
      dateEcheance: null,
      reference: null,
      accroche: "Aucun texte detecte dans ce document - ouvrez-le pour le consulter."
    };
  }

  const excerpt = text.slice(0, MAX_INPUT_CHARS);

  const message = await anthropicClient.messages.create({
    model: extractionModel,
    max_tokens: 400,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Voici le texte d'un document administratif belge (categorie: ${category}, ` +
          `titre de l'alerte: "${titre || ""}"). Extrais uniquement les elements demandes, ` +
          `sans en inventer. Texte du document:\n\n${excerpt}`
      }
    ]
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || !toolUse.input) {
    return {
      montant: null,
      dateEcheance: null,
      reference: null,
      accroche: "Lecture automatique indisponible pour ce document."
    };
  }

  const { montant, date_echeance: dateEcheanceRaw, reference, accroche } = toolUse.input;
  const dateEcheance = ISO_DATE_PATTERN.test(String(dateEcheanceRaw || "")) ? dateEcheanceRaw : null;

  return {
    montant: montant ? String(montant).slice(0, 100) : null,
    dateEcheance,
    reference: reference ? String(reference).slice(0, 100) : null,
    accroche: accroche ? String(accroche).slice(0, 240) : "Ouvrez le document pour le consulter."
  };
}

export { extractAlertInsights, isEligibleCategory, ALLOWED_EXTRACTION_CATEGORIES, ExtractionUnavailableError, ExtractionNotEligibleError };
