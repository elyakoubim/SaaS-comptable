import { stripe, resolvePriceId, resolvePlanFromPriceId } from "../config/stripe.config.js";
import { isProPlan } from "../config/plans.config.js";
import {
  setStripeCustomerId,
  updateSubscriptionState
} from "../repositories/cabinet.repository.js";
import {
  hasEmailUsedTrial,
  hasFingerprintUsedTrial,
  recordTrialUsage
} from "../repositories/trialUsage.repository.js";

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

// Cree (ou reutilise) le Customer Stripe lie a ce cabinet. Un cabinet n'a pas
// d'email propre (seuls ses membres en ont un) : on utilise l'email/nom du
// comptable qui initie l'action (necessairement le owner, cf. garde dans
// billing.routes.js) pour la fiche client Stripe.
async function ensureStripeCustomer(cabinet, ownerEmail, ownerFullName) {
  if (cabinet.stripe_customer_id) {
    return cabinet.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email: ownerEmail,
    name: ownerFullName || cabinet.name || undefined,
    metadata: { cabinetId: cabinet.id }
  });

  await setStripeCustomerId(cabinet.id, customer.id);
  return customer.id;
}

// Cree une Checkout Session en mode abonnement avec essai de 14 jours et
// collecte obligatoire de la carte (debit automatique a la fin de l'essai,
// sauf annulation - cf. decision produit du 24/09/2026).
//
// Anti-abus (28/09/2026) : l'essai n'est accorde que si cet email n'en a
// jamais eu un (trial_usage, cf. schema.sql). Cote carte, rien n'est verifie
// ici - Stripe Checkout ne connait pas encore le moyen de paiement au moment
// de creer la session, seulement une fois que la personne l'a saisi. Ce
// second controle (meme carte, email different) se fait donc plus loin, dans
// le webhook checkout.session.completed, qui peut couper l'essai en cours de
// route si la carte a deja servi.
async function createCheckoutSession(cabinet, { plan, interval, ownerEmail, ownerFullName }) {
  const priceId = resolvePriceId(plan, interval);
  const customerId = await ensureStripeCustomer(cabinet, ownerEmail, ownerFullName);

  const alreadyTrialed = await hasEmailUsedTrial(ownerEmail);

  const subscriptionData = {
    metadata: { cabinetId: cabinet.id, plan }
  };
  if (!alreadyTrialed) {
    subscriptionData.trial_period_days = 14;
    subscriptionData.trial_settings = {
      end_behavior: { missing_payment_method: "cancel" }
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: subscriptionData,
    allow_promotion_codes: true,
    success_url: `${frontendUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl()}/billing/cancelled`
  });

  return session;
}

// Change le plan (connect <-> pro, ou l'intervalle) d'un abonnement Stripe deja
// actif, sans repasser par Checkout - inutile de redemander une carte deja
// enregistree. Contrairement a createCheckoutSession (nouvel abonnement), on
// met a jour l'item existant en place : un seul abonnement Stripe par cabinet,
// jamais de doublon. Pas de proration en periode d'essai (rien n'a encore ete
// facture), sinon Stripe calcule normalement le prorata.
async function changeSubscriptionPlan(cabinet, { plan, interval }) {
  if (!cabinet.stripe_subscription_id) {
    throw new Error("Aucun abonnement actif a modifier - utilisez createCheckoutSession");
  }

  const newPriceId = resolvePriceId(plan, interval);
  const subscription = await stripe.subscriptions.retrieve(cabinet.stripe_subscription_id);
  const currentItem = subscription.items?.data?.[0];
  if (!currentItem) {
    throw new Error("Abonnement Stripe sans ligne de facturation");
  }

  const updated = await stripe.subscriptions.update(cabinet.stripe_subscription_id, {
    items: [{ id: currentItem.id, price: newPriceId }],
    proration_behavior: subscription.status === "trialing" ? "none" : "create_prorations",
    metadata: { ...subscription.metadata, plan }
  });

  // Mise a jour immediate en base plutot que d'attendre le webhook
  // customer.subscription.updated (qui arrivera aussi, de facon idempotente) -
  // l'utilisateur doit voir son nouveau plan tout de suite dans l'app.
  const state = extractSubscriptionState(updated);
  return updateSubscriptionState(String(updated.customer), state);
}

// Annulation immediate (pas cancel_at_period_end) : utilisee uniquement pour
// la suppression de compte RGPD (cf. auth.routes.js) - le cabinet disparait
// de la base dans la foulee, un abonnement qui continuerait jusqu'a la fin de
// periode facturerait un client qui n'a plus de compte pour en profiter.
async function cancelSubscriptionImmediately(cabinet) {
  if (!cabinet.stripe_subscription_id) {
    return null;
  }
  return stripe.subscriptions.cancel(cabinet.stripe_subscription_id);
}

// Cree une session du Customer Portal Stripe (gestion/annulation en self-service).
async function createPortalSession(cabinet, { ownerEmail, ownerFullName }) {
  const customerId = await ensureStripeCustomer(cabinet, ownerEmail, ownerFullName);

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
      `Webhook Stripe: aucun cabinet trouve pour stripe_customer_id=${stripeCustomerId}`
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
        let subscription = await stripe.subscriptions.retrieve(session.subscription, {
          expand: ["default_payment_method"]
        });
        const customerId = String(subscription.customer);
        const fingerprint = subscription.default_payment_method?.card?.fingerprint || null;

        let email = null;
        try {
          const customer = await stripe.customers.retrieve(customerId);
          email = customer?.email || null;
        } catch (customerError) {
          console.warn(`Impossible de recuperer l'email du client Stripe ${customerId}:`, customerError.message);
        }

        // Meme carte deja utilisee pour un essai (sous ce compte ou un autre,
        // cf. trial_usage) : on coupe l'essai en cours de route, la
        // facturation demarre immediatement au lieu des 14 jours prevus.
        const fingerprintAlreadyUsed = fingerprint ? await hasFingerprintUsedTrial(fingerprint) : false;
        if (subscription.status === "trialing" && fingerprintAlreadyUsed) {
          subscription = await stripe.subscriptions.update(subscription.id, { trial_end: "now" });
        }

        if (email) {
          await recordTrialUsage({ email, cardFingerprint: fingerprint, stripeCustomerId: customerId });
        }

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

// Un cabinet a acces a "Lire avec l'IA" sur n'importe quel palier Vatu Pro
// (Starter/Scale/Firm, cf. plans.config.js - seul le plafond de dossiers les
// distingue, pas l'acces IA), et seulement si l'abonnement est en essai ou
// actif (pas expire/impaye/annule). Tous les membres du cabinet en
// beneficient (cf. decision multi-utilisateurs du 24/09/2026) : l'acces ne
// depend plus du comptable individuel.
function hasProAccess(cabinet) {
  const activeStatuses = new Set(["trialing", "active"]);
  return isProPlan(cabinet.subscription_plan) && activeStatuses.has(cabinet.subscription_status);
}

export {
  ensureStripeCustomer,
  createCheckoutSession,
  changeSubscriptionPlan,
  createPortalSession,
  cancelSubscriptionImmediately,
  processWebhookEvent,
  hasProAccess
};
