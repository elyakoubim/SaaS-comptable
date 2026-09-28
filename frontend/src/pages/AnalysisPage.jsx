import { useEffect, useState } from "react";
import { fetchSignals } from "../api";
import { useLanguage } from "../i18n/LanguageContext.jsx";

/**
 * Page « Analyse ».
 *
 * Ce qui est affiché ici sort exclusivement des documents et des alertes
 * synchronisés depuis MyMinfin. Aucun chiffre n'est estimé, extrapolé ou
 * inventé — et c'est un changement de fond : la version précédente affichait
 * une « variation TVA vs N-1 », des « incohérences détectées » et un « score de
 * risque » dérivés des quatre derniers chiffres du numéro BCE.
 *
 * Tant que le contenu des PDF n'est pas extrait (montants, échéances,
 * communications structurées), l'analyse honnête est une analyse de flux :
 * volume, familles de documents, ancienneté des alertes ouvertes, fraîcheur de
 * la synchronisation.
 */

// L'ordre dans lequel un comptable veut voir les familles : ce qui coûte de
// l'argent d'abord, ce qui s'archive ensuite.
const CATEGORY_ORDER = [
  "recouvrement",
  "sanction",
  "paiement",
  "controle",
  "ubo",
  "douane_accises",
  "declaration",
  "enregistrement",
  "attestation",
  "accuse",
  "autre"
];

const LEVEL_DOT = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-gray-300"
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function MandantCard({ signal, t }) {
  const categories = CATEGORY_ORDER.filter((key) => signal.byCategory[key]).map((key) => ({
    key,
    label: t(`analysis.category.${key}`),
    count: signal.byCategory[key]
  }));

  const { critical, warning } = signal.activeAlerts;

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight">
            {signal.companyName || t("analysis.company")}
          </h3>
          <p className="text-xs text-gray-500">{t("analysis.bce")} {signal.mandantEcb}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {critical > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
              {t("analysis.criticalCount", { count: critical })}
            </span>
          )}
          {warning > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              {warning} {t("analysis.toHandle")}
            </span>
          )}
          {critical === 0 && warning === 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              {t("analysis.nothingPending")}
            </span>
          )}
        </div>
      </div>

      {signal.oldestOpenCriticalDays !== null && signal.oldestOpenCriticalDays >= 1 && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {t("analysis.oldestCritical")}{" "}
          <strong>{t("analysis.days", { count: signal.oldestOpenCriticalDays })}</strong>.
        </p>
      )}

      {signal.syncIsStale && (
        <p className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {t("analysis.staleSync", { date: formatDate(signal.lastSyncAt) })}
        </p>
      )}

      <p className="text-sm text-gray-700">
        <strong>{signal.documentCount}</strong> {t("analysis.documentCount", { count: signal.documentCount })}{" "}
        {t("analysis.onWindow", { date: formatDate(signal.lastDocumentDate) })}
      </p>

      {categories.length > 0 && (
        <ul className="mt-3 space-y-1">
          {categories.map((category) => (
            <li className="flex items-center justify-between text-sm" key={category.key}>
              <span className="text-gray-600">{category.label}</span>
              <span className="font-semibold text-gray-800">{category.count}</span>
            </li>
          ))}
        </ul>
      )}

      {signal.topTypes.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-[0.16em] text-gray-500">{t("analysis.topTypes")}</p>
          <ul className="space-y-1">
            {signal.topTypes.map((type) => (
              <li className="flex items-center gap-2 text-sm text-gray-700" key={type.rawType}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[type.level]}`} />
                <span className="min-w-0 flex-1 truncate" title={type.rawType}>
                  {type.label}
                </span>
                <span className="font-semibold text-gray-800">{type.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function AnalysisPage() {
  const { t } = useLanguage();
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchSignals()
      .then((payload) => {
        if (cancelled) return;
        setSignals(payload.data || []);
        setMeta({ windowDays: payload.windowDays, generatedAt: payload.generatedAt });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || t("analysis.errorDefault"));
        setSignals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <h2 className="font-display text-xl font-semibold">{t("analysis.title")}</h2>
        <p className="mt-1 text-sm text-gray-600">
          {t("analysis.subtitle", {
            window: meta?.windowDays ? t("analysis.windowDays", { days: meta.windowDays }) : t("analysis.windowDefault")
          })}
        </p>

        {loading && <p className="mt-5 text-gray-500">{t("analysis.loading")}</p>}

        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!loading && !error && signals.length === 0 && (
          <p className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("analysis.noMandant")}
          </p>
        )}

        {signals.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {signals.map((signal) => (
              <MandantCard key={signal.mandantEcb} signal={signal} t={t} />
            ))}
          </div>
        )}

        <p className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500">{t("analysis.footerNote")}</p>
      </article>
    </section>
  );
}

export { AnalysisPage };
