import { useState } from "react";
import { Link } from "react-router-dom";
import { DEMO_PORTFOLIO, DEMO_ALERTS } from "../demoData";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function levelTone(level) {
  if (level === "critical") {
    return "border-red-200 bg-red-50 text-danger";
  }
  if (level === "warning") {
    return "border-amber-200 bg-amber-50 text-warning";
  }
  return "border-accent-line bg-accent-soft text-accent-strong";
}

function countBadgeClass(level, count) {
  if (!count) {
    return "bg-gray-50 text-gray-400";
  }
  if (level === "critical") {
    return "bg-red-50 text-danger";
  }
  if (level === "warning") {
    return "bg-amber-50 text-warning";
  }
  return "bg-gray-100 text-gray-500";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleDateString("fr-BE");
  } catch (_error) {
    return String(value);
  }
}

// Page de demonstration publique, sans compte requis. Donnees entierement
// fictives (cf. demoData.js) - jamais les vraies donnees de test SPF, qui
// appartiennent a de vraies entreprises. Aucune action n'est reellement
// executee ici (acquitter, voir le document...) : chaque bouton affiche un
// message invitant a creer un compte plutot que de simuler un vrai backend.
function DemoPage() {
  const { t } = useLanguage();
  const [notice, setNotice] = useState("");

  function showAccountNotice() {
    setNotice(t("demo.accountNotice"));
  }

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-accent-line bg-accent-soft p-5 shadow-floating sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-accent-strong">{t("demo.title")}</h2>
            <p className="mt-1 text-sm text-accent-strong">{t("demo.subtitle")}</p>
          </div>
          <Link
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong"
            to="/register"
          >
            {t("demo.createFreeAccount")}
          </Link>
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <h3 className="font-display text-lg font-semibold text-ink">{t("demo.portfolioTitle")}</h3>
        <p className="mb-4 text-sm text-gray-600">{t("demo.portfolioSubtitle")}</p>
        <div className="grid gap-2">
          {DEMO_PORTFOLIO.map((item) => {
            const isDormant = !item.counts.critical && !item.counts.warning && !item.counts.info;
            return (
              <div
                className={`grid grid-cols-1 gap-2 rounded-xl border border-gray-200/70 bg-white px-4 py-3 sm:grid-cols-[1.8fr_1fr_2fr] sm:items-center sm:gap-4 ${
                  isDormant ? "opacity-50" : ""
                }`}
                key={item.mandantEcb}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{item.companyName}</p>
                  <p className="text-xs text-gray-500">BCE {item.mandantEcb} {t("demo.example")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("critical", item.counts.critical)}`}>
                    {item.counts.critical}
                  </span>
                  <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("warning", item.counts.warning)}`}>
                    {item.counts.warning}
                  </span>
                  <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("info", item.counts.info)}`}>
                    {item.counts.info}
                  </span>
                </div>
                <div className="min-w-0">
                  {item.topAlert ? (
                    <p className="truncate text-sm font-medium text-ink">{item.topAlert.title}</p>
                  ) : (
                    <p className="text-sm text-gray-400">{t("demo.nothingPending")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <h3 className="font-display text-lg font-semibold text-ink">{t("demo.alertsTitle")}</h3>
        <p className="mb-4 text-sm text-gray-600">{t("demo.alertsSubtitle")}</p>

        {notice && (
          <p className="mb-3 rounded-xl border border-accent-line bg-accent-soft px-3 py-2 text-sm text-accent-strong">
            {notice}
          </p>
        )}

        <div className="grid gap-3">
          {DEMO_ALERTS.map((alert) => (
            <article
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft"
              key={alert.id}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-display text-lg font-semibold">{alert.title}</h4>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${levelTone(alert.level)}`}>
                  {alert.level}
                </span>
              </div>
              <p className="text-sm text-gray-700">{alert.detail}</p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>{t("demo.mandant")} : {alert.companyName}</span>
                <span>{t("demo.documentDate")} : {formatDate(alert.documentDate)}</span>
              </div>

              {alert.extraction && (
                <div className="mt-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm text-accent-strong">
                  <p className="font-semibold">{alert.extraction.accroche}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {alert.extraction.montant && <span>{t("demo.amount")} : {alert.extraction.montant}</span>}
                    {alert.extraction.dateEcheance && (
                      <span>{t("demo.dueDate")} : {formatDate(alert.extraction.dateEcheance)}</span>
                    )}
                    {alert.extraction.reference && <span>{t("demo.reference")} : {alert.extraction.reference}</span>}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-soft transition hover:bg-gray-50"
                  onClick={showAccountNotice}
                  type="button"
                >
                  {t("demo.viewDocument")}
                </button>
                {!alert.extraction && (
                  <button
                    className="rounded-lg border border-accent-line bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong shadow-soft transition hover:bg-accent"
                    onClick={showAccountNotice}
                    type="button"
                  >
                    {t("demo.readWithAi")}
                  </button>
                )}
                <button
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-strong"
                  onClick={showAccountNotice}
                  type="button"
                >
                  {t("demo.markDone")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 text-center shadow-floating sm:p-6">
        <p className="text-sm text-gray-600">{t("demo.convinced")}</p>
        <Link
          className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong"
          to="/register"
        >
          {t("demo.createFreeAccount")}
        </Link>
      </article>
    </section>
  );
}

export { DemoPage };
