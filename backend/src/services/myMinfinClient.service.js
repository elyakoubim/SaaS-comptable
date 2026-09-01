import crypto from "node:crypto";
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

/**
 * En-têtes d'une requête MyMinfin.
 *
 * `Minfin-Ws-Correlation` est **obligatoire** (`required: true` dans openapi.yaml,
 * pour /documents comme pour /documents/{uuid}/content) : un UUID aléatoire par
 * requête, que le SPF réplique dans sa réponse, à des fins de traçage.
 *
 * Sans lui, la passerelle rejette l'appel AVANT d'examiner le Bearer, avec
 *   401 {"code":"InboundAuthenticationFailure","message":"Mandatory headers are missing"}
 * ce qui ressemble trompeusement à un problème de token ou de scope.
 *
 * ⚠️ Ne pas se fier au nom donné dans la prose du document Word, qui parle d'un
 * « correlationId header » : le nom réel est `Minfin-Ws-Correlation`. Il figure
 * dans la spécification OpenAPI (MyMinFinApiV2.zip, embarquée comme objet OLE
 * dans TECHNICAL_DOCUMENTATION_MMFAPI.docx — voir docs/).
 */
function buildRequestHeaders(accessToken, accept) {
  const correlationId = crypto.randomUUID();
  return {
    correlationId,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: accept,
      "Minfin-Ws-Correlation": correlationId,
      "User-Agent": "Vatu/0.1 (+https://connect.vatu.be)"
    }
  };
}
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

const OWNER_TYPES = new Set(["CBE", "SSIN"]);

/**
 * Normalise un couple propriétaire { ownerType, ownerIdentifier } tel que
 * MyMinfin le renvoie dans le champ `relatedTo` d'un document.
 * Retourne null si aucun propriétaire n'est fourni (= pas de filtre).
 */
function normalizeOwner(owner) {
  if (owner === null || owner === undefined) {
    return null;
  }

  const ownerType = String(owner.ownerType || "").toUpperCase();
  const ownerIdentifier = String(owner.ownerIdentifier || "").replace(/\D/g, "");

  if (!OWNER_TYPES.has(ownerType)) {
    throw new Error("ownerType must be 'CBE' or 'SSIN'");
  }
  if (!ownerIdentifier) {
    throw new Error("ownerIdentifier is required when ownerType is provided");
  }

  return { ownerType, ownerIdentifier };
}

async function parseProblemDetailBody(response) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    console.error(`[mmf] ${response.status} on ${response.url} — body unreadable`);
    return { title: null, detail: null, instance: null, status: null, raw: null };
  }

  // Trace brute : sans elle, un 401/403 sans title/detail (rejet au niveau de la
  // passerelle plutôt que de l'API) devient un message générique sans information.
  console.error(
    `[mmf] HTTP ${response.status} on ${response.url}\n` +
      `  content-type: ${response.headers.get("content-type") || "(none)"}\n` +
      `  www-authenticate: ${response.headers.get("www-authenticate") || "(none)"}\n` +
      `  ----- body start -----\n${bodyText || "(empty)"}\n  ----- body end -----`
  );

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

/**
 * Choisit une langue dans un LocalizedString belgif ({nl, fr, de, en}).
 */
function pickLocalized(localized, preferred = ["fr", "nl", "en", "de"]) {
  if (!localized || typeof localized !== "object") {
    return null;
  }
  for (const lang of preferred) {
    if (typeof localized[lang] === "string" && localized[lang].length > 0) {
      return localized[lang];
    }
  }
  return null;
}

/**
 * Projette un Document MyMinfin (schéma fineapi-v1.yaml) vers notre modèle.
 *
 * ⚠️ La forme réelle diffère de ce qu'on supposait :
 *   - `relatedTo` est un TABLEAU de LegalEntity `{type: 'CBE'|'SSIN', identifier}`,
 *     et non un objet `{ownerType, ownerIdentifier}`. Il liste les entités qui
 *     rendent le document accessible : l'entreprise connectée elle-même, ou les
 *     mandants qui lui en ont donné l'accès.
 *   - le type est `docType.name`, un LocalizedString `{nl, fr, de, en}`.
 *   - il n'existe ni `documentDate` ni `publishDate` : seulement `modifiedOn`.
 *   - `content` est l'URI du contenu du document.
 */
function mapDocument(raw) {
  const owners = Array.isArray(raw?.relatedTo) ? raw.relatedTo : [];
  const primaryOwner = owners[0] || null;

  return {
    uuid: raw?.uuid ?? null,
    ownerType: primaryOwner?.type ?? null,
    ownerIdentifier: primaryOwner?.identifier ?? null,
    // Toutes les entités qui donnent accès au document : c'est parmi celles-ci
    // qu'il faut choisir le couple owner à passer au téléchargement (scénario S05).
    owners: owners.map((entity) => ({
      ownerType: entity?.type ?? null,
      ownerIdentifier: entity?.identifier ?? null
    })),
    documentType: pickLocalized(raw?.docType?.name),
    documentDate: raw?.modifiedOn ?? null,
    publishDate: raw?.modifiedOn ?? null,
    contentUri: raw?.content ?? null,
    metadata: Array.isArray(raw?.metadata) ? raw.metadata : [],
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
 * ⚠️ Deux comportements, cf. scénarios de test FPS :
 *   - S01 (défaut ici, owner omis) : AUCUN filtre propriétaire → renvoie tout ce
 *     que l'entité connectée peut voir, Y COMPRIS les documents de ses MANDANTS.
 *     C'est le comportement attendu pour un cabinet comptable.
 *   - S02 (owner fourni) : restreint aux documents de cette seule entité.
 *
 * @param {string} accessToken - Token OAuth déjà déchiffré (AES-256-GCM)
 * @param {string} cbe - BCE du mandant connecté (10 chiffres ; clé de rate limit FPS)
 * @param {Date} since - Date plancher (max 60 jours dans le passé selon FPS)
 * @param {{ownerType: string, ownerIdentifier: string}|null} [owner] - Filtre optionnel (S02)
 * @returns {Promise<Array<MyMinfinDocument>>} Liste de documents bruts
 * @throws {RateLimitError} 429 avec Retry-After
 * @throws {AuthError} 401 (token invalide/expiré) ou 403 (pas de mandat)
 * @throws {ApiError} autre erreur HTTP ou body inattendu
 */
async function searchDocuments(accessToken, cbe, since, owner = null) {
  ensureNonEmptyString(accessToken, "accessToken");
  ensureCbe(cbe);
  ensureDate(since, "since");
  const scopedOwner = normalizeOwner(owner);

  const url = new URL(SEARCH_PATH, fpsConfig.mmfBaseUrl);
  url.searchParams.set("since", since.toISOString().slice(0, 10));

  // Sans filtre = scénario S01 : les documents des mandants remontent aussi.
  if (scopedOwner) {
    url.searchParams.set("ownerType", scopedOwner.ownerType);
    url.searchParams.set("ownerIdentifier", scopedOwner.ownerIdentifier);
  }

  const { headers, correlationId } = buildRequestHeaders(accessToken, "application/json");
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    console.error(`[mmf] search failed — correlationId=${correlationId}`);
  }

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

    // La réponse est un DocumentCollection { items, total, lastSyncDate },
    // pas un tableau brut (cf. fineapi-v1.yaml#/components/schemas/DocumentCollection).
    const items = Array.isArray(json?.items) ? json.items : null;
    if (!items) {
      throw new ApiError(
        "Unexpected MyMinfin response shape (expected a DocumentCollection with an 'items' array)",
        { status: 200, raw: json }
      );
    }

    return items.map(mapDocument);
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
 * @param {{ownerType: string, ownerIdentifier: string}|null} [owner] - Propriétaire réel du
 *   document, tel que renvoyé dans `relatedTo` par la recherche. OBLIGATOIRE dès que le
 *   document appartient à un mandant (scénario S05) : sans lui, FPS répond 403 (S04).
 *   Omettre uniquement pour un document possédé par l'entité connectée elle-même (S03).
 * @returns {Promise<Buffer>} Contenu binaire du document (PDF ou autre)
 * @throws {RateLimitError} 429 avec Retry-After
 * @throws {AuthError} 401 (token invalide/expiré, retryable) ou 403 (pas de mandat, >60 jours, owner manquant — non-retryable)
 * @throws {ApiError} 400 (UUID/BCE invalide, owner partiel) ou autre erreur HTTP
 */
async function downloadDocument(accessToken, uuid, owner = null) {
  ensureNonEmptyString(accessToken, "accessToken");
  ensureUuid(uuid);
  const documentOwner = normalizeOwner(owner);

  const url = new URL(
    `/FineAPI/Generic/OAU/v2/documents/${encodeURIComponent(uuid)}/content`,
    fpsConfig.mmfBaseUrl
  );

  if (documentOwner) {
    url.searchParams.set("ownerType", documentOwner.ownerType);
    url.searchParams.set("ownerIdentifier", documentOwner.ownerIdentifier);
  }

  const { headers, correlationId } = buildRequestHeaders(accessToken, "application/pdf");
  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    console.error(`[mmf] download failed — correlationId=${correlationId}`);
  }

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
