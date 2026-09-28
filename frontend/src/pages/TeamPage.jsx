import { useEffect, useState } from "react";
import { fetchCabinetMembers, inviteCabinetMember, deleteAccount } from "../api";

const ROLE_LABELS = {
  owner: "Titulaire",
  member: "Membre"
};

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Gestion d'équipe du cabinet. Tout membre voit la liste (cohérent avec
 * "tout le monde voit tout" sur les dossiers), seul le owner peut inviter
 * (décision multi-utilisateurs du 24/09/2026).
 */
function TeamPage({ currentUser, onAccountDeleted }) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const isOwner = currentUser?.role === "owner";
  // Vatu Connect est un abonnement a un seul utilisateur : l'invitation est
  // reservee a Vatu Pro (le backend refuse en 402 de toute facon).
  const canInvite =
    currentUser?.subscriptionPlan === "pro" &&
    ["trialing", "active"].includes(currentUser?.subscriptionStatus);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setLoadError("");
        const items = await fetchCabinetMembers();
        if (!cancelled) {
          setMembers(items);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Impossible de charger l'équipe");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onInviteSubmit(event) {
    event.preventDefault();
    try {
      setIsInviting(true);
      setInviteError("");
      setInviteLink("");
      setCopied(false);
      const result = await inviteCabinetMember(inviteEmail);
      setInviteLink(result.inviteUrl || "");
      setInviteEmail("");
    } catch (error) {
      setInviteError(error.message || "Invitation impossible");
    } finally {
      setIsInviting(false);
    }
  }

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function onDeleteSubmit(event) {
    event.preventDefault();
    try {
      setIsDeleting(true);
      setDeleteError("");
      await deleteAccount(deletePassword);
      onAccountDeleted?.();
    } catch (error) {
      setDeleteError(error.message || "Suppression impossible");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="mx-auto mt-6 max-w-4xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Cabinet</p>
        <h1 className="font-display text-2xl font-semibold">Équipe</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tous les membres de votre cabinet voient les mêmes dossiers et alertes.
        </p>
      </div>

      <article className="rounded-2xl border border-line bg-white p-6 shadow-floating">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Membres</h2>

        {isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
        {loadError && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">{loadError}</p>
        )}

        {!isLoading && !loadError && (
          <ul className="divide-y divide-line">
            {members.map((member) => (
              <li className="flex items-center justify-between py-2.5" key={member.id}>
                <div>
                  <p className="text-sm font-medium text-ink">{member.fullName}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-line bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                  <span className="text-xs text-gray-400">Depuis {formatDate(member.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      {isOwner && (
        <article className="rounded-2xl border border-line bg-white p-6 shadow-floating">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Inviter un collègue</h2>
          <p className="mb-3 text-sm text-gray-600">
            Générez un lien d'inscription pour ajouter un membre à votre cabinet. Il aura accès aux
            mêmes dossiers, mais pas à la facturation.
          </p>

          {!canInvite && (
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5 text-sm text-accent-strong sm:flex-row sm:items-center sm:justify-between">
              <span>Vatu Connect est limité à un utilisateur. Passez à Vatu Pro pour inviter votre équipe.</span>
              <a
                className="shrink-0 rounded-lg border border-accent-line bg-white px-3 py-1.5 text-xs font-semibold text-accent-strong hover:bg-accent-soft"
                href="/billing"
              >
                Voir Vatu Pro
              </a>
            </div>
          )}

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onInviteSubmit}>
            <input
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent sm:flex-1"
              placeholder="collegue@votre-fiduciaire.be"
              type="email"
              value={inviteEmail}
              disabled={!canInvite}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <button
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
              disabled={!canInvite || isInviting || !inviteEmail}
              type="submit"
            >
              {isInviting ? "Envoi..." : "Générer le lien"}
            </button>
          </form>

          {inviteError && (
            <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
              {inviteError}
            </p>
          )}

          {inviteLink && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5 sm:flex-row sm:items-center">
              <code className="flex-1 break-all text-xs text-accent-strong">{inviteLink}</code>
              <button
                className="shrink-0 rounded-lg border border-accent-line bg-white px-3 py-1.5 text-xs font-semibold text-accent-strong hover:bg-accent-soft"
                onClick={onCopyLink}
                type="button"
              >
                {copied ? "Copie !" : "Copier"}
              </button>
            </div>
          )}
        </article>
      )}

      <article className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-floating">
        <h2 className="mb-1 text-sm font-semibold text-danger">Zone dangereuse</h2>
        <p className="mb-3 text-sm text-gray-600">
          {isOwner
            ? "Supprime definitivement votre compte ET tout le cabinet : mandats, documents, alertes et abonnement. Action irreversible pour toute l'equipe."
            : "Supprime definitivement votre compte. Les mandats et alertes du cabinet restent accessibles au reste de l'equipe."}
        </p>

        {!showDeleteForm && (
          <button
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-danger shadow-soft transition hover:bg-red-50"
            onClick={() => setShowDeleteForm(true)}
            type="button"
          >
            Supprimer mon compte
          </button>
        )}

        {showDeleteForm && (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onDeleteSubmit}>
            <input
              autoComplete="current-password"
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-danger sm:flex-1"
              placeholder="Confirmez avec votre mot de passe"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <button
              className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-70"
              disabled={isDeleting || !deletePassword}
              type="submit"
            >
              {isDeleting ? "Suppression..." : "Confirmer la suppression"}
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
              Annuler
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

export { TeamPage };
