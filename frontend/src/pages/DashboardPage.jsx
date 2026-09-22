import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMandants, fetchPortfolio, forceSync } from "../api";

// Les onze categories metier du classificateur (documentClassifier.service.js,
// cote backend). Duplique ici en toute connaissance de cause : le front n'a
// pas de dependance vers le code backend, et cette liste ne change pas souvent.
const PORTFOLIO_CATEGORIES = [
  { value: "", label: "Toutes categories" },
  { value: "recouvrement", label: "Recouvrement" },
  { value: "sanction", label: "Sanction" },
  { value: "paiement", label: "Paiement" },
  { value: "controle", label: "Controle" },
  { value: "declaration", label: "Declaration" },
  { value: "attestation", label: "Attestation" },
  { value: "accuse", label: "Accuse de reception" },
  { value: "douane_accises", label: "Douane et accises" },
  { value: "ubo", label: "UBO" },
  { value: "enregistrement", label: "Enregistrement" },
  { value: "autre", label: "Autre" }
];

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

function topAlertToneClass(level) {
  if (level === "critical") {
    return "text-danger";
  }
  if (level === "warning") {
    return "text-warning";
  }
  return "text-gray-500";
}

// Quota SPF : une recherche par dossier et par tranche de 10 minutes. Le bouton
// se désarme tout seul pendant ce délai — mieux vaut un bouton grisé qu'un 429
// renvoyé par l'administration.
const SYNC_COOLDOWN_MS = 10 * 60 * 1000;

function statusTone(status) {
  if (status === "alert") {
    return "text-danger bg-red-50 border-red-200";
  }
  if (status === "warning") {
    return "text-warning bg-amber-50 border-amber-200";
  }
  return "text-success bg-emerald-50 border-emerald-200";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-BE");
}

function cooldownRemainingMs(lastSyncAt) {
  if (!lastSyncAt) return 0;
  const elapsed = Date.now() - new Date(lastSyncAt).getTime();
  return Math.max(0, SYNC_COOLDOWN_MS - elapsed);
}

function formatCooldown(ms) {
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes} min`;
}

function DashboardPage() {
  const [mandants, setMandants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingEcb, setSyncingEcb] = useState("");
  const [syncFeedback, setSyncFeedback] = useState({});
  // Force un recalcul du compte à rebours sans refaire d'appel réseau.
  const [, setTick] = useState(0);

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [portfolioCategory, setPortfolioCategory] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const payload = await fetchMandants();
      setMandants(payload.data || []);
    } catch (err) {
      setError(err.message || "Chargement impossible");
      setMandants([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPortfolio() {
      try {
        setPortfolioLoading(true);
        setPortfolioError("");
        const payload = await fetchPortfolio(
          portfolioCategory ? { category: portfolioCategory } : {}
        );
        if (!cancelled) {
          setPortfolio(payload.items || []);
        }
      } catch (err) {
        if (!cancelled) {
          setPortfolioError(err.message || "Chargement du portefeuille impossible");
          setPortfolio([]);
        }
      } finally {
        if (!cancelled) {
          setPortfolioLoading(false);
        }
      }
    }

    loadPortfolio();
    return () => {
      cancelled = true;
    };
  }, [portfolioCategory]);

  const portfolioSummary = useMemo(() => {
    let totalCritical = 0;
    let dossiersWithCritical = 0;
    let totalWarning = 0;

    for (const item of portfolio) {
      const critical = Number(item.counts?.critical || 0);
      const warning = Number(item.counts?.warning || 0);
      totalCritical += critical;
      totalWarning += warning;
      if (critical > 0) {
        dossiersWithCritical += 1;
      }
    }

    return { totalCritical, dossiersWithCritical, totalWarning };
  }, [portfolio]);

  async function handleSync(ecbNumber) {
    try {
      setSyncingEcb(ecbNumber);
      setSyncFeedback((current) => ({ ...current, [ecbNumber]: null }));
      await forceSync(ecbNumber);
      setSyncFeedback((current) => ({
        ...current,
        [ecbNumber]: { tone: "ok", text: "Synchronisation lancée. Le résultat arrive d'ici une minute." }
      }));
      // La synchronisation passe par la file d'attente : on laisse au worker le
      // temps de faire son travail avant de relire l'état.
      setTimeout(load, 20_000);
    } catch (err) {
      setSyncFeedback((current) => ({
        ...current,
        [ecbNumber]: { tone: "error", text: err.message || "Synchronisation impossible" }
      }));
    } finally {
      setSyncingEcb("");
    }
  }

  const metrics = useMemo(() => {
    const totals = {
      total: mandants.length,
      alert: 0,
      warning: 0,
      activeAlerts: 0
    };

    for (const item of mandants) {
      if (item.status === "alert") {
        totals.alert += 1;
      }
      if (item.status === "warning") {
        totals.warning += 1;
      }
      totals.activeAlerts += Number(item.activeAlertCount || 0);
    }

    return totals;
  }, [mandants]);

  return (
    <section className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-line bg-white p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Dossiers</p>
          <p className="mt-2 font-display text-3xl font-semibold">{metrics.total}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/85 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">Statut alert</p>
          <p className="mt-2 font-display text-3xl font-semibold text-emerald-900">{metrics.alert}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50/85 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Statut warning</p>
          <p className="mt-2 font-display text-3xl font-semibold text-amber-900">{metrics.warning}</p>
        </article>
        <article className="rounded-2xl border border-orange-200 bg-orange-50/90 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-700">Alertes actives</p>
          <p className="mt-2 font-display text-3xl font-semibold text-orange-900">{metrics.activeAlerts}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Portefeuille</h2>
            <p className="text-sm text-gray-600">Tous vos dossiers, triés par urgence.</p>
          </div>
          <select
            className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted"
            onChange={(event) => setPortfolioCategory(event.target.value)}
            value={portfolioCategory}
          >
            {PORTFOLIO_CATEGORIES.map((entry) => (
              <option key={entry.value || "all"} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        {!portfolioLoading && !portfolioError && portfolio.length > 0 && (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-ink">
            {portfolioSummary.totalCritical > 0 ? (
              <>
                <span className="font-semibold text-danger">
                  {portfolioSummary.totalCritical} alerte{portfolioSummary.totalCritical > 1 ? "s" : ""} critique
                  {portfolioSummary.totalCritical > 1 ? "s" : ""}
                </span>{" "}
                chez {portfolioSummary.dossiersWithCritical} dossier{portfolioSummary.dossiersWithCritical > 1 ? "s" : ""}
                {portfolioSummary.totalWarning > 0 && (
                  <>, et {portfolioSummary.totalWarning} à traiter avant échéance</>
                )}
                .
              </>
            ) : (
              "Rien de critique en attente sur le portefeuille."
            )}
          </p>
        )}

        {portfolioLoading && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Chargement du portefeuille…
          </p>
        )}

        {portfolioError && !portfolioLoading && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {portfolioError}
          </p>
        )}

        {!portfolioLoading && !portfolioError && portfolio.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Aucun dossier ne correspond à ce filtre.
          </p>
        )}

        {!portfolioLoading && !portfolioError && portfolio.length > 0 && (
          <div className="mb-2 grid gap-2">
            {portfolio.map((item) => {
              const isDormant =
                !item.counts?.critical && !item.counts?.warning && !item.counts?.info;

              return (
                <Link
                  className={`grid grid-cols-1 gap-2 rounded-xl border border-gray-200/70 bg-white px-4 py-3 transition hover:border-gray-300 hover:bg-gray-50 sm:grid-cols-[1.8fr_1fr_2fr_0.9fr] sm:items-center sm:gap-4 ${
                    isDormant ? "opacity-50" : ""
                  }`}
                  key={item.mandantEcb}
                  to={`/alerts?mandant=${item.mandantEcb}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{item.companyName || "Entreprise"}</p>
                    <p className="text-xs text-gray-500">BCE {item.mandantEcb}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("critical", item.counts?.critical)}`}>
                      {item.counts?.critical || 0}
                    </span>
                    <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("warning", item.counts?.warning)}`}>
                      {item.counts?.warning || 0}
                    </span>
                    <span className={`inline-flex h-6 min-w-[24px] items-center justify-center rounded-full px-2 text-xs font-bold ${countBadgeClass("info", item.counts?.info)}`}>
                      {item.counts?.info || 0}
                    </span>
                  </div>

                  <div className="min-w-0">
                    {item.topAlert ? (
                      <>
                        <p className={`truncate text-sm font-medium ${topAlertToneClass(item.topAlert.level)}`}>
                          {item.topAlert.title}
                        </p>
                        {item.topAlert.documentDate && (
                          <p className="text-xs text-gray-500">Document du {formatDate(item.topAlert.documentDate)}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Rien à traiter</p>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 sm:text-right">
                    Sync {formatDate(item.lastSyncAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mb-6 mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" /> Critique — conséquence immédiate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" /> À traiter — délai en cours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-300" /> Info — à archiver
          </span>
        </p>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Vos dossiers</h2>
            <p className="text-sm text-gray-600">Vos dossiers, tels que MyMinfin les a livrés.</p>
          </div>
          <button
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={load}
            type="button"
          >
            Rafraîchir
          </button>
        </div>

        {loading && <p className="text-gray-500">Chargement en cours…</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

        {!loading && mandants.length === 0 && !error && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Aucun dossier connecté pour le moment.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mandants.map((mandant) => {
            const remaining = cooldownRemainingMs(mandant.lastSyncAt);
            const isSyncing = syncingEcb === mandant.ecbNumber;
            const disabled = isSyncing || remaining > 0;
            const feedback = syncFeedback[mandant.ecbNumber];

            return (
              <article
                className="flex flex-col rounded-2xl border border-gray-200/70 bg-white p-4 shadow-soft transition hover:border-gray-300"
                key={mandant.ecbNumber}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold leading-tight">{mandant.companyName || "Entreprise"}</h3>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(mandant.status)}`}>
                    {mandant.status || "ok"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">BCE: {mandant.ecbNumber}</p>
                <p className="mt-1 text-sm text-gray-600">Alertes actives: {mandant.activeAlertCount ?? 0}</p>
                <p className="mt-1 text-sm text-gray-600">Consentement: {formatDate(mandant.consentGivenAt)}</p>
                <p className="mt-1 text-sm text-gray-600">Derniere sync: {formatDate(mandant.lastSyncAt)}</p>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <button
                    className={`w-full rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      disabled
                        ? "cursor-not-allowed border border-line bg-gray-50 text-gray-400"
                        : "bg-accent text-white shadow-soft hover:bg-accent-strong"
                    }`}
                    disabled={disabled}
                    onClick={() => handleSync(mandant.ecbNumber)}
                    type="button"
                  >
                    {isSyncing
                      ? "Synchronisation…"
                      : remaining > 0
                        ? `Disponible dans ${formatCooldown(remaining)}`
                        : "Synchroniser"}
                  </button>

                  {feedback && (
                    <p
                      className={`mt-2 rounded-xl px-3 py-2 text-xs ${
                        feedback.tone === "ok"
                          ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {feedback.text}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Le SPF n'autorise qu'une recherche par dossier toutes les 10 minutes. Une synchronisation
          automatique tourne de toute façon chaque heure.
        </p>
      </article>
    </section>
  );
}

export { DashboardPage };
