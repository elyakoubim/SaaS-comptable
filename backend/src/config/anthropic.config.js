import Anthropic from "@anthropic-ai/sdk";

// Cle absente en dev/test tant que la fonctionnalite n'est pas encore
// utilisee : on ne veut pas faire planter le boot du serveur pour ca, juste
// faire echouer proprement l'extraction elle-meme (cf. extraction.service.js).
const apiKey = process.env.ANTHROPIC_API_KEY || "";

// Haiku : la tache est une extraction structuree courte (montant, echeance,
// reference), pas un raisonnement complexe - inutile de payer pour un modele
// plus capable. Configurable au cas ou le choix doive changer sans redeploy
// de code.
const extractionModel = process.env.ANTHROPIC_EXTRACTION_MODEL || "claude-haiku-4-5-20251001";

const anthropicClient = apiKey ? new Anthropic({ apiKey }) : null;

export { anthropicClient, extractionModel };
