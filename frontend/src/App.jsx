import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  createCheckoutSession,
  fetchCurrentUser,
  getAuthToken,
  loginWithPassword,
  logout,
  registerAccount,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
  resendVerificationEmail
} from "./api";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ConnectMandantPage } from "./pages/ConnectMandantPage.jsx";
import { ConnectResultPage } from "./pages/ConnectResultPage.jsx";
import { AlertsPage } from "./pages/AlertsPage.jsx";
import { AnalysisPage } from "./pages/AnalysisPage.jsx";
import { BillingPage } from "./pages/BillingPage.jsx";
import { BillingResultPage } from "./pages/BillingResultPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { VerifyEmailPage } from "./pages/VerifyEmailPage.jsx";
import { DemoPage } from "./pages/DemoPage.jsx";
import { TeamPage } from "./pages/TeamPage.jsx";
import { useLanguage } from "./i18n/LanguageContext.jsx";
import { translateApiError } from "./i18n/apiErrors.js";

const navItems = [
  { to: "/", key: "nav.dossiers" },
  { to: "/alerts", key: "nav.alerts" },
  { to: "/analysis", key: "nav.analysis" },
  { to: "/connect", key: "nav.connect" },
  { to: "/billing", key: "nav.billing" },
  { to: "/team", key: "nav.team" }
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

function EmailVerificationBanner({ isSending, sendError, sendSuccess, onResend }) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span>
          {sendSuccess || t("emailBanner.default")}
          {sendError && <span className="ml-2 text-danger">{sendError}</span>}
        </span>
        <button
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-soft transition hover:bg-amber-100 disabled:opacity-60"
          disabled={isSending}
          onClick={onResend}
          type="button"
        >
          {isSending ? t("emailBanner.sending") : t("emailBanner.resend")}
        </button>
      </div>
    </div>
  );
}

// Petit bascule FR/NL, deux lettres cliquables (pas un <select> : deux langues
// seulement, autant montrer les deux d'un coup plutot que d'ouvrir un menu).
function LanguageSwitch() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div
      aria-label={t("app.langSwitch.label")}
      className="flex items-center overflow-hidden rounded-lg border border-line text-xs font-semibold"
      role="group"
    >
      {["fr", "nl"].map((code) => (
        <button
          className={`px-2 py-1.5 uppercase transition ${
            lang === code ? "bg-accent text-white" : "bg-white text-muted hover:bg-gray-50 hover:text-ink"
          }`}
          key={code}
          onClick={() => setLang(code)}
          type="button"
        >
          {code}
        </button>
      ))}
    </div>
  );
}

function AppShell({ children, isAuthenticated, currentUser, onLogout, emailVerificationBanner }) {
  const location = useLocation();
  const { t } = useLanguage();
  const userLabel = currentUser?.fullName || currentUser?.email || "";

  return (
    <div className="min-h-screen bg-canvas font-body text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {isAuthenticated ? (
            <Link className="shrink-0" to="/">
              <VatuMark />
            </Link>
          ) : (
            <a className="shrink-0" href="https://vatu.be">
              <VatuMark />
            </a>
          )}

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
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitch />
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
                  {t("app.logout")}
                </button>
              </>
            ) : location.pathname === "/demo" ? (
              <Link
                className="rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong hover:bg-accent-line"
                to="/register"
              >
                {t("app.createAccount")}
              </Link>
            ) : (
              <span className="rounded-full border border-accent-line bg-accent-soft px-3 py-1 text-sm font-medium text-accent-strong">
                {t("app.loginRequired")}
              </span>
            )}
          </div>
        </div>
      </header>

      {emailVerificationBanner}

      <main className="mx-auto w-full max-w-7xl animate-rise px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 text-xs text-muted sm:px-6 lg:px-8">
          {t("app.footer")}
        </div>
      </footer>
    </div>
  );
}

const VALID_PLANS = new Set(["connect", "pro"]);
const VALID_INTERVALS = new Set(["monthly", "annual"]);

export default function App() {
  const location = useLocation();
  const { t } = useLanguage();
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState("");
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState("");
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState("");
  const [verifyEmailStatus, setVerifyEmailStatus] = useState("idle");
  const [verifyEmailMessage, setVerifyEmailMessage] = useState("");
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [resendVerificationError, setResendVerificationError] = useState("");
  const [resendVerificationSuccess, setResendVerificationSuccess] = useState("");

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

  async function redirectToRequestedCheckout(user) {
    const params = new URLSearchParams(location.search);
    const plan = params.get("plan");
    const interval = params.get("interval") || "annual";

    if (!VALID_PLANS.has(plan) || !VALID_INTERVALS.has(interval)) {
      return false;
    }

    // Un compte deja abonne (essai ou paye) ne doit pas repartir sur Stripe
    // juste parce qu'il arrive via un lien "plan=" du site vitrine (ex: ancien
    // onglet, favori) - meme logique que hasActiveSubscription dans BillingPage.
    const activePlan = user?.subscriptionPlan || null;
    const activeStatus = user?.subscriptionStatus || null;
    const hasActiveSubscription = Boolean(activePlan) && activeStatus !== "canceled";
    if (hasActiveSubscription) {
      return false;
    }

    try {
      const { url } = await createCheckoutSession({ plan, interval });
      window.location.href = url;
      return true;
    } catch (_error) {
      // Si Stripe echoue pour une raison quelconque, l'utilisateur reste
      // simplement sur le dashboard et peut relancer depuis l'onglet Abonnement.
      return false;
    }
  }

  async function handleLogin({ email, password }) {
    try {
      setIsLoggingIn(true);
      setLoginError("");
      setRegisterSuccess("");
      const payload = await loginWithPassword({ email, password });
      setCurrentUser(payload.user || null);
      await redirectToRequestedCheckout(payload.user);
    } catch (error) {
      setLoginError(translateApiError(error.message, t, "login.errorDefault"));
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleRegister({ fullName, email, password, inviteToken }) {
    try {
      setIsRegistering(true);
      setRegisterError("");
      setRegisterSuccess("");
      const payload = await registerAccount({ fullName, email, password, inviteToken });
      setCurrentUser(payload.user || null);
      const redirected = await redirectToRequestedCheckout(payload.user);
      if (!redirected) {
        setRegisterSuccess(t("register.successDefault"));
      }
    } catch (error) {
      setRegisterError(translateApiError(error.message, t, "register.errorDefault"));
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleForgotPassword({ email }) {
    try {
      setIsRequestingReset(true);
      setForgotPasswordError("");
      setForgotPasswordSuccess("");
      const payload = await requestPasswordReset(email);
      setForgotPasswordSuccess(payload.message || t("forgot.successDefault"));
    } catch (error) {
      setForgotPasswordError(translateApiError(error.message, t, "forgot.errorDefault"));
    } finally {
      setIsRequestingReset(false);
    }
  }

  async function handleResetPassword({ token, password }) {
    try {
      setIsResettingPassword(true);
      setResetPasswordError("");
      setResetPasswordSuccess("");
      const payload = await resetPassword({ token, password });
      setCurrentUser(payload.user || null);
      setResetPasswordSuccess(t("reset.successDefault"));
    } catch (error) {
      setResetPasswordError(translateApiError(error.message, t, "reset.errorDefault"));
    } finally {
      setIsResettingPassword(false);
    }
  }

  async function handleVerifyEmail({ token }) {
    try {
      setVerifyEmailStatus("verifying");
      const payload = await verifyEmail(token);
      setVerifyEmailMessage(payload.message || t("verify.successDefault"));
      setVerifyEmailStatus("success");
      // Le compte peut avoir ete verifie depuis un autre onglet que celui de
      // la session active : on rafraichit currentUser pour faire disparaitre
      // la banniere de rappel sans attendre un rechargement complet.
      try {
        const me = await fetchCurrentUser();
        setCurrentUser(me.user || null);
      } catch (_error) {
        // Pas grave si pas connecte ici (ex: verification depuis un autre appareil).
      }
    } catch (error) {
      setVerifyEmailMessage(translateApiError(error.message, t, "verify.errorDefault"));
      setVerifyEmailStatus("error");
    }
  }

  async function handleResendVerification() {
    try {
      setIsResendingVerification(true);
      setResendVerificationError("");
      setResendVerificationSuccess("");
      const payload = await resendVerificationEmail();
      setResendVerificationSuccess(payload.message || t("emailBanner.sentDefault"));
    } catch (error) {
      setResendVerificationError(translateApiError(error.message, t, "forgot.errorDefault"));
    } finally {
      setIsResendingVerification(false);
    }
  }

  async function handleLogout() {
    await logout();
    setCurrentUser(null);
  }

  // deleteAccount() a deja efface le token cote client (voir api.js) ; il ne
  // reste qu'a vider l'etat local pour retomber sur /login, comme un logout.
  function handleAccountDeleted() {
    setCurrentUser(null);
  }

  if (isCheckingSession) {
    return (
      <AppShell currentUser={null} isAuthenticated={false} onLogout={handleLogout}>
        <section className="rounded-2xl border border-line bg-white p-5 text-sm text-gray-600 shadow-soft">
          {t("app.checkingSession")}
        </section>
      </AppShell>
    );
  }

  const isAuthenticated = Boolean(currentUser?.id || currentUser?.accountantId);
  const showEmailVerificationBanner = isAuthenticated && currentUser?.emailVerified === false;

  const requestedParams = new URLSearchParams(location.search);
  const requestedPlan = requestedParams.get("plan");
  const planLabels = { connect: t("login.plan.connect"), pro: t("login.plan.pro") };
  const intervalLabels = { monthly: t("login.interval.monthly"), annual: t("login.interval.annual") };
  const planNotice = VALID_PLANS.has(requestedPlan)
    ? t("login.planNotice", {
        plan: planLabels[requestedPlan],
        interval: intervalLabels[requestedParams.get("interval")] || t("login.interval.annual")
      })
    : "";

  return (
    <AppShell
      currentUser={currentUser}
      emailVerificationBanner={
        showEmailVerificationBanner ? (
          <EmailVerificationBanner
            isSending={isResendingVerification}
            sendError={resendVerificationError}
            sendSuccess={resendVerificationSuccess}
            onResend={handleResendVerification}
          />
        ) : null
      }
      isAuthenticated={isAuthenticated}
      onLogout={handleLogout}
    >
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
                  loginError={loginError}
                  planNotice={planNotice}
                  onLogin={handleLogin}
                />
              )
            }
          />
          <Route
            path="/register"
            element={
              isAuthenticated ? (
                <Navigate replace to="/" />
              ) : (
                <RegisterPage
                  isRegistering={isRegistering}
                  planNotice={planNotice}
                  registerError={registerError}
                  registerSuccess={registerSuccess}
                  onRegister={handleRegister}
                />
              )
            }
          />
          <Route
            path="/forgot-password"
            element={
              isAuthenticated ? (
                <Navigate replace to="/" />
              ) : (
                <ForgotPasswordPage
                  error={forgotPasswordError}
                  isSubmitting={isRequestingReset}
                  successMessage={forgotPasswordSuccess}
                  onSubmit={handleForgotPassword}
                />
              )
            }
          />
          <Route
            path="/reset-password"
            element={
              isAuthenticated ? (
                <Navigate replace to="/" />
              ) : (
                <ResetPasswordPage
                  error={resetPasswordError}
                  isSubmitting={isResettingPassword}
                  successMessage={resetPasswordSuccess}
                  onSubmit={handleResetPassword}
                />
              )
            }
          />
          <Route
            path="/verify-email"
            element={
              <VerifyEmailPage
                message={verifyEmailMessage}
                status={verifyEmailStatus}
                onVerify={handleVerifyEmail}
              />
            }
          />
          <Route path="/" element={isAuthenticated ? <DashboardPage /> : <Navigate replace to="/login" />} />
          <Route path="/connect" element={isAuthenticated ? <ConnectMandantPage /> : <Navigate replace to="/login" />} />
          <Route
            path="/alerts"
            element={isAuthenticated ? <AlertsPage currentUser={currentUser} /> : <Navigate replace to="/login" />}
          />
          <Route path="/analysis" element={isAuthenticated ? <AnalysisPage /> : <Navigate replace to="/login" />} />
          <Route
            path="/billing"
            element={
              isAuthenticated ? (
                <BillingPage currentUser={currentUser} onAccountDeleted={handleAccountDeleted} />
              ) : (
                <Navigate replace to="/login" />
              )
            }
          />
          <Route
            path="/billing/success"
            element={isAuthenticated ? <BillingResultPage mode="success" /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/billing/cancelled"
            element={isAuthenticated ? <BillingResultPage mode="cancelled" /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/connect/success"
            element={isAuthenticated ? <ConnectResultPage mode="success" /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/connect/error"
            element={isAuthenticated ? <ConnectResultPage mode="error" /> : <Navigate replace to="/login" />}
          />
          <Route
            path="/team"
            element={
              isAuthenticated ? (
                <TeamPage currentUser={currentUser} />
              ) : (
                <Navigate replace to="/login" />
              )
            }
          />
          <Route path="/demo" element={<DemoPage />} />
          <Route path="*" element={<Navigate replace to={isAuthenticated ? "/" : "/login"} />} />
        </Routes>
    </AppShell>
  );
}
