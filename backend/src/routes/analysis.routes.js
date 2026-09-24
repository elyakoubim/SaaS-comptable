import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  countDocumentsByType,
  countActiveAlertsByLevel
} from "../repositories/analysis.repository.js";
import { classifyDocument, TITLES } from "../services/documentClassifier.service.js";

const analysisRouter = Router();

// La fenêtre de rétention du SPF : au-delà, nous n'avons plus rien à analyser
// de toute façon, puisque les documents disparaissent de MyMinfin.
const DEFAULT_WINDOW_DAYS = 60;

// Au-delà, les chiffres affichés ne reflètent plus l'état réel du dossier et
// la page doit le dire plutôt que de laisser croire qu'ils sont à jour.
const STALE_SYNC_HOURS = 26;

function daysSince(value) {
  if (!value) return null;
  const ms = Date.now() - new Date(value).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

analysisRouter.get("/signals", requireAuth, async (req, res) => {
  try {
    const windowDays = Number.parseInt(String(req.query.days || ""), 10);
    const days = Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 60
      ? windowDays
      : DEFAULT_WINDOW_DAYS;

    const [typeRows, alertRows] = await Promise.all([
      countDocumentsByType(req.auth.cabinetId, days),
      countActiveAlertsByLevel(req.auth.cabinetId)
    ]);

    /** @type {Map<string, any>} */
    const byMandant = new Map();

    for (const row of typeRows) {
      let entry = byMandant.get(row.ecb_number);
      if (!entry) {
        entry = {
          mandantEcb: row.ecb_number,
          companyName: row.company_name || null,
          status: row.status || null,
          lastSyncAt: row.last_sync_at || null,
          documentCount: 0,
          lastDocumentDate: null,
          byCategory: {},
          topTypes: [],
          activeAlerts: { critical: 0, warning: 0, info: 0 },
          oldestOpenCriticalDays: null
        };
        byMandant.set(row.ecb_number, entry);
      }

      // Le LEFT JOIN produit une ligne à type nul quand le mandant n'a aucun
      // document sur la fenêtre : on garde le mandant, pas la ligne vide.
      if (!row.document_type_fps) continue;

      const { category, titleKey, level } = classifyDocument(row.document_type_fps);
      entry.documentCount += row.total;
      entry.byCategory[category] = (entry.byCategory[category] || 0) + row.total;
      entry.topTypes.push({
        label: TITLES[titleKey]?.fr || row.document_type_fps,
        rawType: row.document_type_fps,
        category,
        level,
        count: row.total
      });

      if (
        row.last_publish_date &&
        (!entry.lastDocumentDate || row.last_publish_date > entry.lastDocumentDate)
      ) {
        entry.lastDocumentDate = row.last_publish_date;
      }
    }

    for (const row of alertRows) {
      const entry = byMandant.get(row.mandant_ecb);
      if (!entry) continue;
      if (row.niveau in entry.activeAlerts) {
        entry.activeAlerts[row.niveau] = row.total;
      }
      if (row.niveau === "critical") {
        entry.oldestOpenCriticalDays = daysSince(row.oldest_triggered_at);
      }
    }

    const staleThreshold = Date.now() - STALE_SYNC_HOURS * 3_600_000;

    const data = [...byMandant.values()].map((entry) => ({
      ...entry,
      topTypes: entry.topTypes.sort((a, b) => b.count - a.count).slice(0, 5),
      syncIsStale: !entry.lastSyncAt || new Date(entry.lastSyncAt).getTime() < staleThreshold
    }));

    // Le tri met en tête ce qui demande une décision : les critiques ouvertes
    // d'abord, l'ancienneté ensuite.
    data.sort(
      (a, b) =>
        b.activeAlerts.critical - a.activeAlerts.critical ||
        (b.oldestOpenCriticalDays || 0) - (a.oldestOpenCriticalDays || 0) ||
        b.activeAlerts.warning - a.activeAlerts.warning
    );

    return res.json({
      data,
      windowDays: days,
      // Ce que la page a le droit d'afficher, et d'où ça sort. Le front s'en
      // sert pour dire au comptable sur quoi il regarde.
      basis: "documents et alertes synchronisés depuis MyMinfin",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { analysisRouter };
