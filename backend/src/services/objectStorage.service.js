import { objectStorageConfig, isObjectStorageEnabled } from "../config/objectStorage.config.js";
import { signS3Request } from "../utils/awsSigV4.js";

/**
 * Clé objet stable pour un document : un mandant par dossier, le document_fps_id
 * (UUID MyMinfin) en nom de fichier. Suffisant pour éviter toute collision, et
 * lisible directement dans le bucket si besoin d'inspection manuelle.
 */
function buildDocumentKey(mandantEcb, documentFpsId) {
  return `documents/${mandantEcb}/${documentFpsId}`;
}

function pathFor(key) {
  // encodeURIComponent serait appliqué une seconde fois par signS3Request:
  // on passe le chemin brut ("/" + bucket + "/" + key), l'encodage RFC 3986
  // segment par segment est fait dans awsSigV4.js.
  return `/${objectStorageConfig.bucket}/${key}`;
}

/**
 * Dépose le contenu d'un document dans R2. Lève une erreur si R2 répond une
 * erreur HTTP ; l'appelant décide s'il s'agit d'un échec bloquant ou non
 * (dans document.routes.js, l'archivage est un plus, pas une condition du
 * téléchargement).
 */
async function putObject(key, buffer, contentType) {
  const { url, headers } = signS3Request({
    method: "PUT",
    host: objectStorageConfig.host,
    path: pathFor(key),
    region: objectStorageConfig.region,
    service: objectStorageConfig.service,
    accessKeyId: objectStorageConfig.accessKeyId,
    secretAccessKey: objectStorageConfig.secretAccessKey,
    body: buffer,
    extraHeaders: { "content-type": contentType || "application/octet-stream" }
  });

  const response = await fetch(url, { method: "PUT", headers, body: buffer });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 putObject a échoué (${response.status}): ${text.slice(0, 500)}`);
  }
}

/**
 * Récupère un objet depuis R2. Retourne `null` si l'objet n'existe pas
 * (404) plutôt que de lever — un content_key qui pointe vers un objet absent
 * (supprimé manuellement dans le bucket, par exemple) doit permettre de
 * retomber sur le SPF plutôt que de faire échouer tout le téléchargement.
 */
async function getObject(key) {
  const { url, headers } = signS3Request({
    method: "GET",
    host: objectStorageConfig.host,
    path: pathFor(key),
    region: objectStorageConfig.region,
    service: objectStorageConfig.service,
    accessKeyId: objectStorageConfig.accessKeyId,
    secretAccessKey: objectStorageConfig.secretAccessKey
  });

  const response = await fetch(url, { method: "GET", headers });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`R2 getObject a échoué (${response.status}): ${text.slice(0, 500)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    content: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

export { putObject, getObject, buildDocumentKey, isObjectStorageEnabled };
