import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";

// Page d'authentification seule (28/09/2026) : avant, connexion et
// inscription cohabitaient sur le meme ecran en deux colonnes, ce qui
// pretait a confusion sur quel formulaire remplir. Chaque intention a
// desormais son propre ecran, relies par un petit lien croise plutot que
// d'etre affiches ensemble.
function LoginPage({
  defaultEmail = "",
  isLoggingIn = false,
  loginError = "",
  planNotice = "",
  onLogin
}) {
  const { t } = useLanguage();
  const location = useLocation();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");

  async function onLoginSubmit(event) {
    event.preventDefault();
    await onLogin({ email, password });
  }

  return (
    <section className="mx-auto mt-6 max-w-md">
      {planNotice && (
        <p className="mb-4 rounded-xl border border-accent-line bg-accent-soft px-4 py-2.5 text-sm text-accent-strong">
          {planNotice}
        </p>
      )}
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

          <p className="text-center text-sm text-gray-600">
            {t("login.noAccountYet")}{" "}
            <Link className="font-semibold text-accent hover:text-accent-strong" to={`/register${location.search}`}>
              {t("login.createAccountLink")}
            </Link>
          </p>
        </form>
      </article>
    </section>
  );
}

export { LoginPage };
