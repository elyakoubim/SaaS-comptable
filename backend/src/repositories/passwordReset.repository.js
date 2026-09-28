import { db } from "../config/db.js";

// Un seul token actif a la fois par comptable : une nouvelle demande de reset
// invalide silencieusement les precedentes (evite qu'un vieux lien traine
// dans une boite mail tout en restant valide).
async function invalidatePendingTokens(accountantId) {
  await db.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE accountant_id = $1::uuid AND used_at IS NULL`,
    [accountantId]
  );
}

async function createPasswordResetToken({ accountantId, tokenHash, expiresAt }) {
  const query = `
    INSERT INTO password_reset_tokens (accountant_id, token_hash, expires_at)
    VALUES ($1::uuid, $2, $3)
    RETURNING id, accountant_id, expires_at
  `;
  const result = await db.query(query, [accountantId, tokenHash, expiresAt]);
  return result.rows[0];
}

// Ne renvoie le token que s'il n'a jamais ete utilise et n'est pas expire -
// la verification d'expiration se fait en SQL (NOW()) plutot que cote code
// pour eviter tout ecart d'horloge entre la requete et le traitement.
async function findValidPasswordResetToken(tokenHash) {
  const query = `
    SELECT id, accountant_id, expires_at, used_at
    FROM password_reset_tokens
    WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
    LIMIT 1
  `;
  const result = await db.query(query, [tokenHash]);
  return result.rows[0] || null;
}

async function markPasswordResetTokenUsed(tokenId) {
  await db.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1::uuid`,
    [tokenId]
  );
}

export { createPasswordResetToken, findValidPasswordResetToken, markPasswordResetTokenUsed, invalidatePendingTokens };
