import { useCallback, useEffect, useState } from "react";
import { acknowledgeAlert, fetchAlerts } from "../api";

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

function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState("");

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const filters = filter === "all" ? {} : { level: filter };
      const payload = await fetchAlerts(filters);
      setAlerts(payload.items || []);
      setTotal(payload.total || 0);
    } catch (err) {
      setError(err.message || "Chargement impossible");
      setAlerts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter]);

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
      setError(err.message || "Acquittement impossible");
    } finally {
      setAcknowledgingId("");
    }
  }

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Alertes fiscales</h2>
            <p className="text-sm text-gray-600">
              Ce qui demande une décision, remonté depuis MyMinfin. Alertes actives : {total}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "Toutes" },
              { key: "critical", label: "Critiques" },
              { key: "warning", label: "À traiter" },
              { key: "info", label: "Information" }
            ].map((entry) => (
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
        </div>

        {loading && (
          <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Chargement...
          </p>
        )}

        {error && !loading && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!loading && !error && alerts.length === 0 && (
          <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Aucune alerte.
          </p>
        )}

        {!loading && alerts.length > 0 && (
          <div className="grid gap-3">
            {alerts.map((alert) => (
              <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft" key={alert.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{alert.title}</h3>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${levelTone(alert.level)}`}>
                    {alert.level}
                  </span>
                </div>
                {alert.detail && <p className="text-sm text-gray-700">{alert.detail}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>Mandant: {alert.companyName || alert.mandantEcb}</span>
                  <span>BCE: {alert.mandantEcb}</span>
                  <span>Date document: {formatDate(alert.documentDate)}</span>
                  <span>Statut: {alert.status}</span>
                </div>
                {alert.status === "active" && (
                  <div className="mt-3">
                    <button
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-60"
                      disabled={acknowledgingId === alert.id}
                      onClick={() => onAcknowledge(alert.id)}
                      type="button"
                    >
                      {acknowledgingId === alert.id ? "Acquittement..." : "Acquitter"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

export { AlertsPage };
