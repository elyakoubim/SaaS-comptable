import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY || "";

if (!secretKey) {
  console.warn("STRIPE_SECRET_KEY is not set. Billing operations will fail until configured.");
}

const stripe = new Stripe(secretKey, {
  apiVersion: "2024-06-20"
});

// "connect" = Vatu Connect (centralisation seule, 1 utilisateur, sans IA,
// illimite en dossiers). "pro_*" = Vatu Pro (+ lecture IA, multi-utilisateurs),
// decline en 3 paliers volumetriques depuis le 28/09/2026 (cf.
// plans.config.js pour les plafonds) : pro_starter reprend exactement les
// variables d'env historiques de l'ancien plan unique "pro", pour ne rien
// changer a l'abonnement Stripe du client Pro deja existant.
const priceIds = {
  connect: {
    monthly: process.env.STRIPE_PRICE_CONNECT_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_CONNECT_ANNUAL || ""
  },
  pro_starter: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || ""
  },
  pro_scale: {
    monthly: process.env.STRIPE_PRICE_PRO_SCALE_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_PRO_SCALE_ANNUAL || ""
  },
  pro_firm: {
    monthly: process.env.STRIPE_PRICE_PRO_FIRM_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_PRO_FIRM_ANNUAL || ""
  }
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

function resolvePriceId(plan, interval) {
  const planPrices = priceIds[plan];
  if (!planPrices) {
    throw new Error(`Plan Stripe inconnu: ${plan}`);
  }
  const priceId = planPrices[interval];
  if (!priceId) {
    throw new Error(`Aucun price_id configure pour ${plan}/${interval}`);
  }
  return priceId;
}

// Retrouve (plan, interval) a partir d'un price_id Stripe recu via webhook.
function resolvePlanFromPriceId(priceId) {
  for (const [plan, intervals] of Object.entries(priceIds)) {
    for (const [interval, id] of Object.entries(intervals)) {
      if (id && id === priceId) {
        return { plan, interval };
      }
    }
  }
  return { plan: null, interval: null };
}

export { stripe, priceIds, webhookSecret, resolvePriceId, resolvePlanFromPriceId };
