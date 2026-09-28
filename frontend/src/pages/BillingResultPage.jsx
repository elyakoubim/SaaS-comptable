import { Link } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function BillingResultPage({ mode }) {
  const { t } = useLanguage();
  if (mode === "success") {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-floating">
        <h2 className="font-display text-2xl font-semibold text-emerald-900">{t("billingResult.successTitle")}</h2>
        <p className="mt-2 text-emerald-800">{t("billingResult.successBody")}</p>
        <Link className="mt-5 inline-block rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white" to="/">
          {t("billingResult.goToDashboard")}
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-floating">
      <h2 className="font-display text-2xl font-semibold text-ink">{t("billingResult.cancelledTitle")}</h2>
      <p className="mt-2 text-muted">{t("billingResult.cancelledBody")}</p>
      <Link className="mt-5 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white" to="/billing">
        {t("billingResult.backToOffers")}
      </Link>
    </section>
  );
}

export { BillingResultPage };
