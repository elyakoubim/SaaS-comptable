/**
 * Client MyMinfin (FPS) — squelette préparatoire.
 *
 * Implémentation HTTP réelle à venir en Session A2. Pour l'instant chaque
 * fonction throw afin d'éviter qu'un appelant ne pense récupérer des données.
 *
 * Variables d'environnement attendues (à définir uniquement quand l'implémentation
 * réelle arrivera — ne pas configurer maintenant) :
 *   - FPS_MMF_BASE_URL_TEST = https://wsapi-a.minfin.be
 *   - FPS_MMF_BASE_URL_PROD = https://wsapi.minfin.fgov.be
 *   - Sélection test/prod via FPS_ENV (déjà utilisé par fps.config.js)
 */

/**
 * @typedef {Object} MyMinfinDocument
 * @property {string} uuid - Identifiant unique MyMinfin du document
 * @property {string} ownerType - 'CBE' (entreprise) ou 'SSIN' (personne physique)
 * @property {string} ownerIdentifier - Numéro BCE (10 chiffres) ou NISS
 * @property {string} documentType - Type FPS (ex: 'AVIS_IMPOSITION', 'NOTE_CALCUL')
 * @property {string} documentDate - Date du document (ISO 8601)
 * @property {string} publishDate - Date de publication sur MyMinfin (ISO 8601)
 * @property {Object} raw - Réponse brute MyMinfin pour debug/persistance metadata
 */

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
 * @throws {Error} RateLimitError 429 avec Retry-After
 * @throws {Error} AuthError 401 (token invalide/expiré) ou 403 (pas de mandat)
 * @throws {Error} ApiError autre erreur HTTP
 */
async function searchDocuments(_accessToken, _cbe, _since) {
  throw new Error("not implemented yet - Session A2");
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
 * @returns {Promise<Buffer>} Contenu binaire du PDF
 * @throws {Error} RateLimitError 429 avec Retry-After
 * @throws {Error} AuthError 401/403
 * @throws {Error} ApiError autre erreur HTTP
 */
async function downloadDocument(_accessToken, _uuid, _cbe) {
  throw new Error("not implemented yet - Session A2");
}

export { searchDocuments, downloadDocument };
