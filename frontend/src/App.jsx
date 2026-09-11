import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { fetchCurrentUser, getAuthToken, loginWithPassword, logout, registerAccount } from "./api";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ConnectMandantPage } from "./pages/ConnectMandantPage.jsx";
import { ConnectResultPage } from "./pages/ConnectResultPage.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { AnalysisPage } from "./pages/AnalysisPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";

const navItems = [
  { to: "/", label: "Dossiers" },
  { to: "/alerts", label: "Alertes" },
  { to: "/analysis", label: "Analyse" },
  { to: "/connect", label: "Connecter" }
];

/**
 * La marque Vatu : carré vert à coins arrondis, coche blanche, mot-symbole.
 * Repris du site public plutôt que réinventé — c'est la même entreprise, et le
 * comptable qui arrive du site doit reconnaître l'application.
 */
function VatuMark() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path
            d="M6 12.5l4 4L18 8"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-ink">Vatu</span>
    </span>
  );
}

function AppShell({ children, isAuthenticated, currentUser, onLogout }) {
  const location = useLocation();
  const userLabel = currentUser?.fullName || currentUser?.email || "";

  return (
    <div className="min-h-screen bg-canvas font-body text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="shrink-0" to={isAuthenticated ? "/" : "/login"}>
            <VatuMark />
          </Link>

          {isAuthenticated && (
            <nav className="order-3 flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:pl-6">
              {navItems.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Link
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-accent-soft text-accent-strong"
                        : "text-muted hover:bg-gray-50 hover:text-ink"
                    }`}
                    key={item.to}
                    to={item.to}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {userLabel && (
                  <span className="hidden text-sm text-muted sm:inline" title={userLabel}>
                    {userLabel}
                  </span>
                )}
                <button
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-muted shadow-soft transition hover:bg-gray-50 hover:text-ink"
                  onClick={onLogout}
                  type="button"
                >
                  Se déconnecter
                </button>
              </>
            ) : (
              <span className="rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong">
                Connexion requise
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl animate-rise px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          Vatu passe par l'API officielle du SPF Finances, en lecture seule. La décision finale —
          valider, encoder, payer — vous revient.
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    async function initSession() {
      if (!getAuthToken()) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const payload = await fetchCurrentUser();
        setCurrentUser(payload.user || null);
      } catch (_error) {
        setCurrentUser(null);
      } finally {
        setIsCheckingSession(false);
      }
    }

    initSession();
  }, []);

  async function handleLogin({ email, password }) {
    try {
      setIsLoggingIn(true);
      setLoginError("");
      setRegisterSuccess("");
      const payload = await loginWithPassword({ email, password });
      setCurrentUser(payload.user || null);
    } catch (error) {
      setLoginError(error.message || "Connexion impossible");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRegister({ fullName, email, password }) {
    try {
      setIsRegistering(true);
      setRegisterError("");
      setRegisterSuccess("");
      const payload = await registerAccount({ fullName, email, password });
      setCurrentUser(payload.user || null);
      setRegisterSuccess("Inscription reussie. Session ouverte.");
    } catch (error) {
      setRegisterError(error.message || "Inscription impossible");
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
  }

  if (isCheckingSession) {
    return (
      <AppShell currentUser={null} isAuthenticated={false} onLogout={handleLogout}>
        <section className="rounded-2xl border border-line bg-white p-5 text-sm text-gray-600 shadow-soft">
          Vérification de la session…
        </section>
      </AppShell>
    );
  }

  const isAuthenticated = Boolean(currentUser?.id || currentUser?.accountantId);

  return (
    <AppShell currentUser={currentUser} isAuthenticated={isAuthenticated} onLogout={handleLogout}>
        <Routes>
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate replace to="/" />
              ) : (
                <LoginPage
                  defaultEmail=""
                  isLoggingIn={isLoggingIn}
                  isRegistering={isRegistering}
                  loginError={loginError}
                  registerError={registerError}
                  registerSuccess={registerSuccess}
                  onLogin={handleLogin}
                  onRegister={handleRegister}
                />
              )
            }
          />
          <Route path="/" element={isAuthenticated ? <DashboardPage /> : <Navigate replace to="/login" />} />
          <Route path="/connect" element={isAuthenticated ? <ConnectMandantPage /> : <Navigate replace to="/login" />} />
          <Route path="/alerts" element={isAuthenticated ? <AlertsPage /> : <Navigate replace to="/login" />} />
          <Route path="/analysis" element={isAuthenticated ? <AnalysisPage /> : <Navigate replace to="/login" />} />
          <Route
            path="/connect/success"
            element={isAuthenticated ? <ConnectResultPage mode="success" /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/connect/error"
            element={isAuthenticated ? <ConnectResultPage mode="error" /> : <Navigate replace to="/login" />}
          />
          <Route path="*" element={<Navigate replace to={isAuthenticated ? "/" : "/login"} />} />
        </Routes>
    </AppShell>
  );
}
