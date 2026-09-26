import { db } from "../config/db.js";

// Le compte demo peut ne pas encore exister (nouvel environnement) : dans ce
// cas il lui faut un cabinet, comme tout nouveau comptable (cabinet_id est
// NOT NULL depuis la migration multi-utilisateurs du 24/09/2026). Sur un
// compte deja existant, ON CONFLICT ne touche pas cabinet_id/role : on ne
// veut pas ecraser une eventuelle appartenance a un cabinet reel.
async function ensureDemoAccount({ accountantId, email, passwordHash, fullName }) {
  const existing = await db.query(`SELECT id, cabinet_id FROM accountants WHERE id = $1::uuid LIMIT 1`, [
    accountantId
  ]);

  // cabinet_id est NOT NULL : meme dans le cas ON CONFLICT DO UPDATE,
  // Postgres construit d'abord la ligne a inserer et rejetterait un NULL
  // avant meme d'atteindre la resolution de conflit. On reutilise donc le
  // cabinet_id existant plutot que de le laisser null.
  let cabinetId = existing.rows[0]?.cabinet_id || null;
  if (!cabinetId) {
    const cabinet = await db.query(
      `INSERT INTO cabinets (name) VALUES ($1) RETURNING id`,
      [fullName || "Cabinet demo"]
    );
    cabinetId = cabinet.rows[0].id;
  }

  const query = `
    INSERT INTO accountants (id, email, password_hash, full_name, cabinet_id, role)
    VALUES ($1::uuid, $2, $3, $4, $5::uuid, 'owner')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name
  `;

  await db.query(query, [
    accountantId,
    String(email || "").toLowerCase(),
    passwordHash,
    fullName,
    cabinetId
  ]);
}

async function createAccountant({ email, passwordHash, fullName, cabinetId, role = "owner" }) {
  if (!cabinetId) {
    throw new Error("cabinetId is required to create an accountant");
  }

  const query = `
    INSERT INTO accountants (email, password_hash, full_name, cabinet_id, role)
    VALUES ($1, $2, $3, $4::uuid, $5)
    RETURNING id, email, full_name, cabinet_id, role, created_at
  `;

  const result = await db.query(query, [
    String(email || "").toLowerCase(),
    passwordHash,
    fullName,
    cabinetId,
    role
  ]);
  return result.rows[0];
}

async function findAccountantByEmail(email) {
  const query = `
    SELECT id, email, password_hash, full_name, created_at, cabinet_id, role
    FROM accountants
    WHERE email = $1
    LIMIT 1
  `;

  const result = await db.query(query, [String(email || "").toLowerCase()]);
  return result.rows[0] || null;
}

async function findAccountantById(accountantId) {
  const query = `
    SELECT id, email, password_hash, full_name, created_at, cabinet_id, role
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
