import { stripe, resolvePriceId, resolvePlanFromPriceId } from "../config/stripe.config.js";
import {
  setStripeCustomerId,
  findAccountantByStripeCustomerId,
  updateSubscriptionState
} from "../repositories/accountant.repository.js";

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

// Cree (ou reutilise) le Customer Stripe lie a ce comptable.
async function ensureStripeCustomer(accountant) {
  if (accountant.stripe_customer_id) {
    return accountant.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: accountant.email,
    name: accountant.full_name,
    metadata: { accountantId: accountant.id }
  });

  await setStripeCustomerId(accountant.id, customer.id);
  return customer.id;
}

// Cree une Checkout Session en mode abonnement avec essai de 14 jours et
// collecte obligatoire de la carte (debit automatique a la fin de l'essai,
// sauf annulation - cf. decision produit du 24/09/2026).
async function createCheckoutSession(accountant, { plan, interval }) {
  const priceId = resolvePriceId(plan, interval);
  const customerId = await ensureStripeCustomer(accountant);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      trial_period_days: 14,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" }
      },
      metadata: { accountantId: accountant.id, plan }
    },
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/billing/cancelled`
  });

  return session;
}

// Cree une session du Customer Portal Stripe (gestion/annulation en self-service).
async function createPortalSession(accountant) {
  const customerId = await ensureStripeCustomer(accountant);

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${frontendUrl()}/dashboard`
  });

  return session;
}

// Extrait l'etat d'abonnement pertinent d'un objet Subscription Stripe.
function extractSubscriptionState(subscription) {
  const firstItem = subscription.items?.data?.[0];
  const priceId = firstItem?.price?.id || null;
  const { plan } = priceId ? resolvePlanFromPriceId(priceId) : { plan: null };

  // Un abonnement annule/expire ne doit plus donner acces a rien.
  const activeStatuses = new Set(["trialing", "active", "past_due"]);
  const effectivePlan = activeStatuses.has(subscription.status) ? plan : null;

  return {
    stripeSubscriptionId: subscription.id,
    plan: effectivePlan,
    status: subscription.status,
    currentPeriodEnd: firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000)
      : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
  };
}

async function handleSubscriptionEvent(subscription) {
  const stripeCustomerId = String(subscription.customer);
  const state = extractSubscriptionState(subscription);

  const updated = await updateSubscriptionState(stripeCustomerId, state);
  if (!updated) {
    console.warn(
      `Webhook Stripe: aucun comptable trouve pour stripe_customer_id=${stripeCustomerId}`
    );
  }
  return updated;
}

async function handleSubscriptionDeleted(subscription) {
  const stripeCustomerId = String(subscription.customer);
  await updateSubscriptionState(stripeCustomerId, {
    stripeSubscriptionId: subscription.id,
    plan: null,
    status: "canceled",
    currentPeriodEnd: null,
    trialEnd: null
  });
}

// Point d'entree unique appele par la route webhook une fois la signature verifiee.
async function processWebhookEvent(event) {
  switch (event.type) {
    case "checkout.session.completed": {
      // La subscription est deja creee a ce stade; on relit son etat complet
      // plutot que de faire confiance au payload partiel de la session.
      const session = event.data.object;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await handleSubscriptionEvent(subscription);
      }
      break;
    }
    case "customer.subscription.updated": {
      await handleSubscriptionEvent(event.data.object);
      break;
    }
    case "customer.subscription.deleted": {
      await handleSubscriptionDeleted(event.data.object);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn(
        `Paiement echoue pour le client Stripe ${invoice.customer} (facture ${invoice.id})`
      );
      // Le statut d'abonnement (past_due, puis unpaid/canceled) arrive via les
      // evenements customer.subscription.updated qui suivent - rien a faire ici
      // de plus qu'un log pour l'instant.
      break;
    }
    default:
      break;
  }
}

// Un comptable a acces a "Lire avec l'IA" seulement sur Vatu Pro, et seulement
// si l'abonnement est en essai ou actif (pas expire/impaye/annule).
function hasProAccess(accountant) {
  const activeStatuses = new Set(["trialing", "active"]);
  return accountant.subscription_plan === "pro" && activeStatuses.has(accountant.subscription_status);
}

export {
  ensureStripeCustomer,
  createCheckoutSession,
  createPortalSession,
  processWebhookEvent,
  hasProAccess
};
