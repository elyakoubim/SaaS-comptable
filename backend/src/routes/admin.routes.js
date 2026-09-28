import { Router } from "express";
import { adminSecret, isAdminReviewEnabled } from "../config/admin.config.js";
import {
  getAlertForAdmin,
  listExtractionsForReview,
  saveExtractionVerification,
  getExtractionAccuracyStats
} from "../repositories/alert.repository.js";
import { findByFpsId } from "../repositories/document.repository.js";
import { getValidAccessToken } from "../services/fpsAuth.service.js";
import { downloadDocument } from "../services/myMinfinClient.service.js";
import { ApiError, AuthError, RateLimitError } from "../services/myMinfinErrors.js";
import { getObject, isObjectStorageEnabled } from "../services/objectStorage.service.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adminRouter = Router();

/**
 * Outil interne, jamais expose aux cabinets clients (point #21). Pas de
 * session comptable ici : un simple secret partage, genere une fois et pose
 * sur Render, verifie via header (appels fetch) ou parametre `secret`
 * (necessaire pour l'iframe qui affiche le PDF, qui ne peut pas poser de
 * header custom).
 */
function requireAdminSecret(req, res, next) {
  if (!isAdminReviewEnabled) {
    return res.status(503).json({ message: "Revue admin non configuree (ADMIN_SECRET manquant)" });
  }

  const provided = req.headers["x-admin-secret"] || req.query.secret;
  if (!provided || String(provided) !== adminSecret) {
    return res.status(401).json({ message: "Secret invalide" });
  }

  return next();
}

adminRouter.use(requireAdminSecret);

/**
 * File d'attente des extractions a verifier a la main (point #21). Un jeu de
 * booleens par champ (voir saveExtractionVerification) plutot qu'un verdict
 * global, pour identifier precisement quel champ pose probleme.
 */
adminRouter.get("/extraction-review", async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const onlyUnverified = req.query.all !== "true";

    const rows = await listExtractionsForReview({ limit, onlyUnverified });

    const items = rows.map((row) => ({
      id: row.id,
      mandantEcb: row.mandant_ecb,
      companyName: row.company_name,
      category: row.category,
      title: row.titre,
      documentFpsId: row.document_fps_id,
      extraction: {
        montant: row.extracted_montant,
        dateEcheance: row.extracted_date_echeance,
        reference: row.extracted_reference,
        accroche: row.extracted_accroche,
        extractedAt: row.extracted_at
      },
      verification:
        row.extraction_verified_at
          ? {
              montantCorrect: row.extraction_montant_correct,
              dateCorrect: row.extraction_date_correct,
              referenceCorrect: row.extraction_reference_correct,
              verifiedAt: row.extraction_verified_at,
              verifiedBy: row.extraction_verified_by
            }
          : null
    }));

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

/**
 * Sert le PDF d'une alerte pour la revue manuelle, sans passer par
 * l'appartenance a un cabinet (contrairement a GET /api/documents/:uuid/content)
 * puisque cet outil doit pouvoir echantillonner n'importe quel cabinet.
 * Reprend la meme logique R2-puis-SPF que document.routes.js.
 */
adminRouter.get("/extraction-review/:alertId/document", async (req, res) => {
  const alertId = String(req.params.alertId || "");
  if (!UUID_PATTERN.test(alertId)) {
    return res.status(400).json({ message: "alertId invalide" });
  }

  try {
    const alert = await getAlertForAdmin(alertId);
    if (!alert || !alert.document_fps_id) {
      return res.status(404).json({ message: "Document introuvable pour cette alerte" });
    }

    const document = await findByFpsId(alert.document_fps_id);
    if (!document) {
      return res.status(404).json({ message: "Document introuvable" });
    }

    if (isObjectStorageEnabled && document.content_key) {
      const archived = await getObject(document.content_key);
      if (archived) {
        res.setHeader("Content-Type", archived.contentType);
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(archived.content);
      }
    }

    const accessToken = await getValidAccessToken(alert.mandant_ecb);
    const { content, contentType } = await downloadDocument(accessToken, alert.document_fps_id, {
      ownerType: document.owner_type,
      ownerIdentifier: document.owner_identifier
    });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(content);
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      return res.status(429).json({ message: "Quota MyMinfin atteint, reessayez dans un instant" });
    }
    if (error instanceof AuthError) {
      return res.status(error.retryable ? 503 : 403).json({ message: error.message });
    }
    if (error instanceof ApiError) {
      return res.status(error.status && error.status >= 400 ? error.status : 502).json({ message: error.message });
    }

    console.error(`[admin] document fetch failed for alert ${alertId}:`, error.message);
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.post("/extraction-review/:alertId/verify", async (req, res) => {
  const alertId = String(req.params.alertId || "");
  if (!UUID_PATTERN.test(alertId)) {
    return res.status(400).json({ message: "alertId invalide" });
  }

  try {
    const { montantCorrect, dateCorrect, referenceCorrect, verifiedBy } = req.body || {};

    const saved = await saveExtractionVerification(alertId, {
      montantCorrect: typeof montantCorrect === "boolean" ? montantCorrect : null,
      dateCorrect: typeof dateCorrect === "boolean" ? dateCorrect : null,
      referenceCorrect: typeof referenceCorrect === "boolean" ? referenceCorrect : null,
      verifiedBy: verifiedBy ? String(verifiedBy).slice(0, 200) : null
    });

    if (!saved) {
      return res.status(404).json({ message: "Alerte introuvable" });
    }

    return res.json({
      id: saved.id,
      montantCorrect: saved.extraction_montant_correct,
      dateCorrect: saved.extraction_date_correct,
      referenceCorrect: saved.extraction_reference_correct,
      verifiedAt: saved.extraction_verified_at,
      verifiedBy: saved.extraction_verified_by
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

adminRouter.get("/extraction-review/stats", async (_req, res) => {
  try {
    const rows = await getExtractionAccuracyStats();

    const items = rows.map((row) => {
      const rate = (correct, incorrect) => {
        const total = Number(correct) + Number(incorrect);
        return total > 0 ? Math.round((Number(correct) / total) * 1000) / 10 : null;
      };

      return {
        category: row.category,
        verifiedCount: Number(row.verified_count),
        montant: {
          correct: Number(row.montant_correct),
          incorrect: Number(row.montant_incorrect),
          accuracyPercent: rate(row.montant_correct, row.montant_incorrect)
        },
        dateEcheance: {
          correct: Number(row.date_correct),
          incorrect: Number(row.date_incorrect),
          accuracyPercent: rate(row.date_correct, row.date_incorrect)
        },
        reference: {
          correct: Number(row.reference_correct),
          incorrect: Number(row.reference_incorrect),
          accuracyPercent: rate(row.reference_correct, row.reference_incorrect)
        }
      };
    });

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { adminRouter };
