import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireProPlan } from "../middleware/requirePlan.middleware.js";
import {
  acknowledgeAlert,
  listByAccountant,
  getAlertForAccountant,
  saveExtraction,
  countActiveByAccountant,
  getPortfolioSummary
} from "../repositories/alert.repository.js";
import { findByFpsId } from "../repositories/document.repository.js";
import { getValidAccessToken } from "../services/fpsAuth.service.js";
import { downloadDocument } from "../services/myMinfinClient.service.js";
import { ApiError, AuthError, RateLimitError } from "../services/myMinfinErrors.js";
import { extractAlertInsights, ExtractionNotEligibleError, ExtractionUnavailableError } from "../services/extraction.service.js";
import { CATEGORIES } from "../services/documentClassifier.service.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CATEGORIES = new Set(Object.values(CATEGORIES));

const alertRouter = Router();

function parseAcknowledged(raw) {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const normalized = String(raw).toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

function parsePositiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  if (max && parsed > max) {
    return max;
  }
  return parsed;
}

function parseCategory(raw) {
  const value = String(raw || "");
  return VALID_CATEGORIES.has(value) ? value : undefined;
}

alertRouter.get("/", requireAuth, async (req, res) => {
  try {
    const filters = {
      level: ["info", "warning", "critical"].includes(String(req.query.level || ""))
        ? String(req.query.level)
        : undefined,
      category: parseCategory(req.query.category),
      mandantEcb: /^\d{10}$/.test(String(req.query.mandant || ""))
        ? String(req.query.mandant)
        : undefined,
      acknowledged: parseAcknowledged(req.query.acknowledged),
      limit: parsePositiveInteger(req.query.limit, 50, 200),
      offset: parsePositiveInteger(req.query.offset, 0)
    };

    const rows = await listByAccountant(req.auth.accountantId, filters);
    const total = await countActiveByAccountant(req.auth.accountantId);

    const items = rows.map((row) => ({
      id: row.id,
      mandantEcb: row.mandant_ecb,
      companyName: row.company_name,
      level: row.niveau,
      title: row.titre,
      detail: row.detail,
      category: row.category,
      actionable: row.actionable,
      documentFpsId: row.document_fps_id,
      documentTypeFps: row.document_type_fps,
      documentDate: row.document_date,
      triggeredAt: row.triggered_at,
      status: row.statut,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      extraction: row.extracted_at
        ? {
            montant: row.extracted_montant,
            dateEcheance: row.extracted_date_echeance,
            reference: row.extracted_reference,
            accroche: row.extracted_accroche,
            extractedAt: row.extracted_at
          }
        : null
    }));

    return res.json({ items, total });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * Vue portefeuille : une ligne par dossier du cabinet, triée par urgence
 * (compteurs critical > warning > info), avec l'alerte la plus urgente de
 * chaque dossier. Support de `?category=` pour restreindre à une des onze
 * catégories métier du classificateur.
 */
alertRouter.get("/portfolio", requireAuth, async (req, res) => {
  try {
    const category = parseCategory(req.query.category);

    const rows = await getPortfolioSummary(req.auth.accountantId, { category });

    const items = rows.map((row) => ({
      mandantEcb: row.ecb_number,
      companyName: row.company_name,
      lastSyncAt: row.last_sync_at,
      counts: {
        critical: row.critical_count,
        warning: row.warning_count,
        info: row.info_count
      },
      topAlert: row.top_title
        ? {
            title: row.top_title,
            level: row.top_level,
            category: row.top_category,
            documentDate: row.top_document_date
          }
        : null
    }));

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

alertRouter.post("/:id/acknowledge", requireAuth, async (req, res) => {
  try {
    const alertId = String(req.params.id || "");
    if (!UUID_PATTERN.test(alertId)) {
      return res.status(400).json({ message: "id must be a valid UUID" });
    }

    const updated = await acknowledgeAlert(alertId, req.auth.accountantId);
    if (!updated) {
      return res.status(404).json({ message: "Alert not found for authenticated accountant" });
    }

    return res.json({
      id: updated.id,
      status: updated.statut,
      acknowledgedAt: updated.acknowledged_at,
      acknowledgedBy: updated.acknowledged_by
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * "Lire avec l'IA" (Vatu Pro) : extrait montant/echeance/reference/accroche
 * du document lie a l'alerte, via Claude Haiku. Ne re-telecharge/relit jamais
 * un document deja lu - `extracted_at` sert de cache permanent (le contenu
 * d'un document MyMinfin ne change pas apres publication).
 */
alertRouter.post("/:id/extract", requireAuth, requireProPlan, async (req, res) => {
  const alertId = String(req.params.id || "");
  if (!UUID_PATTERN.test(alertId)) {
    return res.status(400).json({ message: "id must be a valid UUID" });
  }

  try {
    const alert = await getAlertForAccountant(alertId, req.auth.accountantId);
    if (!alert) {
      return res.status(404).json({ message: "Alerte introuvable" });
    }

    if (alert.extracted_at) {
      return res.json({
        montant: alert.extracted_montant,
        dateEcheance: alert.extracted_date_echeance,
        reference: alert.extracted_reference,
        accroche: alert.extracted_accroche,
        extractedAt: alert.extracted_at,
        cached: true
      });
    }

    if (!alert.document_fps_id) {
      return res.status(400).json({ message: "Aucun document lie a cette alerte" });
    }

    const document = await findByFpsId(alert.document_fps_id);
    if (!document) {
      return res.status(404).json({ message: "Document introuvable" });
    }

    const accessToken = await getValidAccessToken(alert.mandant_ecb);
    const { content, contentType } = await downloadDocument(accessToken, alert.document_fps_id, {
      ownerType: document.owner_type,
      ownerIdentifier: document.owner_identifier
    });

    if (contentType !== "application/pdf") {
      return res.status(400).json({
        message: "Ce format de document n'est pas pris en charge par la lecture IA"
      });
    }

    const insights = await extractAlertInsights({
      pdfBuffer: content,
      category: alert.category,
      titre: req.body?.titre
    });

    const saved = await saveExtraction(alertId, insights);

    return res.json({
      montant: saved.extracted_montant,
      dateEcheance: saved.extracted_date_echeance,
      reference: saved.extracted_reference,
      accroche: saved.extracted_accroche,
      extractedAt: saved.extracted_at,
      cached: false
    });
  } catch (error) {
    if (error instanceof ExtractionNotEligibleError) {
      return res.status(400).json({ message: error.message });
    }

    if (error instanceof ExtractionUnavailableError) {
      return res.status(503).json({ message: error.message });
    }

    if (error instanceof RateLimitError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      return res.status(429).json({
        message: "Quota MyMinfin atteint, réessayez dans un instant",
        retryAfterSeconds: error.retryAfterSeconds
      });
    }

    if (error instanceof AuthError) {
      return res.status(error.retryable ? 503 : 403).json({ message: error.message });
    }

    if (error instanceof ApiError) {
      return res.status(error.status && error.status >= 400 ? error.status : 502).json({
        message: error.message
      });
    }

    console.error(`[alerts] extraction failed for ${alertId}:`, error.message);
    return res.status(500).json({ message: error.message });
  }
});

export { alertRouter };
