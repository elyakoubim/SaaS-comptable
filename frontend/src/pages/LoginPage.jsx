import { useState } from "react";
import { useSearchParams } from "react-router-dom";

function LoginPage({
  defaultEmail = "",
  isLoggingIn = false,
  isRegistering = false,
  loginError = "",
  planNotice = "",
  registerError = "",
  registerSuccess = "",
  onLogin,
  onRegister
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  async function onLoginSubmit(event) {
    event.preventDefault();
    await onLogin({ email, password });
  }

  async function onRegisterSubmit(event) {
    event.preventDefault();
    await onRegister({
      fullName: registerFullName,
      email: registerEmail,
      password: registerPassword,
      inviteToken
    });
  }

  return (
    <section className="mx-auto mt-6 max-w-6xl">
      {planNotice && (
        <p className="mb-4 rounded-xl border border-accent-line bg-accent-soft px-4 py-2.5 text-sm text-accent-strong">
          {planNotice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Espace cabinet</p>
          <h2 className="font-display text-2xl font-semibold">Authentification</h2>
          <p className="mt-1 text-sm text-gray-600">Connectez-vous pour acceder aux modules Dashboard, Alertes et Analyse.</p>
        </div>

        <form className="space-y-3" onSubmit={onLoginSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="email">
            Email
          </label>
          <input
            autoComplete="username"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="email"
            placeholder="vous@votre-fiduciaire.be"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="password">
            Mot de passe
          </label>
          <input
            autoComplete="current-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="password"
            placeholder="Votre mot de passe"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {loginError && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{loginError}</p>}

          <button
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
            disabled={isLoggingIn}
            type="submit"
          >
            {isLoggingIn ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating sm:p-7">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Nouveau compte</p>
          <h2 className="font-display text-2xl font-semibold">Inscription</h2>
          <p className="mt-1 text-sm text-gray-600">
            {inviteToken
              ? "Vous avez ete invite a rejoindre un cabinet existant sur Vatu."
              : "Creez un compte professionnel pour votre cabinet."}
          </p>
        </div>

        <form className="space-y-3" onSubmit={onRegisterSubmit}>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-fullname">
            Nom complet
          </label>
          <input
            autoComplete="name"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-fullname"
            placeholder="Votre fiduciaire"
            type="text"
            value={registerFullName}
            onChange={(event) => setRegisterFullName(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-email">
            Email professionnel
          </label>
          <input
            autoComplete="email"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-email"
            placeholder="contact@cabinet.be"
            type="email"
            value={registerEmail}
            onChange={(event) => setRegisterEmail(event.target.value)}
          />

          <label className="block text-sm font-semibold text-gray-700" htmlFor="register-password">
            Mot de passe
          </label>
          <input
            autoComplete="new-password"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent"
            id="register-password"
            placeholder="Minimum 8 caracteres"
            type="password"
            value={registerPassword}
            onChange={(event) => setRegisterPassword(event.target.value)}
          />

          {registerError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{registerError}</p>
          )}
          {registerSuccess && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {registerSuccess}
            </p>
          )}

          <button
            className="w-full rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink shadow-soft transition hover:bg-gray-50 disabled:opacity-70"
            disabled={isRegistering}
            type="submit"
          >
            {isRegistering ? "Inscription..." : "Creer mon compte"}
          </button>
        </form>
      </article>
      </div>
    </section>
  );
}

export { LoginPage };
