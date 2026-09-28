import crypto from "node:crypto";

/**
 * Signature AWS Signature Version 4, implémentée à la main plutôt qu'avec
 * un SDK (@aws-sdk/client-s3 embarque ~15 sous-paquets) : l'installer sur ce
 * poste s'est déjà montré fragile (ENOTEMPTY sur le filesystem bridgé lors de
 * l'installation de @sentry/node). SigV4 est un algorithme stable et
 * documenté par AWS depuis 2013 ; Cloudflare R2 l'accepte tel quel derrière
 * une API compatible S3.
 *
 * Référence : https://docs.aws.amazon.com/general/latest/gr/sigv4-signing-process.html
 */

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

/**
 * Format ISO8601 compact exigé par SigV4 : `20260928T143000Z`.
 */
function toAmzDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Encode un chemin d'URI segment par segment (RFC 3986), sans toucher aux
 * `/` séparateurs — c'est ce que le "canonical URI" de SigV4 exige, et c'est
 * différent d'un simple `encodeURIComponent(path)` qui encoderait aussi les
 * `/`.
 */
function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeUriPath(path) {
  return path.split("/").map(encodeRfc3986).join("/");
}

/**
 * Construit une requête signée SigV4 pour un objet S3/R2 (GET ou PUT direct
 * sur un objet — pas de query string, pas de multipart).
 *
 * @param {Object} params
 * @param {'GET'|'PUT'} params.method
 * @param {string} params.host - ex: "abc123.r2.cloudflarestorage.com"
 * @param {string} params.path - ex: "/mon-bucket/documents/xxx" (commence par /)
 * @param {string} params.region - "auto" pour R2
 * @param {string} params.service - "s3"
 * @param {string} params.accessKeyId
 * @param {string} params.secretAccessKey
 * @param {Buffer} [params.body]
 * @param {Record<string,string>} [params.extraHeaders] - en-têtes additionnels, signés ET envoyés (ex: content-type)
 * @param {Date} [params.date] - injectable pour les tests ; sinon l'instant présent
 * @returns {{ url: string, headers: Record<string,string>, canonicalRequest: string, stringToSign: string }}
 */
function signS3Request({
  method,
  host,
  path,
  region,
  service,
  accessKeyId,
  secretAccessKey,
  body = Buffer.alloc(0),
  extraHeaders = {},
  date = new Date()
}) {
  const amzDate = toAmzDate(date);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = encodeUriPath(path);

  const headersToSign = { host: host.toLowerCase(), "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  for (const [key, value] of Object.entries(extraHeaders)) {
    headersToSign[key.toLowerCase()] = String(value);
  }

  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headersToSign[name].trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = { Host: host, "X-Amz-Content-Sha256": payloadHash, "X-Amz-Date": amzDate, Authorization: authorization };
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers[key] = String(value);
  }

  return { url: `https://${host}${path}`, headers, canonicalRequest, stringToSign };
}

export { signS3Request, toAmzDate, encodeUriPath, getSignatureKey, sha256Hex };
