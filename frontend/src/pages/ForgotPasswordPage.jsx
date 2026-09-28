import { useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function ForgotPasswordPage({ isSubmitting = false, error = "", successMessage = "", onSubmit }) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({ email });
  }

  return (
    <section className="mx-auto mt-6 max-w-md">
      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{t("login.spaceLabel")}</p>
          <h2 className="font-display text-2xl font-semibold">{t("forgot.title")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("forgot.subtitle")}</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="forgot-email">
            {t("forgot.email")}
          </label>
          <input
            autoComplete="username"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="forgot-email"
            placeholder={t("login.emailPlaceholder")}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}
          {successMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          )}

          <button
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t("forgot.submitting") : t("forgot.submit")}
          </button>

          <p className="text-center text-sm text-gray-600">
            <Link className="font-semibold text-accent hover:text-accent-strong" to="/login">
              {t("forgot.backToLogin")}
            </Link>
          </p>
        </form>
      </article>
    </section>
  );
}

export { ForgotPasswordPage };
