import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createCheckoutSession, changeSubscriptionPlan, createPortalSession } from "../api";

const PLANS = [
  {
    key: "connect",
    name: "Vatu Connect",
    monthly: 19,
    annual: 16,
    description: "Centralisation MyMinfin, connectez votre propre IA via MCP.",
    features: [
      "Tous les documents MyMinfin centralises",
      "Rafraichi chaque jour",
      "Notification « nouveau document »",
      "Branchez votre IA via MCP (Claude, ChatGPT)"
    ]
  },
  {
    key: "pro",
    name: "Vatu Pro",
    monthly: 29,
    annual: 24,
    description: "Tout Vatu Connect, plus la lecture de vos documents par l'IA de Vatu.",
    features: [
      "Tout Vatu Connect",
      "Lecture IA par Vatu",
      "Extraction des echeances & montants",
      "Alertes structurees, cout des tokens inclus"
    ]
  }
];

function BillingPage({ currentUser }) {
  const [searchParams] = useSearchParams();
  const recommendedPlan = ["connect", "pro"].includes(searchParams.get("plan"))
    ? searchParams.get("plan")
    : null;

  const [interval, setInterval_] = useState("annual");
  const [loadingPlan, setLoadingPlan] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const activePlan = currentUser?.subscriptionPlan || null;
  const activeStatus = currentUser?.subscriptionStatus || null;
  const hasActiveSubscription = Boolean(activePlan) && activeStatus !== "canceled";

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
      setError(err.message || "Impossible de demarrer l'abonnement");
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
      setError(err.message || "Impossible d'ouvrir le portail de facturation");
      setPortalLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl">
      <h2 className="font-display text-2xl font-semibold text-ink">Abonnement</h2>
      <p className="mt-2 text-sm text-muted">
        14 jours d'essai gratuit sur les deux offres. Carte demandee a l'inscription, debit
        automatique a l'issue de l'essai, annulable a tout moment.
      </p>

      {hasActiveSubscription && (
        <div className="mt-4 rounded-2xl border border-accent-line bg-accent-soft p-4 text-sm text-accent-strong">
          <p>
            Abonnement actuel : <strong>{activePlan === "pro" ? "Vatu Pro" : "Vatu Connect"}</strong>{" "}
            ({activeStatus === "trialing" ? "periode d'essai" : activeStatus})
          </p>
          <button
            className="mt-3 rounded-full border border-accent-line bg-white px-4 py-1.5 text-sm font-medium text-accent-strong shadow-soft transition hover:bg-accent-soft disabled:opacity-60"
            disabled={portalLoading}
            onClick={handleManageSubscription}
            type="button"
          >
            {portalLoading ? "Ouverture..." : "Gerer mon abonnement"}
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
          Mensuel
        </button>
        <button
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            interval === "annual" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => setInterval_("annual")}
          type="button"
        >
          Annuel (-17%)
        </button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {PLANS.map((plan) => {
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
                  Recommande pour "Lire avec l'IA"
                </span>
              )}
              <h3 className="font-display text-lg font-semibold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted">{plan.description}</p>
              <p className="mt-4">
                <span className="font-display text-3xl font-bold text-ink">{price} €</span>
                <span className="text-sm text-muted"> / mois</span>
              </p>
              {interval === "annual" && (
                <p className="text-xs text-muted">Facture {price * 12} € par an</p>
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
                  ? "Offre actuelle"
                  : loadingPlan === plan.key
                    ? "Redirection..."
                    : "Demarrer mon essai gratuit"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export { BillingPage };
