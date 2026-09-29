import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function LoginPage({
  defaultEmail = "",
  isLoggingIn = false,
  isRegistering = false,
  loginError = "",
  planNotice = "",
  registerError = "",
  registerSuccess = "",
  onLogin,
  onRegister
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  async function onLoginSubmit(event) {
    event.preventDefault();
    await onLogin({ email, password });
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    await onRegister({
      fullName: registerFullName,
      email: registerEmail,
      password: registerPassword,
      inviteToken
    });
  }

  return (
    <section className="mx-auto mt-6 max-w-6xl">
      {planNotice && (
        <p className="mb-4 rounded-xl border border-accent-line bg-accent-soft px-4 py-2.5 text-sm text-accent-strong">
          {planNotice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t("login.spaceLabel")}</p>
          <h2 className="font-display text-2xl font-semibold">{t("login.title")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("login.subtitle")}</p>
        </div>

        <form className="space-y-3" onSubmit={onLoginSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="email">
            {t("login.email")}
          </label>
          <input
            autoComplete="username"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="email"
            placeholder={t("login.emailPlaceholder")}
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="password">
            {t("login.password")}
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="password"
            placeholder={t("login.passwordPlaceholder")}
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {loginError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{loginError}</p>}

          <div className="text-right">
            <Link className="text-sm font-medium text-accent hover:text-accent-strong" to="/forgot-password">
              {t("login.forgotPassword")}
            </Link>
          </div>

          <button
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isLoggingIn}
            type="submit"
          >
            {isLoggingIn ? t("login.submitting") : t("login.submit")}
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t("register.newAccountLabel")}</p>
          <h2 className="font-display text-2xl font-semibold">{t("register.title")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {inviteToken ? t("register.subtitleInvite") : t("register.subtitleDefault")}
          </p>
        </div>

        <form className="space-y-3" onSubmit={onRegisterSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-fullname">
            {t("register.fullName")}
          </label>
          <input
            autoComplete="name"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-fullname"
            placeholder={t("register.fullNamePlaceholder")}
            required
            type="text"
            value={registerFullName}
            onChange={(event) => setRegisterFullName(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-email">
            {t("register.emailPro")}
          </label>
          <input
            autoComplete="email"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-email"
            placeholder={t("register.emailProPlaceholder")}
            required
            type="email"
            value={registerEmail}
            onChange={(event) => setRegisterEmail(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-password">
            {t("register.password")}
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-password"
            minLength={8}
            placeholder={t("register.passwordPlaceholder")}
            required
            type="password"
            value={registerPassword}
            onChange={(event) => setRegisterPassword(event.target.value)}
          />

          {registerError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{registerError}</p>
          )}
          {registerSuccess && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {registerSuccess}
            </p>
          )}

          <button
            className="w-full rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-soft transition hover:bg-gray-50 disabled:opacity-70"
            disabled={isRegistering}
            type="submit"
          >
            {isRegistering ? t("register.submitting") : t("register.submit")}
          </button>
        </form>
      </article>
      </div>
    </section>
  );
}

export { LoginPage };
