import { db } from "../config/db.js";

// Meme logique que password_reset_tokens : un seul token actif a la fois,
// une nouvelle demande (inscription ou renvoi) invalide silencieusement les
// precedentes.
async function invalidatePendingEmailVerificationTokens(accountantId) {
  await db.query(
    `UPDATE email_verification_tokens
     SET used_at = NOW()
     WHERE accountant_id = $1::uuid AND used_at IS NULL`,
    [accountantId]
  );
}

async function createEmailVerificationToken({ accountantId, tokenHash, expiresAt }) {
  const query = `
    INSERT INTO email_verification_tokens (accountant_id, token_hash, expires_at)
    VALUES ($1::uuid, $2, $3)
    RETURNING id, accountant_id, expires_at
  `;
  const result = await db.query(query, [accountantId, tokenHash, expiresAt]);
  return result.rows[0];
}

// Verification d'expiration en SQL (NOW()) plutot que cote code, meme
// raisonnement que findValidPasswordResetToken : pas d'ecart d'horloge
// possible entre la requete et le traitement.
async function findValidEmailVerificationToken(tokenHash) {
  const query = `
    SELECT id, accountant_id, expires_at, used_at
    FROM email_verification_tokens
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `;
  const result = await db.query(query, [tokenHash]);
  return result.rows[0] || null;
}

async function markEmailVerificationTokenUsed(tokenId) {
  await db.query(
    `UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1::uuid`,
    [tokenId]
  );
}

export {
  invalidatePendingEmailVerificationTokens,
  createEmailVerificationToken,
  findValidEmailVerificationToken,
  markEmailVerificationTokenUsed
};
