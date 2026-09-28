/**
 * Archivage des PDF sur Cloudflare R2 (S3-compatible, chiffré au repos par
 * défaut, pas de frais de sortie — cf. vatu/plan-v2.md).
 *
 * Comme Sentry (instrument.js) : je ne peux pas créer de compte Cloudflare
 * pour l'utilisateur ("Creating accounts" m'est interdit), donc cette
 * intégration est inerte tant que les variables R2_* ne sont pas configurées
 * — le comportement actuel (téléchargement à la demande depuis le SPF, sans
 * copie conservée) continue exactement comme avant.
 */
const accountId = process.env.R2_ACCOUNT_ID || "";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
const bucket = process.env.R2_BUCKET_NAME || "";

const isObjectStorageEnabled = Boolean(accountId && accessKeyId && secretAccessKey && bucket);

const objectStorageConfig = Object.freeze({
  accountId,
  accessKeyId,
  secretAccessKey,
  bucket,
  region: "auto",
  service: "s3",
  host: accountId ? `${accountId}.r2.cloudflarestorage.com` : ""
});

export { objectStorageConfig, isObjectStorageEnabled };
