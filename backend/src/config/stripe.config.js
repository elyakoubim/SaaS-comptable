import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY || "";

if (!secretKey) {
  console.warn("STRIPE_SECRET_KEY is not set. Billing operations will fail until configured.");
}

const stripe = new Stripe(secretKey, {
  apiVersion: "2024-06-20"
});

// "connect" = Vatu Connect (base, BYO-AI via MCP), "pro" = Vatu Pro (+ lecture IA par Vatu).
const priceIds = {
  connect: {
    monthly: process.env.STRIPE_PRICE_CONNECT_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_CONNECT_ANNUAL || ""
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || ""
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
