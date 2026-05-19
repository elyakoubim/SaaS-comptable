import { fpsConfig } from "../config/fps.config.js";
import { ApiError, AuthError, RateLimitError } from "./myMinfinErrors.js";

/**
 * Client MyMinfin (FPS).
 *
 * Variables d'environnement (cf. fps.config.js) :
 *   - FPS_MMF_BASE_URL_TEST (défaut : https://wsapi-a.minfin.be)
 *   - FPS_MMF_BASE_URL_PROD (défaut : https://wsapi.minfin.fgov.be)
 *   - Sélection test/prod via FPS_ENV
 */

/**
 * @typedef {Object} MyMinfinDocument
 * @property {string|null} uuid - Identifiant unique MyMinfin du document
 * @property {string|null} ownerType - 'CBE' (entreprise) ou 'SSIN' (personne physique)
 * @property {string|null} ownerIdentifier - Numéro BCE (10 chiffres) ou NISS
 * @property {string|null} documentType - Type FPS (ex: 'AVIS_IMPOSITION', 'NOTE_CALCUL')
 * @property {string|null} documentDate - Date du document (ISO 8601)
 * @property {string|null} publishDate - Date de publication sur MyMinfin (ISO 8601)
 * @property {Object} raw - Réponse brute MyMinfin pour debug/persistance metadata
 */

const SEARCH_PATH = "/FineAPI/Generic/OAU/v2/documents";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function ensureCbe(value) {
  if (typeof value !== "string" || !/^\d{10}$/.test(value)) {
    throw new Error("cbe must contain exactly 10 digits");
  }
}

function ensureDate(value, label) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${label} must be a valid Date`);
  }
}

function ensureUuid(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error("uuid must be a valid UUID");
  }
}

async function parseProblemDetailBody(response) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    return { title: null, detail: null, instance: null, status: null, raw: null };
  }

  if (!bodyText) {
    return { title: null, detail: null, instance: null, status: null, raw: null };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { title: null, detail: null, instance: null, status: null, raw: bodyText };
  }

  if (!parsed || typeof parsed !== "object") {
    return { title: null, detail: null, instance: null, status: null, raw: parsed };
  }

  return {
    title: parsed.title ?? null,
    detail: parsed.detail ?? null,
    instance: parsed.instance ?? null,
    status: parsed.status ?? null,
    raw: parsed
  };
}

function mapDocument(raw) {
  const relatedTo = raw?.relatedTo ?? {};
  return {
    uuid: raw?.uuid ?? null,
    ownerType: relatedTo.ownerType ?? null,
    ownerIdentifier: relatedTo.ownerIdentifier ?? null,
    documentType: raw?.documentType ?? null,
    documentDate: raw?.documentDate ?? null,
    publishDate: raw?.publishDate ?? null,
    raw
  };
}

function parseRetryAfter(headerValue) {
  const parsed = Number.parseInt(headerValue || "60", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 60;
}

/**
 * Recherche les documents d'une entreprise sur MyMinfin.
 *
 * Rate limit FPS :
 *   - Acceptance : 1 search /10min /CBE
 *   - Production : 1 search /10min /CBE
 *   - 429 → respecter l'en-tête Retry-After (secondes)
 *
 * @param {string} accessToken - Token OAuth déjà déchiffré (AES-256-GCM)
 * @param {string} cbe - Numéro BCE belge (10 chiffres, validé en amont)
 * @param {Date} since - Date plancher (max 60 jours dans le passé selon FPS)
 * @returns {Promise<Array<MyMinfinDocument>>} Liste de documents bruts
 * @throws {RateLimitError} 429 avec Retry-After
 * @throws {AuthError} 401 (token invalide/expiré) ou 403 (pas de mandat)
 * @throws {ApiError} autre erreur HTTP ou body inattendu
 */
async function searchDocuments(accessToken, cbe, since) {
  ensureNonEmptyString(accessToken, "accessToken");
  ensureCbe(cbe);
  ensureDate(since, "since");

  const url = new URL(SEARCH_PATH, fpsConfig.mmfBaseUrl);
  url.searchParams.set("since", since.toISOString().slice(0, 10));
  url.searchParams.set("ownerType", "CBE");
  url.searchParams.set("ownerIdentifier", cbe);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (response.status === 204) {
    return [];
  }

  if (response.status === 200) {
    let json;
    try {
      json = await response.json();
    } catch (parseError) {
      throw new ApiError(
        `MyMinfin returned 200 with non-JSON body: ${parseError.message}`,
        { status: 200 }
      );
    }

    if (!Array.isArray(json)) {
      throw new ApiError("Unexpected MyMinfin response shape (expected array)", {
        status: 200,
        raw: json
      });
    }

    return json.map(mapDocument);
  }

  const problem = await parseProblemDetailBody(response);
  const errorOpts = {
    status: response.status,
    instance: problem.instance,
    raw: problem.raw
  };

  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    throw new RateLimitError(retryAfterSeconds, errorOpts);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(
      problem.detail || problem.title || `MyMinfin auth error (${response.status})`,
      { ...errorOpts, retryable: response.status === 401 }
    );
  }

  throw new ApiError(
    problem.detail || problem.title || `MyMinfin API error (${response.status})`,
    errorOpts
  );
}

/**
 * Télécharge le contenu binaire (PDF) d'un document MyMinfin.
 *
 * Rate limit FPS :
 *   - Acceptance : 5 autres actions /min /CBE
 *   - Production : 12 downloads /min /CBE
 *
 * @param {string} accessToken - Token OAuth déchiffré
 * @param {string} uuid - UUID du document MyMinfin
 * @param {string} cbe - BCE du propriétaire (CBE owner)
 * @returns {Promise<Buffer>} Contenu binaire du document (PDF ou autre)
 * @throws {RateLimitError} 429 avec Retry-After
 * @throws {AuthError} 401 (token invalide/expiré, retryable) ou 403 (pas de mandat, >60 jours, owner manquant — non-retryable)
 * @throws {ApiError} 400 (UUID/BCE invalide, owner partiel) ou autre erreur HTTP
 */
async function downloadDocument(accessToken, uuid, cbe) {
  ensureNonEmptyString(accessToken, "accessToken");
  ensureUuid(uuid);
  ensureCbe(cbe);

  const url = new URL(
    `/FineAPI/Generic/OAU/v2/documents/${encodeURIComponent(uuid)}/content`,
    fpsConfig.mmfBaseUrl
  );
  url.searchParams.set("ownerType", "CBE");
  url.searchParams.set("ownerIdentifier", cbe);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/pdf"
    }
  });

  if (response.status === 200) {
    let arrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch (readError) {
      throw new ApiError(
        `MyMinfin returned 200 but body read failed: ${readError.message}`,
        { status: 200 }
      );
    }
    return Buffer.from(arrayBuffer);
  }

  const problem = await parseProblemDetailBody(response);
  const errorOpts = {
    status: response.status,
    instance: problem.instance,
    raw: problem.raw
  };

  if (response.status === 429) {
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    throw new RateLimitError(retryAfterSeconds, errorOpts);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AuthError(
      problem.detail || problem.title || `MyMinfin auth error (${response.status})`,
      { ...errorOpts, retryable: response.status === 401 }
    );
  }

  throw new ApiError(
    problem.detail || problem.title || `MyMinfin API error (${response.status})`,
    errorOpts
  );
}

export { searchDocuments, downloadDocument };
