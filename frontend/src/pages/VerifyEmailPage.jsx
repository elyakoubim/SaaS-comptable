import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

// Contrairement a ResetPasswordPage (l'utilisateur choisit un mot de passe
// puis soumet), la verification n'a rien a demander : on l'envoie des que le
// token est present dans l'URL, une seule fois (StrictMode monte deux fois en
// dev - la ref evite un double appel qui invaliderait le token a usage unique).
function VerifyEmailPage({ status = "idle", message = "", onVerify }) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const hasTriggered = useRef(false);

  useEffect(() => {
    if (!token || hasTriggered.current) {
      return;
    }
    hasTriggered.current = true;
    onVerify({ token });
  }, [token, onVerify]);

  if (!token) {
    return (
      <section className="mx-auto mt-6 max-w-md">
        <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            Lien de confirmation invalide ou incomplet.
          </p>
          <p className="mt-4 text-center text-sm text-gray-600">
            <Link className="font-semibold text-accent hover:text-accent-strong" to="/">
              Retour a l'application
            </Link>
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-6 max-w-md">
      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Espace cabinet</p>
          <h2 className="font-display text-2xl font-semibold">Confirmation de l'email</h2>
        </div>

        {status === "verifying" && (
          <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Verification en cours...
          </p>
        )}

        {status === "success" && (
          <>
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {message || "Adresse email confirmee."}
            </p>
            <p className="mt-4 text-center text-sm text-gray-600">
              <Link className="font-semibold text-accent hover:text-accent-strong" to="/">
                Aller a l'application
              </Link>
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              {message || "Lien de confirmation invalide ou expire."}
            </p>
            <p className="mt-4 text-center text-sm text-gray-600">
              Connectez-vous puis demandez un nouvel envoi depuis l'application.
            </p>
          </>
        )}
      </article>
    </section>
  );
}

export { VerifyEmailPage };
