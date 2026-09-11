import { useEffect, useMemo, useState } from "react";
import { fetchMandants, forceSync } from "../api";

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
