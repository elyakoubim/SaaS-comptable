import { useEffect, useState } from "react";
import { fetchMandants, startFpsConnection } from "../api";
import { useLanguage } from "../i18n/LanguageContext.jsx";

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-BE");
}

function ConnectMandantPage() {
  const { t } = useLanguage();
  const [ecbNumber, setEcbNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mandants, setMandants] = useState([]);

  async function loadMandants() {
    try {
      const payload = await fetchMandants();
      setMandants(payload.data || []);
    } catch (_error) {
      setMandants([]);
    }
  }

  useEffect(() => {
    loadMandants();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");

    if (!/^\d{10}$/.test(ecbNumber)) {
      setError(t("connect.ecbError"));
      return;
    }

    try {
      setLoading(true);
      const payload = await startFpsConnection(ecbNumber);
      window.location.href = payload.authorizationUrl;
    } catch (err) {
      setError(err.message || t("connect.unexpectedError"));
      setLoading(false);
    }
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <h2 className="font-display text-xl font-semibold">{t("connect.title")}</h2>
        <p className="mt-1 text-sm text-gray-600">{t("connect.subtitle")}</p>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="ecb">
            {t("connect.ecbLabel")}
          </label>
          <input
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none ring-0 transition focus:border-accent"
            id="ecb"
            inputMode="numeric"
            pattern="[0-9]{10}"
            placeholder={t("connect.ecbPlaceholder")}
            value={ecbNumber}
            onChange={(event) => setEcbNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
          />

          {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

          <button
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
            disabled={loading}
            type="submit"
          >
            {loading ? t("connect.redirecting") : t("connect.submit")}
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{t("connect.connectedTitle")}</h2>
          <button
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition"
            onClick={loadMandants}
            type="button"
          >
            {t("connect.refresh")}
          </button>
        </div>

        <div className="grid gap-3">
          {mandants.length === 0 && (
            <p className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {t("connect.none")}
            </p>
          )}

          {mandants.map((mandant) => (
            <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft" key={mandant.ecbNumber}>
              <h3 className="font-display text-lg font-semibold">{mandant.companyName || t("connect.company")}</h3>
              <div className="mt-1 grid gap-1 text-sm text-gray-600">
                <span>{t("connect.bce")}: {mandant.ecbNumber}</span>
                <span>{t("connect.status")}: {mandant.status}</span>
                <span>{t("connect.activeAlerts")}: {mandant.activeAlertCount ?? 0}</span>
                <span>{t("connect.consent")}: {formatDate(mandant.consentGivenAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}

export { ConnectMandantPage };
