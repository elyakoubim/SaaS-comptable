import { useEffect, useState } from "react";
import { fetchSignals } from "../api";

/**
 * Page « Analyse ».
 *
 * Ce qui est affiché ici sort exclusivement des documents et des alertes
 * synchronisés depuis MyMinfin. Aucun chiffre n'est estimé, extrapolé ou
 * inventé — et c'est un changement de fond : la version précédente affichait
 * une « variation TVA vs N-1 », des « incohérences détectées » et un « score de
 * risque » dérivés des quatre derniers chiffres du numéro BCE.
 *
 * Tant que le contenu des PDF n'est pas extrait (montants, échéances,
 * communications structurées), l'analyse honnête est une analyse de flux :
 * volume, familles de documents, ancienneté des alertes ouvertes, fraîcheur de
 * la synchronisation.
 */

const CATEGORY_LABELS = {
  recouvrement: "Recouvrement",
  sanction: "Sanction",
  paiement: "Paiement",
  controle: "Contrôle",
  declaration: "Déclaration",
  attestation: "Attestation",
  accuse: "Accusé de réception",
  douane_accises: "Douane & accises",
  ubo: "Registre UBO",
  enregistrement: "Enregistrement",
  autre: "Autre"
};

// L'ordre dans lequel un comptable veut voir les familles : ce qui coûte de
// l'argent d'abord, ce qui s'archive ensuite.
const CATEGORY_ORDER = [
  "recouvrement",
  "sanction",
  "paiement",
  "controle",
  "ubo",
  "douane_accises",
  "declaration",
  "enregistrement",
  "attestation",
  "accuse",
  "autre"
];

const LEVEL_DOT = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-gray-300"
};

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function MandantCard({ signal }) {
  const categories = CATEGORY_ORDER.filter((key) => signal.byCategory[key]).map((key) => ({
    key,
    label: CATEGORY_LABELS[key] || key,
    count: signal.byCategory[key]
  }));

  const { critical, warning } = signal.activeAlerts;

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold leading-tight">
            {signal.companyName || "Entreprise"}
          </h3>
          <p className="text-xs text-gray-500">BCE {signal.mandantEcb}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {critical > 0 && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
              {critical} critique{critical > 1 ? "s" : ""}
            </span>
          )}
          {warning > 0 && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
              {warning} à traiter
            </span>
          )}
          {critical === 0 && warning === 0 && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              rien en attente
            </span>
          )}
        </div>
      </div>

      {signal.oldestOpenCriticalDays !== null && signal.oldestOpenCriticalDays >= 1 && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          La plus ancienne alerte critique est ouverte depuis{" "}
          <strong>
            {signal.oldestOpenCriticalDays} jour{signal.oldestOpenCriticalDays > 1 ? "s" : ""}
          </strong>
          .
        </p>
      )}

      {signal.syncIsStale && (
        <p className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Dernière synchronisation : {formatDate(signal.lastSyncAt)}. Les chiffres ci-dessous
          peuvent être en retard sur MyMinfin.
        </p>
      )}

      <p className="text-sm text-gray-700">
        <strong>{signal.documentCount}</strong> document{signal.documentCount > 1 ? "s" : ""} sur la
        fenêtre · dernier reçu le {formatDate(signal.lastDocumentDate)}
      </p>

      {categories.length > 0 && (
        <ul className="mt-3 space-y-1">
          {categories.map((category) => (
            <li className="flex items-center justify-between text-sm" key={category.key}>
              <span className="text-gray-600">{category.label}</span>
              <span className="font-semibold text-gray-800">{category.count}</span>
            </li>
          ))}
        </ul>
      )}

      {signal.topTypes.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-[0.16em] text-gray-500">
            Types les plus fréquents
          </p>
          <ul className="space-y-1">
            {signal.topTypes.map((type) => (
              <li className="flex items-center gap-2 text-sm text-gray-700" key={type.rawType}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[type.level]}`} />
                <span className="min-w-0 flex-1 truncate" title={type.rawType}>
                  {type.label}
                </span>
                <span className="font-semibold text-gray-800">{type.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function AnalysisPage() {
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchSignals()
      .then((payload) => {
        if (cancelled) return;
        setSignals(payload.data || []);
        setMeta({ windowDays: payload.windowDays, generatedAt: payload.generatedAt });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Chargement impossible");
        setSignals([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-5">
      <article className="rounded-2xl border border-line bg-white p-5 shadow-floating sm:p-6">
        <h2 className="font-display text-xl font-semibold">Analyse des flux</h2>
        <p className="mt-1 text-sm text-gray-600">
          Volume et nature des documents reçus de MyMinfin sur{" "}
          {meta?.windowDays ? `${meta.windowDays} jours` : "la fenêtre de rétention"}, et état des
          alertes ouvertes. Tous les chiffres proviennent des documents réellement synchronisés.
        </p>

        {loading && <p className="mt-5 text-gray-500">Chargement en cours…</p>}

        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {!loading && !error && signals.length === 0 && (
          <p className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            Aucun mandant connecté. Connectez un dossier pour voir apparaître son activité.
          </p>
        )}

        {signals.length > 0 && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {signals.map((signal) => (
              <MandantCard key={signal.mandantEcb} signal={signal} />
            ))}
          </div>
        )}

        <p className="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500">
          Les montants et les échéances ne sont pas encore extraits du contenu des documents : rien
          n'est estimé ici. Sur le jeu observé, 29 % des documents portent un montant ou une date
          d'échéance exploitable — c'est le prochain palier.
        </p>
      </article>
    </section>
  );
}

export { AnalysisPage };
