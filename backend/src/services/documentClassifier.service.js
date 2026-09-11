/**
 * Classificateur MyMinfin — calé sur les 106 types réellement observés.
 *
 * La version précédente reposait sur des mots-clés devinés avant d'avoir vu la
 * matière. Elle se trompait sur l'essentiel : « Avis de paiement », qui
 * représente 1722 documents sur 4137 (42 % du volume), tombait dans
 * `autre_document / info`, tandis que « Décision favorable Remboursement » —
 * une bonne nouvelle — remontait en `critical` parce qu'il contient
 * « décision ».
 *
 * Ce fichier est construit sur le relevé complet des types (voir
 * `libelles-multilingues.md` : 106 types, FR/NL/DE complets, EN jamais servi).
 *
 * ── Trois niveaux, une définition stricte ────────────────────────────────────
 *   critical : somme exigible, acte de recouvrement, sanction, ou défaut
 *              constaté. Ne rien faire a une conséquence financière ou
 *              juridique immédiate.
 *   warning  : un délai court. Soit l'administration demande quelque chose
 *              (renseignements, pièces, contrôle), soit un montant est dû mais
 *              n'est pas encore au contentieux.
 *   info     : pièce justificative, accusé de réception, attestation, copie de
 *              déclaration, décision favorable. À archiver, pas à traiter.
 *
 * ── Pourquoi on ne matche pas sur une seule langue ──────────────────────────
 * `docType.name` est un LocalizedString belgif `{nl, fr, de, en}`. Le SPF sert
 * les trois langues nationales dans la même réponse. On les concatène toutes
 * avant de matcher : un libellé FR modifié par le SPF n'emporte pas la
 * classification avec lui, le NL ou le DE rattrape.
 *
 * ── Pourquoi on normalise ───────────────────────────────────────────────────
 * Les libellés d'acceptation contiennent des gabarits non substitués
 * (`{FISC_EXERCISE_YEAR}`, `{DECLARATION_NUMBER}`). En production ils sont
 * remplacés par des valeurs. On retire donc les accolades ET les nombres :
 * le même type matche dans les deux environnements.
 */

/** @typedef {'info'|'warning'|'critical'} AlertLevel */

/**
 * @typedef {Object} DocumentClassification
 * @property {AlertLevel} level       Niveau d'alerte (contrainte CHECK de la table alerts)
 * @property {string} titleKey        Clé symbolique, traduite via TITLES
 * @property {string} category        Famille métier, pour le filtrage et les badges
 * @property {boolean} actionable     true si une action du comptable est attendue
 */

const CATEGORIES = Object.freeze({
  RECOUVREMENT: "recouvrement",
  SANCTION: "sanction",
  PAIEMENT: "paiement",
  CONTROLE: "controle",
  DECLARATION: "declaration",
  ATTESTATION: "attestation",
  ACCUSE: "accuse",
  DOUANE: "douane_accises",
  UBO: "ubo",
  ENREGISTREMENT: "enregistrement",
  AUTRE: "autre"
});

/**
 * Normalise un libellé pour le matching : minuscules, sans accents, sans
 * gabarits `{...}`, sans nombres, espaces compactés.
 */
function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\d+/g, " ")
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Construit la chaîne à matcher à partir d'un LocalizedString ou d'une chaîne.
 */
function buildHaystack(documentType) {
  if (documentType && typeof documentType === "object") {
    return ["fr", "nl", "de", "en"]
      .map((lang) => normalize(documentType[lang]))
      .filter(Boolean)
      .join(" | ");
  }
  return normalize(documentType);
}

/**
 * Règles ordonnées : la PREMIÈRE qui matche gagne.
 *
 * L'ordre n'est pas cosmétique. « Avertissement-extrait de rôle amende
 * administrative » doit être vu comme une amende avant d'être vu comme un
 * avertissement-extrait de rôle ordinaire ; « Décision favorable Remboursement »
 * doit être vu comme un remboursement avant d'être vu comme une décision.
 * Toute règle spécifique se place donc AVANT sa règle générique.
 *
 * @type {Array<{key: string, level: AlertLevel, category: string, actionable: boolean, match: RegExp}>}
 */
const RULES = [
  // ── 1. Recouvrement forcé ──────────────────────────────────────────────────
  // Le huissier est déjà passé ou va passer. Rien au-dessus.
  {
    key: "saisie_arret",
    level: "critical",
    category: CATEGORIES.RECOUVREMENT,
    actionable: true,
    match: /saisie arret|contre denonciation|tiers saisi|derdenbeslag|beslag onder derden|uitvoerend beslag|pfandung|drittschuldner/
  },
  {
    key: "frais_poursuites",
    level: "critical",
    category: CATEGORIES.RECOUVREMENT,
    actionable: true,
    match: /frais de poursuite|vervolgingskosten|verfolgungskosten/
  },
  {
    key: "sommation",
    level: "critical",
    category: CATEGORIES.RECOUVREMENT,
    actionable: true,
    match: /sommation|aanmaning|mahnung/
  },
  {
    key: "mise_en_demeure",
    level: "critical",
    category: CATEGORIES.RECOUVREMENT,
    actionable: true,
    match: /mise en demeure|ingebrekestelling|inverzugsetzung/
  },

  // ── 2. Sanctions ───────────────────────────────────────────────────────────
  // ⚠️ `\b…\b` n'est pas décoratif : sans les bornes de mot, « amende » matche
  // « amendement », et les 81 « Demande de documents pour la demande
  // d'amendement/invalidation d'une déclaration » partent en alerte rouge.
  {
    key: "amende_ubo",
    level: "critical",
    category: CATEGORIES.UBO,
    actionable: true,
    match: /ubo.*\b(amendes?|boetes?|geldbusse|bussgeld)\b/
  },
  {
    key: "amende_administrative",
    level: "critical",
    category: CATEGORIES.SANCTION,
    actionable: true,
    match: /\b(amendes?|boetes?|geldbusse|geldbussen|bussgeld)\b/
  },
  {
    key: "imposition_office",
    level: "critical",
    category: CATEGORIES.SANCTION,
    actionable: true,
    match: /imposition d'office|ambtshalve aanslag|ambtshalve|von amts wegen/
  },
  {
    key: "defaut_declaration",
    level: "critical",
    category: CATEGORIES.DECLARATION,
    actionable: true,
    match: /(rappel|herinnering|erinnerung).*(absence|non depot|geen aangifte|ontbrek|fehlen)|absence de declaration/
  },
  {
    key: "ubo_non_conformite",
    level: "critical",
    category: CATEGORIES.UBO,
    actionable: true,
    match: /non conformite|niet conformiteit|nichtkonformitat|niet-conformiteit/
  },
  // Les demandes UBO passent avant les demandes génériques pour garder leur
  // catégorie : le registre UBO n'est pas le même dossier que la fiscalité.
  {
    key: "ubo_demande_information",
    level: "warning",
    category: CATEGORIES.UBO,
    actionable: true,
    match: /\bubo\b.*(demande d'information|vraag om|informationsanfrage|inlichtingen)/
  },

  // ── 3. Contrôle et demandes de l'administration ────────────────────────────
  // Un délai de réponse court, et le silence se paie plus tard.
  {
    key: "controle_saf_t",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /saf t|saf-t|donnees comptables|boekhoudkundige gegevens|buchhaltungsdaten/
  },
  {
    key: "avis_rectification",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /avis de rectification|bericht van wijziging|berichtigungsbescheid|berichtigung/
  },
  {
    key: "demande_renseignements",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /demande de renseignement|vraag om inlichtingen|auskunftsersuchen|aanvraag om inlichtingen/
  },
  {
    key: "rapport_audit",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /rapport d'audit|auditverslag|auditbericht|audit operateur/
  },
  {
    key: "controle_douanier",
    level: "warning",
    category: CATEGORIES.DOUANE,
    actionable: true,
    match: /control douanier|controle douanier|douanecontrole|zollkontrolle|pci/
  },
  {
    key: "documents_manquants",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /documents manquants|ontbrekende documenten|fehlende dokumente/
  },
  {
    key: "demande_documents",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /demande de documents|demande d'informations supplementaires|informations supplementaires|bijkomende inlichtingen|aanvullende informatie|zusatzliche informationen|zusatzliche auskunfte/
  },

  // ── 4. Décisions défavorables et préavis ───────────────────────────────────
  // « Intention de refus » et « avertissement d'une possible décision négative »
  // ouvrent un droit d'être entendu : c'est une fenêtre, pas une fatalité.
  {
    key: "intention_refus",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /intention de refus|avertissement d'une possible decision negative|voornemen tot weigering|mogelijke negatieve beslissing|absicht.*ablehnung/
  },
  {
    key: "refus_demande",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /^refus |refus de la demande|weigering van de aanvraag|ablehnung des antrags/
  },

  // ── 5. Argent à payer ──────────────────────────────────────────────────────
  // Spécifique d'abord : l'article 415 signale des intérêts de retard.
  {
    key: "avis_paiement_interets",
    level: "warning",
    category: CATEGORIES.PAIEMENT,
    actionable: true,
    match: /en cas d'application de l'article|in geval van toepassing van artikel|im falle der anwendung von artikel/
  },
  {
    key: "invitation_payer",
    level: "warning",
    category: CATEGORIES.PAIEMENT,
    actionable: true,
    match: /invitation a payer|uitnodiging tot betaling|zahlungsaufforderung zur/
  },
  {
    key: "avis_paiement",
    level: "warning",
    category: CATEGORIES.PAIEMENT,
    actionable: true,
    match: /avis de paiement|betaalbericht|zahlungsaufforderung/
  },

  // ── 6. Bonnes nouvelles — AVANT les règles génériques ──────────────────────
  // « Décision favorable Remboursement » contient « décision » : sans cette
  // règle placée ici, elle remonterait en alerte.
  {
    key: "remboursement",
    level: "info",
    category: CATEGORIES.PAIEMENT,
    actionable: false,
    match: /remboursement|terugbetaling|erstattung|imputation d'un remboursement/
  },
  // ⚠️ Ne PAS mettre « exonération / vrijstelling / Befreiung » ici : le
  // deuxième type le plus volumineux (798 documents) est un récapitulatif de
  // demande d'attestation de non-activité dont le libellé NL contient
  // « vrijstelling van de bijdrage ». Ce n'est pas une décision, c'est un accusé.
  {
    key: "decision_favorable",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /decision favorable|gunstige beslissing|positive entscheidung|\bubo\b.*\b(exemption|vrijstelling|befreiung)\b/
  },
  {
    key: "acceptation_recevabilite",
    level: "info",
    category: CATEGORIES.ACCUSE,
    actionable: false,
    match: /acceptation de la recevabilite|ontvankelijkheid|zulassigkeit|validation de la demande|validatie van de aanvraag/
  },

  // ── 7. L'avertissement-extrait de rôle ordinaire ───────────────────────────
  // Il porte le montant de l'impôt et sa date d'échéance. Les variantes
  // « amende administrative » sont déjà parties en critical plus haut.
  {
    key: "avertissement_extrait_role",
    level: "warning",
    category: CATEGORIES.PAIEMENT,
    actionable: true,
    match: /avertissement.?extrait de role|aanslagbiljet|steuerbescheid/
  },

  // ── 8. Déclarations et propositions ────────────────────────────────────────
  {
    key: "proposition_declaration",
    level: "warning",
    category: CATEGORIES.DECLARATION,
    actionable: true,
    match: /proposition de declaration|voorstel van vereenvoudigde aangifte|voorstel van aangifte|vorschlag.*erklarung/
  },
  {
    key: "proposition_accord",
    level: "warning",
    category: CATEGORIES.CONTROLE,
    actionable: true,
    match: /proposition d'accord|voorstel tot akkoord|einigungsvorschlag/
  },
  {
    key: "reclamation",
    level: "info",
    category: CATEGORIES.CONTROLE,
    actionable: false,
    match: /reclamation|bezwaarschrift|bezwaar|beschwerde/
  },
  // ── 9. Accusés de réception ────────────────────────────────────────────────
  // Avant la règle « déclaration » : un accusé de réception d'une déclaration
  // reste un accusé de réception, pas une déclaration.
  {
    key: "accuse_reception",
    level: "info",
    category: CATEGORIES.ACCUSE,
    actionable: false,
    match: /accuse de reception|accusee de reception|ontvangstbewijs|ontvangstbevestiging|empfangsbestatigung/
  },
  {
    key: "declaration_deposee",
    level: "info",
    category: CATEGORIES.DECLARATION,
    actionable: false,
    match: /pdf de la declaration|declaration de stock|declaration des droits d'accises|declaration fiscale|declaration cadastre|formulaire de declaration|aangifte|erklarung/
  },

  // ── 10. Attestations, agréments, autorisations ─────────────────────────────
  {
    key: "attestation",
    level: "info",
    category: CATEGORIES.ATTESTATION,
    actionable: false,
    match: /attestation|attest|bescheinigung|agrement|erkenning|autorisation|vergunning|genehmigung|recapitulatif de votre demande|samenvatting van uw aanvraag|zusammenfassung ihres antrags/
  },
  {
    key: "acte_caution",
    level: "info",
    category: CATEGORIES.DOUANE,
    actionable: false,
    match: /acte de caution|borgtocht|burgschaft/
  },

  // ── 11. Enregistrement (baux, cadastre) ────────────────────────────────────
  {
    key: "enregistrement",
    level: "info",
    category: CATEGORIES.ENREGISTREMENT,
    actionable: false,
    match: /contrat de bail|huurcontract|mietvertrag|etat des lieux|plaatsbeschrijving|extrait cadastral|kadastraal uittreksel|enregistrement|registratie/
  },

  // ── 11 bis. Le reste identifiable ──────────────────────────────────────────
  // Ces règles ne servent qu'à vider la catégorie fourre-tout : sans elles,
  // 242 documents (dont les 192 XML CbC) ressortent en « autre_document ».
  {
    key: "declaration_internationale",
    level: "info",
    category: CATEGORIES.DECLARATION,
    actionable: false,
    match: /\b(cbc|pillar|dac|mdr|gir)\b|country by country/
  },
  {
    key: "versements_anticipes",
    level: "info",
    category: CATEGORIES.PAIEMENT,
    actionable: false,
    match: /versements anticipes|voorafbetaling|vorauszahlung/
  },
  {
    key: "correspondance",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /reponse a votre contact|antwoord op uw|antwort auf ihre/
  },
  {
    key: "depot_myminfin",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /fichier telecharge|opgeladen|geupload|hochgeladen/
  },
  {
    key: "apercu_donnees",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /apercu des donnees|overzicht van de|ubersicht der/
  },
  {
    key: "demande_avantage",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /^demande |aanvraag |antrag /
  },

  // ── 12. Pièces jointes ─────────────────────────────────────────────────────
  // Volontairement en avant-dernier : « Annexe - Attestation de non-activité »
  // doit d'abord être vue comme une attestation.
  {
    key: "annexe",
    level: "info",
    category: CATEGORIES.AUTRE,
    actionable: false,
    match: /^annexe|annexe |bijlage|anlage|supporting document|autres annexes|conventions|rapports et deliberations|tableau d'amortissement|depenses non admises|plan de reorganisation|indemnite kilometrique/
  }
];

/**
 * Libellés des clés, dans les trois langues nationales.
 * Servent au titre de l'alerte : `[demande_renseignements] Machin` n'est pas
 * un titre montrable à un comptable.
 */
const TITLES = Object.freeze({
  saisie_arret: { fr: "Saisie-arrêt", nl: "Beslag onder derden", de: "Pfändung" },
  frais_poursuites: { fr: "Frais de poursuites", nl: "Vervolgingskosten", de: "Verfolgungskosten" },
  sommation: { fr: "Sommation de payer", nl: "Aanmaning tot betaling", de: "Zahlungsmahnung" },
  mise_en_demeure: { fr: "Mise en demeure", nl: "Ingebrekestelling", de: "Inverzugsetzung" },
  amende_ubo: { fr: "Amende UBO", nl: "UBO-boete", de: "UBO-Geldbuße" },
  amende_administrative: { fr: "Amende administrative", nl: "Administratieve boete", de: "Verwaltungsgeldbuße" },
  imposition_office: { fr: "Imposition d'office", nl: "Ambtshalve aanslag", de: "Veranlagung von Amts wegen" },
  defaut_declaration: { fr: "Absence de déclaration", nl: "Ontbrekende aangifte", de: "Fehlende Erklärung" },
  ubo_non_conformite: { fr: "Non-conformité UBO", nl: "UBO niet-conformiteit", de: "UBO-Nichtkonformität" },
  controle_saf_t: { fr: "Demande de données comptables (SAF-T)", nl: "Vraag boekhoudkundige gegevens (SAF-T)", de: "Anforderung Buchhaltungsdaten (SAF-T)" },
  avis_rectification: { fr: "Avis de rectification", nl: "Bericht van wijziging", de: "Berichtigungsbescheid" },
  demande_renseignements: { fr: "Demande de renseignements", nl: "Vraag om inlichtingen", de: "Auskunftsersuchen" },
  rapport_audit: { fr: "Rapport d'audit", nl: "Auditverslag", de: "Auditbericht" },
  controle_douanier: { fr: "Contrôle douanier", nl: "Douanecontrole", de: "Zollkontrolle" },
  documents_manquants: { fr: "Documents manquants", nl: "Ontbrekende documenten", de: "Fehlende Dokumente" },
  demande_documents: { fr: "Demande de documents", nl: "Vraag om documenten", de: "Dokumentenanforderung" },
  ubo_demande_information: { fr: "Demande d'information UBO", nl: "UBO-informatieaanvraag", de: "UBO-Informationsanfrage" },
  declaration_internationale: { fr: "Déclaration internationale (CbC / Pillar 2 / DAC)", nl: "Internationale aangifte (CbC / Pillar 2 / DAC)", de: "Internationale Erklärung (CbC / Pillar 2 / DAC)" },
  versements_anticipes: { fr: "Versements anticipés", nl: "Voorafbetalingen", de: "Vorauszahlungen" },
  correspondance: { fr: "Réponse du SPF", nl: "Antwoord van de FOD", de: "Antwort des FÖD" },
  depot_myminfin: { fr: "Fichier déposé via MyMinfin", nl: "Bestand via MyMinfin", de: "Datei über MyMinfin" },
  apercu_donnees: { fr: "Aperçu de données", nl: "Gegevensoverzicht", de: "Datenübersicht" },
  demande_avantage: { fr: "Demande introduite", nl: "Ingediende aanvraag", de: "Eingereichter Antrag" },
  intention_refus: { fr: "Intention de refus", nl: "Voornemen tot weigering", de: "Ablehnungsabsicht" },
  refus_demande: { fr: "Refus de la demande", nl: "Weigering van de aanvraag", de: "Ablehnung des Antrags" },
  avis_paiement_interets: { fr: "Avis de paiement avec intérêts", nl: "Betaalbericht met interesten", de: "Zahlungsaufforderung mit Zinsen" },
  invitation_payer: { fr: "Invitation à payer", nl: "Uitnodiging tot betaling", de: "Zahlungsaufforderung" },
  avis_paiement: { fr: "Avis de paiement", nl: "Betaalbericht", de: "Zahlungsaufforderung" },
  remboursement: { fr: "Remboursement", nl: "Terugbetaling", de: "Erstattung" },
  decision_favorable: { fr: "Décision favorable", nl: "Gunstige beslissing", de: "Positive Entscheidung" },
  acceptation_recevabilite: { fr: "Demande acceptée", nl: "Aanvraag aanvaard", de: "Antrag angenommen" },
  avertissement_extrait_role: { fr: "Avertissement-extrait de rôle", nl: "Aanslagbiljet", de: "Steuerbescheid" },
  proposition_declaration: { fr: "Proposition de déclaration", nl: "Voorstel van aangifte", de: "Erklärungsvorschlag" },
  proposition_accord: { fr: "Proposition d'accord", nl: "Voorstel tot akkoord", de: "Einigungsvorschlag" },
  reclamation: { fr: "Réclamation", nl: "Bezwaarschrift", de: "Beschwerde" },
  declaration_deposee: { fr: "Déclaration déposée", nl: "Ingediende aangifte", de: "Eingereichte Erklärung" },
  accuse_reception: { fr: "Accusé de réception", nl: "Ontvangstbevestiging", de: "Empfangsbestätigung" },
  attestation: { fr: "Attestation", nl: "Attest", de: "Bescheinigung" },
  acte_caution: { fr: "Acte de caution", nl: "Borgtochtakte", de: "Bürgschaftsurkunde" },
  enregistrement: { fr: "Enregistrement", nl: "Registratie", de: "Registrierung" },
  annexe: { fr: "Annexe", nl: "Bijlage", de: "Anlage" },
  autre_document: { fr: "Document", nl: "Document", de: "Dokument" }
});

const FALLBACK = Object.freeze({
  level: "info",
  titleKey: "autre_document",
  category: CATEGORIES.AUTRE,
  actionable: false
});

/**
 * Classe un document d'après son type.
 *
 * @param {string|{fr?: string, nl?: string, de?: string, en?: string}} documentType
 *        Soit le libellé déjà choisi dans une langue, soit — de préférence — le
 *        LocalizedString complet renvoyé par le SPF (`docType.name`).
 * @returns {DocumentClassification}
 */
function classifyDocument(documentType) {
  const haystack = buildHaystack(documentType);
  if (!haystack) {
    return { ...FALLBACK };
  }

  for (const rule of RULES) {
    if (rule.match.test(haystack)) {
      return {
        level: rule.level,
        titleKey: rule.key,
        category: rule.category,
        actionable: rule.actionable
      };
    }
  }

  return { ...FALLBACK };
}

/**
 * Titre lisible d'une alerte : le libellé de la classe, puis le type brut du
 * SPF entre parenthèses quand il apporte quelque chose de plus.
 */
function buildAlertTitle(titleKey, rawType, lang = "fr") {
  const label = TITLES[titleKey]?.[lang] || TITLES[titleKey]?.fr || "Document";
  const raw = String(rawType || "").replace(/\{[^}]*\}/g, "").trim();
  if (!raw) return label;
  if (normalize(raw) === normalize(label)) return label;
  return `${label} — ${raw}`.slice(0, 300);
}

export { classifyDocument, buildAlertTitle, TITLES, CATEGORIES, RULES, normalize };
