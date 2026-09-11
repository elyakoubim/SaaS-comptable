import { Link, useLocation } from "react-router-dom";

function ConnectResultPage({ mode }) {
  const location = useLocation();
  const reason = new URLSearchParams(location.search).get("reason");

  if (mode === "success") {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50/90 p-6 shadow-floating">
        <h2 className="font-display text-2xl font-semibold text-emerald-900">Dossier connecté</h2>
        <p className="mt-2 text-emerald-800">Le consentement a ete enregistre pour ce mandant.</p>
        <Link
          className="mt-5 inline-block rounded-full bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
          to="/connect"
        >
          Retour a la connexion
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50/90 p-6 shadow-floating">
      <h2 className="font-display text-2xl font-semibold text-red-900">Connexion interrompue</h2>
      <p className="mt-2 text-red-800">{reason ? decodeURIComponent(reason) : "Erreur inconnue"}</p>
      <Link className="mt-5 inline-block rounded-full bg-red-900 px-4 py-2 text-sm font-semibold text-white" to="/connect">
        Reessayer
      </Link>
    </section>
  );
}

export { ConnectResultPage };
