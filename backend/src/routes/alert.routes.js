import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  listByAccountant,
  countActiveByAccountant
} from "../repositories/alert.repository.js";

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

alertRouter.get("/", requireAuth, async (req, res) => {
  try {
    const filters = {
      level: ["info", "warning", "critical"].includes(String(req.query.level || ""))
        ? String(req.query.level)
        : undefined,
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
      documentFpsId: row.document_fps_id,
      documentTypeFps: row.document_type_fps,
      documentDate: row.document_date,
      triggeredAt: row.triggered_at,
      status: row.statut,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by
    }));

    return res.json({ items, total });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { alertRouter };
