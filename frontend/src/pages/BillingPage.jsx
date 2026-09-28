import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createCheckoutSession, changeSubscriptionPlan, createPortalSession, deleteAccount } from "../api";
import { useLanguage } from "../i18n/LanguageContext.jsx";

const PLAN_KEYS = ["connect", "pro"];
const PLAN_PRICES = {
  connect: { monthly: 19, annual: 16 },
  pro: { monthly: 29, annual: 24 }
};

function BillingPage({ currentUser, onAccountDeleted }) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const recommendedPlan = PLAN_KEYS.includes(searchParams.get("plan")) ? searchParams.get("plan") : null;

  const [interval, setInterval_] = useState("annual");
  const [loadingPlan, setLoadingPlan] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const activePlan = currentUser?.subscriptionPlan || null;
  const activeStatus = currentUser?.subscriptionStatus || null;
  const hasActiveSubscription = Boolean(activePlan) && activeStatus !== "canceled";
  const isOwner = currentUser?.role === "owner";

  const plans = PLAN_KEYS.map((key) => ({
    key,
    name: t(`billing.plan.${key}.name`),
    monthly: PLAN_PRICES[key].monthly,
    annual: PLAN_PRICES[key].annual,
    description: t(`billing.plan.${key}.description`),
    features: t(`billing.plan.${key}.features`)
  }));

  async function handleSubscribe(planKey) {
    try {
      setError("");
      setLoadingPlan(planKey);
      // Deja abonne (a un autre plan ou au meme) : on change l'abonnement Stripe
      // existant en place, jamais un second Checkout - ca creerait un
      // abonnement en double au lieu de changer d'offre.
      if (hasActiveSubscription) {
        await changeSubscriptionPlan({ plan: planKey, interval });
        window.location.reload();
        return;
      }
      const { url } = await createCheckoutSession({ plan: planKey, interval });
      window.location.href = url;
    } catch (err) {
      setError(err.message || t("billing.errorDefault"));
      setLoadingPlan("");
    }
  }

  async function handleManageSubscription() {
    try {
      setError("");
      setPortalLoading(true);
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      setError(err.message || t("billing.portalErrorDefault"));
      setPortalLoading(false);
    }
  }

  async function onDeleteSubmit(event) {
    event.preventDefault();
    try {
      setIsDeleting(true);
      setDeleteError("");
      await deleteAccount(deletePassword);
      onAccountDeleted?.();
    } catch (err) {
      setDeleteError(err.message || t("billing.danger.errorDefault"));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <h2 className="font-display text-2xl font-semibold text-ink">{t("billing.title")}</h2>
      <p className="mt-2 text-sm text-muted">{t("billing.subtitle")}</p>

      {hasActiveSubscription && (
        <div className="mt-4 rounded-2xl border border-accent-line bg-accent-soft p-4 text-sm text-accent-strong">
          <p>
            {t("billing.currentPlan", {
              plan: activePlan === "pro" ? t("billing.plan.pro.name") : t("billing.plan.connect.name"),
              status: activeStatus === "trialing" ? t("billing.status.trialing") : activeStatus
            })}
          </p>
          <button
            className="mt-3 rounded-full border border-accent-line bg-white px-4 py-1.5 text-sm font-medium text-accent-strong shadow-soft transition hover:bg-accent-soft disabled:opacity-60"
            disabled={portalLoading}
            onClick={handleManageSubscription}
            type="button"
          >
            {portalLoading ? t("billing.opening") : t("billing.manage")}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}

      <div className="mt-6 inline-flex rounded-full border border-line bg-white p-1 shadow-soft">
        <button
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            interval === "monthly" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => setInterval_("monthly")}
          type="button"
        >
          {t("billing.interval.monthly")}
        </button>
        <button
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            interval === "annual" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => setInterval_("annual")}
          type="button"
        >
          {t("billing.interval.annual")}
        </button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {plans.map((plan) => {
          const price = interval === "annual" ? plan.annual : plan.monthly;
          const isCurrent = activePlan === plan.key && hasActiveSubscription;
          const isRecommended = recommendedPlan === plan.key && !isCurrent;
          return (
            <div
              className={`rounded-2xl border bg-white p-6 shadow-soft ${
                isRecommended ? "border-accent ring-2 ring-accent-soft" : "border-line"
              }`}
              key={plan.key}
            >
              {isRecommended && (
                <span className="mb-2 inline-block rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                  {t("billing.recommendedForAi")}
                </span>
              )}
              <h3 className="font-display text-lg font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted">{plan.description}</p>
              <p className="mt-4">
                <span className="font-display text-3xl font-bold text-ink">{price} €</span>
                <span className="text-sm text-muted"> {t("billing.perMonth")}</span>
              </p>
              {interval === "annual" && (
                <p className="text-xs text-muted">{t("billing.billedPerYear", { price: price * 12 })}</p>
              )}
              <ul className="mt-4 space-y-1.5 text-sm text-gray-600">
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              <button
                className="mt-5 w-full rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-60"
                disabled={isCurrent || loadingPlan === plan.key}
                onClick={() => handleSubscribe(plan.key)}
                type="button"
              >
                {isCurrent
                  ? t("billing.current")
                  : loadingPlan === plan.key
                    ? t("billing.redirecting")
                    : t("billing.startTrial")}
              </button>
            </div>
          );
        })}
      </div>

      <article className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-floating">
        <h2 className="mb-1 text-sm font-semibold text-danger">{t("billing.danger.title")}</h2>
        <p className="mb-3 text-sm text-gray-600">
          {isOwner ? t("billing.danger.owner") : t("billing.danger.member")}
        </p>

        {!showDeleteForm && (
          <button
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-danger shadow-soft transition hover:bg-red-50"
            onClick={() => setShowDeleteForm(true)}
            type="button"
          >
            {t("billing.danger.deleteAccount")}
          </button>
        )}

        {showDeleteForm && (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onDeleteSubmit}>
            <input
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-danger sm:flex-1"
              placeholder={t("billing.danger.confirmPlaceholder")}
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <button
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-70"
              disabled={isDeleting || !deletePassword}
              type="submit"
            >
              {isDeleting ? t("billing.danger.deleting") : t("billing.danger.confirm")}
            </button>
            <button
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-muted shadow-soft transition hover:bg-gray-50"
              disabled={isDeleting}
              onClick={() => {
                setShowDeleteForm(false);
                setDeletePassword("");
                setDeleteError("");
              }}
              type="button"
            >
              {t("billing.danger.cancel")}
            </button>
          </form>
        )}

        {deleteError && (
          <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {deleteError}
          </p>
        )}
      </article>
    </section>
  );
}

export { BillingPage };
