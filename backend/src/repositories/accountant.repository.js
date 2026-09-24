import { db } from "../config/db.js";

async function ensureDemoAccount({ accountantId, email, passwordHash, fullName }) {
  const query = `
    INSERT INTO accountants (id, email, password_hash, full_name)
    VALUES ($1::uuid, $2, $3, $4)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name
  `;

  await db.query(query, [
    accountantId,
    String(email || "").toLowerCase(),
    passwordHash,
    fullName
  ]);
}

async function createAccountant({ email, passwordHash, fullName }) {
  const query = `
    INSERT INTO accountants (email, password_hash, full_name)
    VALUES ($1, $2, $3)
    RETURNING id, email, full_name, created_at
  `;

  const result = await db.query(query, [String(email || "").toLowerCase(), passwordHash, fullName]);
  return result.rows[0];
}

async function findAccountantByEmail(email) {
  const query = `
    SELECT id, email, password_hash, full_name, created_at
    FROM accountants
    WHERE email = $1
    LIMIT 1
  `;

  const result = await db.query(query, [String(email || "").toLowerCase()]);
  return result.rows[0] || null;
}

async function findAccountantById(accountantId) {
  const query = `
    SELECT id, email, password_hash, full_name, created_at,
           stripe_customer_id, stripe_subscription_id, subscription_plan,
           subscription_status, subscription_current_period_end, trial_end
    FROM accountants
    WHERE id = $1::uuid
    LIMIT 1
  `;

  const result = await db.query(query, [accountantId]);
  return result.rows[0] || null;
}

async function findAccountantByStripeCustomerId(stripeCustomerId) {
  const query = `
    SELECT id, email, full_name, stripe_customer_id, stripe_subscription_id,
           subscription_plan, subscription_status, subscription_current_period_end, trial_end
    FROM accountants
    WHERE stripe_customer_id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [stripeCustomerId]);
  return result.rows[0] || null;
}

async function setStripeCustomerId(accountantId, stripeCustomerId) {
  const query = `
    UPDATE accountants
    SET stripe_customer_id = $2
    WHERE id = $1::uuid
    RETURNING id, stripe_customer_id
  `;

  const result = await db.query(query, [accountantId, stripeCustomerId]);
  return result.rows[0] || null;
}

// Applique l'etat d'abonnement recu d'un evenement webhook Stripe.
// `plan` est null pour un abonnement annule/expire (on garde l'historique du
// dernier plan? non: on efface, car l'acces doit etre coupe immediatement).
async function updateSubscriptionState(
  stripeCustomerId,
  { stripeSubscriptionId, plan, status, currentPeriodEnd, trialEnd }
) {
  const query = `
    UPDATE accountants
    SET stripe_subscription_id = $2,
        subscription_plan = $3,
        subscription_status = $4,
        subscription_current_period_end = $5,
        trial_end = $6
    WHERE stripe_customer_id = $1
    RETURNING id, email, subscription_plan, subscription_status
  `;

  const result = await db.query(query, [
    stripeCustomerId,
    stripeSubscriptionId || null,
    plan || null,
    status || null,
    currentPeriodEnd || null,
    trialEnd || null
  ]);
  return result.rows[0] || null;
}

export {
  ensureDemoAccount,
  createAccountant,
  findAccountantByEmail,
  findAccountantById,
  findAccountantByStripeCustomerId,
  setStripeCustomerId,
  updateSubscriptionState
};
