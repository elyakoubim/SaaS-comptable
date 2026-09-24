import { Link } from "react-router-dom";

function BillingResultPage({ mode }) {
  if (mode === "success") {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-floating">
        <h2 className="font-display text-2xl font-semibold text-emerald-900">Abonnement active</h2>
        <p className="mt-2 text-emerald-800">
          Votre periode d'essai de 14 jours a commence. Vous pouvez des maintenant profiter de Vatu.
        </p>
        <Link className="mt-5 inline-block rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white" to="/">
          Aller au tableau de bord
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-floating">
      <h2 className="font-display text-2xl font-semibold text-ink">Abonnement annule</h2>
      <p className="mt-2 text-muted">Aucun montant n'a ete preleve. Vous pouvez reessayer a tout moment.</p>
      <Link className="mt-5 inline-block rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white" to="/billing">
        Retour aux offres
      </Link>
    </section>
  );
}

export { BillingResultPage };
