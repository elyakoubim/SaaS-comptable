import crypto from "node:crypto";
import { db } from "../config/db.js";

async function createCabinet({ name }) {
  const query = `
    INSERT INTO cabinets (name)
    VALUES ($1)
    RETURNING id, name, subscription_plan, subscription_status
  `;
  const result = await db.query(query, [name || null]);
  return result.rows[0];
}

async function findCabinetById(cabinetId) {
  const query = `
    SELECT id, name, stripe_customer_id, stripe_subscription_id, subscription_plan,
           subscription_status, subscription_current_period_end, trial_end
    FROM cabinets
    WHERE id = $1::uuid
    LIMIT 1
  `;
  const result = await db.query(query, [cabinetId]);
  return result.rows[0] || null;
}

async function findCabinetByStripeCustomerId(stripeCustomerId) {
  const query = `
    SELECT id, name, stripe_customer_id, stripe_subscription_id, subscription_plan,
           subscription_status, subscription_current_period_end, trial_end
    FROM cabinets
    WHERE stripe_customer_id = $1
    LIMIT 1
  `;
  const result = await db.query(query, [stripeCustomerId]);
  return result.rows[0] || null;
}

async function setStripeCustomerId(cabinetId, stripeCustomerId) {
  const query = `
    UPDATE cabinets
    SET stripe_customer_id = $2
    WHERE id = $1::uuid
    RETURNING id, stripe_customer_id
  `;
  const result = await db.query(query, [cabinetId, stripeCustomerId]);
  return result.rows[0] || null;
}

// Meme forme que l'ancienne version sur accountants (cf. billing.service.js) -
// seule la cible change (cabinets, pas accountants).
async function updateSubscriptionState(
  stripeCustomerId,
  { stripeSubscriptionId, plan, status, currentPeriodEnd, trialEnd }
) {
  const query = `
    UPDATE cabinets
    SET stripe_subscription_id = $2,
        subscription_plan = $3,
        subscription_status = $4,
        subscription_current_period_end = $5,
        trial_end = $6
    WHERE stripe_customer_id = $1
    RETURNING id, name, subscription_plan, subscription_status
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

async function listMembers(cabinetId) {
  const query = `
    SELECT id, email, full_name, role, created_at
    FROM accountants
    WHERE cabinet_id = $1::uuid
    ORDER BY created_at ASC
  `;
  const result = await db.query(query, [cabinetId]);
  return result.rows;
}

// Token opaque simple (pas de JWT ici) : verifie par simple egalite en base,
// suffisant pour un lien d'invitation copie/colle a la main (cf. schema.sql).
function generateInvitationToken() {
  return crypto.randomBytes(24).toString("base64url");
}

async function createInvitation(cabinetId, email, createdByAccountantId) {
  const token = generateInvitationToken();
  const query = `
    INSERT INTO cabinet_invitations (cabinet_id, email, token, created_by)
    VALUES ($1::uuid, $2, $3, $4::uuid)
    RETURNING id, cabinet_id, email, token, created_at
  `;
  const result = await db.query(query, [cabinetId, String(email || "").toLowerCase(), token, createdByAccountantId]);
  return result.rows[0];
}

async function findInvitationByToken(token) {
  const query = `
    SELECT id, cabinet_id, email, token, created_by, created_at, accepted_at
    FROM cabinet_invitations
    WHERE token = $1
    LIMIT 1
  `;
  const result = await db.query(query, [token]);
  return result.rows[0] || null;
}

async function markInvitationAccepted(invitationId) {
  const query = `
    UPDATE cabinet_invitations
    SET accepted_at = NOW()
    WHERE id = $1::uuid
    RETURNING id, accepted_at
  `;
  const result = await db.query(query, [invitationId]);
  return result.rows[0] || null;
}

export {
  createCabinet,
  findCabinetById,
  findCabinetByStripeCustomerId,
  setStripeCustomerId,
  updateSubscriptionState,
  listMembers,
  createInvitation,
  findInvitationByToken,
  markInvitationAccepted
};
