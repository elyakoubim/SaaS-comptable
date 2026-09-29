import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { acknowledgeAlert, fetchAlerts, fetchDocumentBlob, requestAlertExtraction } from "../api";
import { useLanguage } from "../i18n/LanguageContext.jsx";
import { isProPlan } from "../plans.js";

// Miroir de ALLOWED_EXTRACTION_CATEGORIES cote backend
// (extraction.service.js) : categories ou un montant/echeance a du sens.
const EXTRACTABLE_CATEGORIES = new Set(["paiement", "recouvrement", "sanction", "declaration", "controle"]);

function formatMontant(value) {
  return value || null;
}

function formatEcheance(value) {
  if (!value) {
    return null;
  }
  try {
    return new Date(value).toLocaleDateString("fr-BE");
  } catch (_error) {
    return String(value);
  }
}

function levelTone(level) {
  if (level === "critical") {
    return "border-red-200 bg-red-50 text-danger";
  }
  if (level === "warning") {
    return "border-amber-200 bg-amber-50 text-warning";
  }
  return "border-accent-line bg-accent-soft text-accent-strong";
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  try {
    return new Date(value).toLocaleString("fr-BE");
  } catch (_error) {
    return String(value);
  }
}

function AlertsPage({ currentUser }) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const hasProAccess =
    isProPlan(currentUser?.subscriptionPlan) &&
    ["trialing", "active"].includes(currentUser?.subscriptionStatus);
  const mandantFilter = searchParams.get("mandant") || "";

  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState("");
  const [viewingId, setViewingId] = useState("");
  const [extractingId, setExtractingId] = useState("");

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const filters = filter === "all" ? {} : { level: filter };
      if (mandantFilter) {
        filters.mandant = mandantFilter;
      }
      // "Traitees" = acquittees (statut acknowledged), "Actives" = pas encore
      // traitees. "Toutes" ne filtre pas sur le statut.
      if (statusFilter === "active") {
        filters.acknowledged = false;
      } else if (statusFilter === "acknowledged") {
        filters.acknowledged = true;
      }
      const payload = await fetchAlerts(filters);
      setAlerts(payload.items || []);
      setTotal(payload.total || 0);
    } catch (err) {
      setError(err.message || t("alerts.errorDefault"));
      setAlerts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, mandantFilter, statusFilter]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  async function onAcknowledge(alertId) {
    if (!alertId || acknowledgingId) {
      return;
    }
    try {
      setAcknowledgingId(alertId);
      setError("");
      await acknowledgeAlert(alertId);
      await loadAlerts();
    } catch (err) {
      setError(err.message || t("alerts.acknowledgeErrorDefault"));
    } finally {
      setAcknowledgingId("");
    }
  }

  async function onViewDocument(documentFpsId) {
    if (!documentFpsId || viewingId) {
      return;
    }
    // On ouvre l'onglet tout de suite (synchrone) pour eviter que le
    // navigateur bloque le popup une fois le fetch termine.
    const tab = window.open("", "_blank");
    try {
      setViewingId(documentFpsId);
      setError("");
      const blob = await fetchDocumentBlob(documentFpsId);
      const blobUrl = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = blobUrl;
      } else {
        window.open(blobUrl, "_blank");
      }
    } catch (err) {
      if (tab) {
        tab.close();
      }
      setError(err.message || t("alerts.viewErrorDefault"));
    } finally {
      setViewingId("");
    }
  }

  async function onExtract(alert) {
    if (!alert?.id || extractingId) {
      return;
    }
    try {
      setExtractingId(alert.id);
      setError("");
      const extraction = await requestAlertExtraction(alert.id, { titre: alert.title });
      setAlerts((current) =>
        current.map((item) => (item.id === alert.id ? { ...item, extraction } : item))
      );
    } catch (err) {
      if (err.status === 402) {
        setError(t("alerts.extractionProNeeded"));
      } else {
        setError(err.message || t("alerts.extractionErrorDefault"));
      }
    } finally {
      setExtractingId("");
    }
  }

  const levelFilters = [
    { key: "all", label: t("alerts.filter.all") },
    { key: "critical", label: t("alerts.filter.critical") },
    { key: "warning", label: t("alerts.filter.warning") },
    { key: "info", label: t("alerts.filter.info") }
  ];
  const statusFilters = [
    { key: "active", label: t("alerts.status.active") },
    { key: "acknowledged", label: t("alerts.status.acknowledged") },
    { key: "all", label: t("alerts.status.all") }
  ];

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">{t("alerts.title")}</h2>
            <p className="text-sm text-gray-600">{t("alerts.subtitle", { total })}</p>
            {mandantFilter && (
              <p className="mt-1 text-xs text-gray-500">
                {t("alerts.filteredOn", { ecb: mandantFilter })}{" "}
                <Link className="font-semibold text-accent hover:text-accent-strong" to="/alerts">
                  {t("alerts.seeAll")}
                </Link>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap gap-2">
              {levelFilters.map((entry) => (
                <button
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === entry.key
                      ? "border border-accent-line bg-accent-soft text-accent-strong"
                      : "border border-line bg-white text-muted hover:bg-gray-50 hover:text-ink"
                  }`}
                  key={entry.key}
                  onClick={() => setFilter(entry.key)}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((entry, index) => (
                <button
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === entry.key
                      ? "border border-line bg-gray-100 text-ink"
                      : "border border-line bg-white text-muted hover:bg-gray-50 hover:text-ink"
                  }`}
                  key={`${entry.key}-${index}`}
                  onClick={() => setStatusFilter(entry.key)}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("alerts.loading")}
          </p>
        )}

        {error && !loading && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!loading && !error && alerts.length === 0 && (
          <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t("alerts.none")}
          </p>
        )}

        {!loading && alerts.length > 0 && (
          <div className="grid gap-3">
            {alerts.map((alert) => {
              const isAcknowledged = alert.status === "acknowledged";
              return (
                <article
                  className={`rounded-2xl border p-4 shadow-soft ${
                    isAcknowledged ? "border-gray-100 bg-gray-50" : "border-gray-200 bg-white"
                  }`}
                  key={alert.id}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className={`font-display text-lg font-semibold ${isAcknowledged ? "text-gray-500" : ""}`}>
                      {alert.title}
                    </h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${
                        isAcknowledged ? "border-gray-200 bg-gray-100 text-gray-500" : levelTone(alert.level)
                      }`}
                    >
                      {alert.level}
                    </span>
                  </div>
                  {alert.detail && (
                    <p className={`text-sm ${isAcknowledged ? "text-gray-500" : "text-gray-700"}`}>{alert.detail}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    <span>{t("alerts.mandant")}: {alert.companyName || alert.mandantEcb}</span>
                    <span>{t("alerts.bce")}: {alert.mandantEcb}</span>
                    <span>{t("alerts.documentDate")}: {formatDate(alert.documentDate)}</span>
                  </div>

                  {alert.extraction && (
                    <div className="mt-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm text-accent-strong">
                      <p className="font-semibold">{alert.extraction.accroche}</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {formatMontant(alert.extraction.montant) && (
                          <span>{t("alerts.amount")} : {formatMontant(alert.extraction.montant)}</span>
                        )}
                        {formatEcheance(alert.extraction.dateEcheance) && (
                          <span>{t("alerts.dueDate")} : {formatEcheance(alert.extraction.dateEcheance)}</span>
                        )}
                        {alert.extraction.reference && <span>{t("alerts.reference")} : {alert.extraction.reference}</span>}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {alert.documentFpsId && (
                      <button
                        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-soft transition hover:bg-gray-50 disabled:opacity-60"
                        disabled={viewingId === alert.documentFpsId}
                        onClick={() => onViewDocument(alert.documentFpsId)}
                        type="button"
                      >
                        {viewingId === alert.documentFpsId ? t("alerts.opening") : t("alerts.viewDocument")}
                      </button>
                    )}
                    {!alert.extraction && EXTRACTABLE_CATEGORIES.has(alert.category) && hasProAccess && (
                      <button
                        className="rounded-lg border border-accent-line bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-strong shadow-soft transition hover:bg-accent disabled:opacity-60"
                        disabled={extractingId === alert.id}
                        onClick={() => onExtract(alert)}
                        type="button"
                      >
                        {extractingId === alert.id ? t("alerts.readingInProgress") : t("alerts.readWithAi")}
                      </button>
                    )}
                    {!alert.extraction && EXTRACTABLE_CATEGORIES.has(alert.category) && !hasProAccess && (
                      <Link
                        className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted shadow-soft transition hover:bg-gray-50"
                        to="/billing?plan=pro"
                      >
                        {t("alerts.readWithAiPro")}
                      </Link>
                    )}
                    {alert.status === "active" && (
                      <button
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-60"
                        disabled={acknowledgingId === alert.id}
                        onClick={() => onAcknowledge(alert.id)}
                        type="button"
                      >
                        {acknowledgingId === alert.id ? t("alerts.markingInProgress") : t("alerts.markDone")}
                      </button>
                    )}
                    {isAcknowledged && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                        {t("alerts.doneOn", { date: formatDate(alert.acknowledgedAt) })}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

export { AlertsPage };
