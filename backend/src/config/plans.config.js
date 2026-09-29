// Catalogue des plans Vatu et de leurs plafonds de dossiers (28/09/2026,
// decision produit). Jusqu'ici, un seul plan "pro" existait, illimite en
// dossiers comme "connect" - un cabinet a 500 dossiers payait exactement le
// meme prix qu'un cabinet a 10, alors que le cout reel (extraction IA par
// document, cf. extraction.service.js) scale avec le volume. Vatu Connect
// reste illimite : un cabinet mono-utilisateur a une limite naturelle basse
// (une seule personne ne gere pas des centaines de dossiers), le risque y
// est donc negligeable. Vatu Pro devient trois paliers volumetriques,
// exactement la ou le cout variable et le multi-utilisateurs (qui permet a
// un cabinet de grossir sans limite) se rejoignent.
//
// Les plafonds sont volontairement des chiffres, pas un "illimite" litteral
// meme pour le palier le plus haut : Pro Firm plafonne a 1000, tres au-dessus
// de tout cabinet belge realiste (cible = 14 000 cabinets non-equipes, aucun
// n'approche ce volume), mais un vrai garde-fou technique plutot qu'une
// promesse qui ne serait pas totalement exacte - important aupres d'un public
// de comptables, sensible a la precision des chiffres.
const MANDANT_LIMITS = {
  connect: null,
  pro_starter: 50,
  pro_scale: 250,
  pro_firm: 1000
};

const PRO_PLANS = new Set(["pro_starter", "pro_scale", "pro_firm"]);
const ALL_PLANS = new Set(["connect", ...PRO_PLANS]);

function isProPlan(plan) {
  return PRO_PLANS.has(String(plan || ""));
}

// null = illimite (pas de plafond pour ce plan).
function getMandantLimit(plan) {
  const key = String(plan || "");
  return Object.prototype.hasOwnProperty.call(MANDANT_LIMITS, key) ? MANDANT_LIMITS[key] : null;
}

export { MANDANT_LIMITS, PRO_PLANS, ALL_PLANS, isProPlan, getMandantLimit };
