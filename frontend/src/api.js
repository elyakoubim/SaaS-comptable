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
    throw new Error(data.message || "Impossible de démarrer la connexion FPS");
  }

  return response.json();
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

async function fetchSignals() {
  const mandantsPayload = await fetchMandants().catch(() => ({ data: [] }));
  const data = (mandantsPayload.data || []).map((item) => {
    const seed = Number(String(item.ecbNumber || "0").slice(-4));
    return {
      mandantEcb: item.ecbNumber,
      companyName: item.companyName || "Entreprise",
      vatDelta: ((seed % 72) - 36).toFixed(1),
      inconsistencyCount: (seed % 4) + 1,
      lateHistoryCount: seed % 5,
      riskScore: Math.min(95, Math.max(8, (seed % 100) + Number(item.activeAlertCount || 0) * 7))
    };
  });

  return { data };
}

export { startFpsConnection, fetchMandants, fetchAlerts, acknowledgeAlert, forceSync, fetchSignals };
export { loginWithPassword, registerAccount, fetchCurrentUser, logout, getAuthToken, clearAuthToken };
