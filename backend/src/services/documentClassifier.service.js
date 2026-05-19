/**
 * Classifier MyMinfin : documentType (chaîne libre FR/NL) → niveau d'alerte + clé de titre.
 *
 * Le matching est case-insensitive par mots-clés. L'ordre d'évaluation va du plus
 * spécifique (compounds type "amende+tardif") au plus générique pour éviter qu'un
 * mot-clé court n'avale un cas plus précis.
 *
 * Le titre humainement lisible (et son i18n FR/NL/DE) sera composé côté appelant
 * à partir de la `titleKey` retournée — pas ici.
 */

/**
 * @typedef {Object} DocumentClassification
 * @property {'info'|'warning'|'critical'} level - Niveau d'alerte (CHECK constraint table alerts)
 * @property {string} titleKey - Clé symbolique du titre (ex: 'amende_depot_tardif')
 */

/**
 * @param {string} documentType - Le champ documentType brut MyMinfin
 * @returns {DocumentClassification}
 */
function classifyDocument(documentType) {
  const text = String(documentType || "").toLowerCase();

  if (
    (text.includes("amende") && text.includes("tardif")) ||
    (text.includes("boete") && text.includes("laat"))
  ) {
    return { level: "critical", titleKey: "amende_depot_tardif" };
  }

  if (text.includes("mise en demeure") || text.includes("ingebrekestelling")) {
    return { level: "critical", titleKey: "mise_en_demeure" };
  }

  if (text.includes("contrôle") || text.includes("controle")) {
    return { level: "critical", titleKey: "controle_fiscal" };
  }

  if (
    text.includes("décision") ||
    text.includes("decision") ||
    text.includes("beslissing")
  ) {
    return { level: "critical", titleKey: "decision_administrative" };
  }

  if (
    (text.includes("rappel") && (text.includes("tva") || text.includes("btw"))) ||
    text.includes("herinnering")
  ) {
    return { level: "warning", titleKey: "rappel_paiement_tva" };
  }

  if (
    text.includes("confirmation") ||
    text.includes("bevestiging") ||
    text.includes("aanslagbiljet")
  ) {
    return { level: "info", titleKey: "confirmation_declaration" };
  }

  return { level: "info", titleKey: "autre_document" };
}

export { classifyDocument };
