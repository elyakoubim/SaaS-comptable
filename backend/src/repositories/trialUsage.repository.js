import { db } from "../config/db.js";

/**
 * Anti-abus de l'essai gratuit (28/09/2026, cf. schema.sql). Table
 * volontairement independante des cabinets/accountants : un cabinet supprime
 * (RGPD) ne doit pas effacer la trace qu'un essai a deja ete consomme, sinon
 * il suffirait de supprimer son compte et se reinscrire pour en obtenir un
 * autre.
 */

async function hasEmailUsedTrial(email) {
  if (!email) {
    return false;
  }
  const query = `SELECT 1 FROM trial_usage WHERE email = $1 LIMIT 1`;
  const result = await db.query(query, [String(email).toLowerCase()]);
  return result.rowCount > 0;
}

async function hasFingerprintUsedTrial(cardFingerprint) {
  if (!cardFingerprint) {
    return false;
  }
  const query = `SELECT 1 FROM trial_usage WHERE card_fingerprint = $1 LIMIT 1`;
  const result = await db.query(query, [cardFingerprint]);
  return result.rowCount > 0;
}

// Journal append-only : on enregistre a chaque checkout complete, que l'essai
// ait ete accorde ou non, pour que la prochaine tentative (autre email, meme
// carte, ou l'inverse) soit detectee.
async function recordTrialUsage({ email, cardFingerprint, stripeCustomerId }) {
  const query = `
    INSERT INTO trial_usage (email, card_fingerprint, stripe_customer_id)
    VALUES ($1, $2, $3)
  `;
  await db.query(query, [
    String(email || "").toLowerCase() || null,
    cardFingerprint || null,
    stripeCustomerId || null
  ]);
}

export { hasEmailUsedTrial, hasFingerprintUsedTrial, recordTrialUsage };
