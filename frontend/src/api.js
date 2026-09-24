const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const AUTH_TOKEN_STORAGE_KEY = "nv_saas_auth_token";

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || "";
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token || ""));
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

function withAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function loginWithPassword({ email, password }) {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Connexion impossible");
  }

  if (!data.token) {
    throw new Error("Token de session manquant dans la reponse");
  }

  setAuthToken(data.token);
  return data;
}

async function registerAccount({ email, password, fullName }) {
  const response = await fetch(apiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, fullName })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Inscription impossible");
  }

  if (!data.token) {
    throw new Error("Token de session manquant dans la reponse");
  }

  setAuthToken(data.token);
  return data;
}

async function fetchCurrentUser() {
  const response = await fetch(apiUrl("/api/auth/me"), {
    headers: withAuthHeaders()
  });

  if (!response.ok) {
    clearAuthToken();
    throw new Error("Session invalide");
  }

  return response.json();
}

async function logout() {
  const token = getAuthToken();
  clearAuthToken();

  if (!token) {
    return;
  }

  await fetch(apiUrl("/api/auth/logout"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  }).catch(() => {});
}

async function startFpsConnection(ecbNumber) {
  const response = await fetch(apiUrl("/api/fps/connect/start"), {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ecbNumber })
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible de démarrer la connexion MyMinfin");
  }

  return response.json();
}

async function createCheckoutSession({ plan, interval }) {
  const response = await fetch(apiUrl("/api/billing/checkout"), {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ plan, interval })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Impossible de creer la session de paiement");
  }
  return data;
}

async function createPortalSession() {
  const response = await fetch(apiUrl("/api/billing/portal"), {
    method: "POST",
    headers: withAuthHeaders()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Impossible d'ouvrir le portail de facturation");
  }
  return data;
}

async function fetchMandants() {
  const response = await fetch(apiUrl("/api/fps/mandants"), {
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les mandants");
  }
  return response.json();
}

async function fetchAlerts(filters = {}) {
  const params = new URLSearchParams();
  if (filters.level) params.set("level", String(filters.level));
  if (filters.mandant) params.set("mandant", String(filters.mandant));
  if (filters.acknowledged !== undefined && filters.acknowledged !== null) {
    params.set("acknowledged", String(filters.acknowledged));
  }
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));

  const query = params.toString();
  const path = query ? `/api/alerts?${query}` : "/api/alerts";

  const response = await fetch(apiUrl(path), {
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible de charger les alertes");
  }
  return response.json();
}

/**
 * Vue portefeuille : une ligne par dossier du cabinet, deja triee par
 * urgence cote serveur (critique > warning > info), avec l'alerte la plus
 * urgente de chaque dossier. `category` restreint aux alertes d'une des
 * onze categories du classificateur (voir CATEGORIES).
 */
async function fetchPortfolio(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set("category", String(filters.category));

  const query = params.toString();
  const path = query ? `/api/alerts/portfolio?${query}` : "/api/alerts/portfolio";

  const response = await fetch(apiUrl(path), {
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible de charger le portefeuille");
  }
  return response.json();
}

async function acknowledgeAlert(alertId) {
  const response = await fetch(apiUrl(`/api/alerts/${alertId}/acknowledge`), {
    method: "POST",
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible d'acquitter l'alerte");
  }
  return response.json();
}

async function forceSync(cbe) {
  const response = await fetch(apiUrl(`/api/sync/${cbe}`), {
    method: "POST",
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible de lancer la sync");
  }
  return response.json();
}

/**
 * Signaux d'analyse — calculés côté serveur à partir des documents et des
 * alertes réellement synchronisés.
 *
 * L'implémentation précédente ne faisait aucun appel réseau : elle prenait les
 * quatre derniers chiffres du numéro BCE comme graine et en dérivait une
 * « variation TVA vs N-1 », un nombre d'« incohérences détectées » et un
 * « score de risque ». Rien de tout cela n'existait. Affiché à un comptable,
 * c'était faux au sens propre.
 */
async function fetchSignals({ days } = {}) {
  const path = days ? `/api/analysis/signals?days=${encodeURIComponent(days)}` : "/api/analysis/signals";
  const response = await fetch(apiUrl(path), {
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Impossible de charger l'analyse");
  }
  return response.json();
}

/**
 * Recupere le contenu binaire d'un document (PDF le plus souvent) depuis
 * MyMinfin via le backend, pour l'ouvrir dans un nouvel onglet. Le endpoint
 * exige un Bearer token (pas de cookie de session) donc un simple <a href>
 * ne s'authentifierait pas : on fait le fetch nous-memes et on construit un
 * blob URL.
 */
async function fetchDocumentBlob(documentId) {
  const response = await fetch(apiUrl(`/api/documents/${documentId}/content`), {
    headers: withAuthHeaders()
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Document introuvable");
  }
  return response.blob();
}

export { startFpsConnection, fetchMandants, fetchAlerts, fetchPortfolio, acknowledgeAlert, forceSync, fetchSignals, fetchDocumentBlob, createCheckoutSession, createPortalSession };
export { loginWithPassword, registerAccount, fetchCurrentUser, logout, getAuthToken, clearAuthToken };
