import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

function ResetPasswordPage({ isSubmitting = false, error = "", successMessage = "", onSubmit }) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [localError, setLocalError] = useState("");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError("");

    if (password.length < 8) {
      setLocalError("Le mot de passe doit contenir au moins 8 caracteres.");
      return;
    }
    if (password !== passwordConfirm) {
      setLocalError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    await onSubmit({ token, password });
  }

  if (!token) {
    return (
      <section className="mx-auto mt-6 max-w-md">
        <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            Lien de reinitialisation invalide ou incomplet.
          </p>
          <p className="mt-4 text-center text-sm text-gray-600">
            <Link className="font-semibold text-accent hover:text-accent-strong" to="/forgot-password">
              Demander un nouveau lien
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
          <h2 className="font-display text-2xl font-semibold">Nouveau mot de passe</h2>
          <p className="mt-1 text-sm text-gray-600">Choisissez un nouveau mot de passe pour votre compte.</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="reset-password">
            Nouveau mot de passe
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="reset-password"
            placeholder="Minimum 8 caracteres"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="reset-password-confirm">
            Confirmer le mot de passe
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="reset-password-confirm"
            placeholder="Retapez le mot de passe"
            type="password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
          />

          {(localError || error) && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              {localError || error}
            </p>
          )}
          {successMessage && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          )}

          <button
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Enregistrement..." : "Choisir ce mot de passe"}
          </button>
        </form>
      </article>
    </section>
  );
}

export { ResetPasswordPage };
