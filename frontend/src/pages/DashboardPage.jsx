import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMandants, fetchPortfolio, forceSync, deleteMandant } from "../api";
import { useLanguage } from "../i18n/LanguageContext.jsx";

// Les onze categories metier du classificateur (documentClassifier.service.js,
// cote backend). Duplique ici en toute connaissance de cause : le front n'a
// pas de dependance vers le code backend, et cette liste ne change pas souvent.
const PORTFOLIO_CATEGORY_KEYS = [
  "recouvrement",
  "sanction",
  "paiement",
  "controle",
  "declaration",
  "attestation",
  "accuse",
  "douane_accises",
  "ubo",
  "enregistrement",
  "autre"
];

// Filtre par niveau : conserve un dossier si au moins une alerte du niveau
// choisi y est active. "" = pas de filtre (tous les dossiers, y compris ceux
// sans aucune alerte).
const PORTFOLIO_LEVEL_KEYS = ["critical", "warning", "info"];

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

// Comparaison insensible aux accents/casse : "Meunier" doit trouver "Meunier"
// même tapé "meunier" ou "münier".
function normalizeForSearch(value) {
  return (value || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function DashboardPage() {
  const { t } = useLanguage();
  const [mandants, setMandants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncingEcb, setSyncingEcb] = useState("");
  const [syncFeedback, setSyncFeedback] = useState({});
  // Force un recalcul du compte à rebours sans refaire d'appel réseau.
  const [, setTick] = useState(0);

  // Suppression d'un dossier (point demande le 28/09/2026) : `deleteTarget`
  // porte le mandant vise pendant toute la confirmation, `deleteConfirmText`
  // le texte tape par l'utilisateur. Le controle avant suppression demande
  // par l'utilisateur ("il devra faire tres attention de ne pas se tromper")
  // est implemente en exigeant que ce texte reproduise exactement le numero
  // BCE du dossier avant que le bouton de suppression ne devienne actif —
  // un simple clic de confirmation se rate trop facilement, retaper le
  // numero force a le relire.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [portfolioCategory, setPortfolioCategory] = useState("");
  const [portfolioLevel, setPortfolioLevel] = useState("");
  const [portfolioSearch, setPortfolioSearch] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const payload = await fetchMandants();
      setMandants(payload.data || []);
    } catch (err) {
      setError(err.message || t("dashboard.errorDefault"));
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
          setPortfolioError(err.message || t("dashboard.errorDefault"));
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

  // Niveau et recherche filtrent la liste déjà récupérée (la catégorie, elle,
  // change le résultat côté serveur car elle change aussi les compteurs).
  const filteredPortfolio = useMemo(() => {
    const needle = normalizeForSearch(portfolioSearch);

    return portfolio.filter((item) => {
      if (portfolioLevel && Number(item.counts?.[portfolioLevel] || 0) === 0) {
        return false;
      }
      if (needle) {
        const haystack = normalizeForSearch(`${item.companyName || ""} ${item.mandantEcb || ""}`);
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [portfolio, portfolioLevel, portfolioSearch]);

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
        [ecbNumber]: { tone: "ok", text: t("dashboard.syncLaunched") }
      }));
      // La synchronisation passe par la file d'attente : on laisse au worker le
      // temps de faire son travail avant de relire l'état.
      setTimeout(load, 20_000);
    } catch (err) {
      setSyncFeedback((current) => ({
        ...current,
        [ecbNumber]: { tone: "error", text: err.message || t("dashboard.syncErrorDefault") }
      }));
    } finally {
      setSyncingEcb("");
    }
  }

  function openDeleteModal(mandant) {
    setDeleteTarget(mandant);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  function closeDeleteModal() {
    if (deleting) {
      return;
    }
    setDeleteTarget(null);
    setDeleteConfirmText("");
    setDeleteError("");
  }

  async function handleDeleteMandant() {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.ecbNumber) {
      return;
    }

    try {
      setDeleting(true);
      setDeleteError("");
      await deleteMandant(deleteTarget.ecbNumber, deleteConfirmText);
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await load();
    } catch (err) {
      setDeleteError(err.message || t("dashboard.deleteModal.errorDefault"));
    } finally {
      setDeleting(false);
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
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{t("dashboard.metrics.dossiers")}</p>
          <p className="mt-2 font-display text-3xl font-semibold">{metrics.total}</p>
        </article>
        <article className="rounded-2xl border border-emerald-200 bg-emerald-50/85 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">{t("dashboard.metrics.alertStatus")}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-emerald-900">{metrics.alert}</p>
        </article>
        <article className="rounded-2xl border border-amber-200 bg-amber-50/85 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-700">{t("dashboard.metrics.warningStatus")}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-amber-900">{metrics.warning}</p>
        </article>
        <article className="rounded-2xl border border-orange-200 bg-orange-50/90 p-4 shadow-soft">
          <p className="text-xs uppercase tracking-[0.18em] text-orange-700">{t("dashboard.metrics.activeAlerts")}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-orange-900">{metrics.activeAlerts}</p>
        </article>
      </div>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("dashboard.portfolio.title")}</h2>
            <p className="text-sm text-gray-600">{t("dashboard.portfolio.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-44 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-gray-400"
              onChange={(event) => setPortfolioSearch(event.target.value)}
              placeholder={t("dashboard.portfolio.searchPlaceholder")}
              type="search"
              value={portfolioSearch}
            />
            <select
              className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted"
              onChange={(event) => setPortfolioLevel(event.target.value)}
              value={portfolioLevel}
            >
              <option value="">{t("dashboard.portfolio.levelAll")}</option>
              {PORTFOLIO_LEVEL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`dashboard.portfolio.level${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
                </option>
              ))}
            </select>
            <select
              className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted"
              onChange={(event) => setPortfolioCategory(event.target.value)}
              value={portfolioCategory}
            >
              <option value="">{t("dashboard.portfolio.categoryAll")}</option>
              {PORTFOLIO_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`dashboard.portfolio.category.${key}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!portfolioLoading && !portfolioError && portfolio.length > 0 && (
          <p className="mb-4 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2 text-sm text-ink">
            {portfolioSummary.totalCritical > 0 ? (
              (() => {
                const { criticalPart, dossierPart, warningPart } = t("dashboard.portfolio.summary", {
                  critical: portfolioSummary.totalCritical,
                  dossiers: portfolioSummary.dossiersWithCritical,
                  warning: portfolioSummary.totalWarning
                });
                return (
                  <>
                    <span className="font-semibold text-danger">{criticalPart}</span> {dossierPart}
                    {warningPart}.
                  </>
                );
              })()
            ) : (
              t("dashboard.portfolio.noneCritical")
            )}
          </p>
        )}

        {portfolioLoading && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("dashboard.portfolio.loading")}
          </p>
        )}

        {portfolioError && !portfolioLoading && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {portfolioError}
          </p>
        )}

        {!portfolioLoading && !portfolioError && portfolio.length > 0 && filteredPortfolio.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("dashboard.portfolio.noMatch")}
          </p>
        )}

        {!portfolioLoading && !portfolioError && portfolio.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("dashboard.portfolio.noFilterMatch")}
          </p>
        )}

        {!portfolioLoading && !portfolioError && filteredPortfolio.length > 0 && (
          <div className="mb-2 grid gap-2">
            {filteredPortfolio.map((item) => {
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
                    <p className="truncate font-semibold text-ink">{item.companyName || t("dashboard.portfolio.company")}</p>
                    <p className="text-xs text-gray-500">{t("dashboard.bce")} {item.mandantEcb}</p>
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
                          <p className="text-xs text-gray-500">
                            {t("dashboard.portfolio.documentOf", { date: formatDate(item.topAlert.documentDate) })}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">{t("dashboard.portfolio.nothingPending")}</p>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 sm:text-right">
                    {t("dashboard.portfolio.syncOf", { date: formatDate(item.lastSyncAt) })}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mb-6 mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-danger" /> {t("dashboard.portfolio.legendCritical")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" /> {t("dashboard.portfolio.legendWarning")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gray-300" /> {t("dashboard.portfolio.legendInfo")}
          </span>
        </p>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("dashboard.folders.title")}</h2>
            <p className="text-sm text-gray-600">{t("dashboard.folders.subtitle")}</p>
          </div>
          <button
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={load}
            type="button"
          >
            {t("dashboard.refresh")}
          </button>
        </div>

        {loading && <p className="text-gray-500">{t("dashboard.loading")}</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

        {!loading && mandants.length === 0 && !error && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("dashboard.noneConnected")}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mandants.map((mandant) => {
            const isSyncing = syncingEcb === mandant.ecbNumber;
            const disabled = isSyncing;
            const feedback = syncFeedback[mandant.ecbNumber];

            return (
              <article
                className="flex flex-col rounded-2xl border border-gray-200/70 bg-white p-4 shadow-soft transition hover:border-gray-300"
                key={mandant.ecbNumber}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold leading-tight">{mandant.companyName || t("dashboard.portfolio.company")}</h3>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusTone(mandant.status)}`}>
                    {mandant.status || "ok"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{t("dashboard.bce")}: {mandant.ecbNumber}</p>
                <p className="mt-1 text-sm text-gray-600">{t("dashboard.activeAlerts")}: {mandant.activeAlertCount ?? 0}</p>
                <p className="mt-1 text-sm text-gray-600">{t("dashboard.consent")}: {formatDate(mandant.consentGivenAt)}</p>
                <p className="mt-1 text-sm text-gray-600">{t("dashboard.lastSync")}: {formatDate(mandant.lastSyncAt)}</p>

                {!mandant.lastSyncAt && (
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
                      {isSyncing ? t("dashboard.syncing") : t("dashboard.firstSync")}
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
                )}

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <button
                    className="text-xs font-medium text-gray-400 transition hover:text-danger"
                    onClick={() => openDeleteModal(mandant)}
                    type="button"
                  >
                    {t("dashboard.deleteFolder")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-4 text-xs text-gray-500">{t("dashboard.autoSyncNote")}</p>
      </article>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDeleteModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-floating"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold text-danger">{t("dashboard.deleteModal.title")}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {t("dashboard.deleteModal.warning", {
                company: deleteTarget.companyName || t("dashboard.deleteModal.thisFolder"),
                ecb: deleteTarget.ecbNumber
              })}
            </p>
            <p className="mt-3 text-sm text-gray-700">
              {t("dashboard.deleteModal.confirmPrompt", { ecb: deleteTarget.ecbNumber })}
            </p>
            <input
              autoFocus
              className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={deleteTarget.ecbNumber}
              type="text"
              value={deleteConfirmText}
            />

            {deleteError && (
              <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-danger">
                {deleteError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                disabled={deleting}
                onClick={closeDeleteModal}
                type="button"
              >
                {t("dashboard.deleteModal.cancel")}
              </button>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  deleteConfirmText === deleteTarget.ecbNumber && !deleting
                    ? "bg-danger text-white shadow-soft hover:opacity-90"
                    : "cursor-not-allowed border border-line bg-gray-50 text-gray-400"
                }`}
                disabled={deleteConfirmText !== deleteTarget.ecbNumber || deleting}
                onClick={handleDeleteMandant}
                type="button"
              >
                {deleting ? t("dashboard.deleteModal.deleting") : t("dashboard.deleteModal.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export { DashboardPage };
