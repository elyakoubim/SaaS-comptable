// Paliers Vatu (decision produit du 28/09/2026). Miroir frontend de
// backend/src/config/plans.config.js - duplique volontairement (bundles
// front/back separes) plutot que partage, donc toute evolution des plans doit
// etre reportee des deux cotes.
const PLAN_KEYS = ["connect", "pro_starter", "pro_scale", "pro_firm"];
const PRO_PLAN_KEYS = ["pro_starter", "pro_scale", "pro_firm"];

const PLAN_PRICES = {
  connect: { monthly: 19, annual: 16 },
  pro_starter: { monthly: 29, annual: 24 },
  pro_scale: { monthly: 59, annual: 49 },
  pro_firm: { monthly: 99, annual: 82 }
};

// Plafond de dossiers par plan ; null = illimite. Affiche dans BillingPage,
// utilise aussi pour construire le message d'erreur MANDANT_LIMIT_REACHED
// (cf. apiErrors.js).
const MANDANT_LIMITS = {
  connect: null,
  pro_starter: 50,
  pro_scale: 250,
  pro_firm: 1000
};

function isProPlan(plan) {
  return PRO_PLAN_KEYS.includes(String(plan || ""));
}

export { PLAN_KEYS, PRO_PLAN_KEYS, PLAN_PRICES, MANDANT_LIMITS, isProPlan };
