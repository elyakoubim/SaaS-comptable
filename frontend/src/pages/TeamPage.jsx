import { useEffect, useState } from "react";
import { fetchCabinetMembers, inviteCabinetMember } from "../api";

const ROLE_LABELS = {
  owner: "Titulaire",
  member: "Membre"
};

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Gestion d'equipe du cabinet. Tout membre voit la liste (coherent avec
 * "tout le monde voit tout" sur les dossiers), seul le owner peut inviter
 * (decision multi-utilisateurs du 24/09/2026).
 */
function TeamPage({ currentUser }) {
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  const isOwner = currentUser?.role === "owner";

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
          setLoadError(error.message || "Impossible de charger l'equipe");
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

  return (
    <section className="mx-auto mt-6 max-w-4xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Cabinet</p>
        <h1 className="font-display text-2xl font-semibold">Equipe</h1>
        <p className="mt-1 text-sm text-gray-600">
          Tous les membres de votre cabinet voient les memes dossiers et alertes.
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
          <h2 className="mb-1 text-sm font-semibold text-gray-700">Inviter un collegue</h2>
          <p className="mb-3 text-sm text-gray-600">
            Generez un lien d'inscription pour ajouter un membre a votre cabinet. Il aura acces aux
            memes dossiers, mais pas a la facturation.
          </p>

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onInviteSubmit}>
            <input
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-accent sm:flex-1"
              placeholder="collegue@votre-fiduciaire.be"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
            <button
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-accent-strong disabled:opacity-70"
              disabled={isInviting || !inviteEmail}
              type="submit"
            >
              {isInviting ? "Envoi..." : "Generer le lien"}
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
    </section>
  );
}

export { TeamPage };
