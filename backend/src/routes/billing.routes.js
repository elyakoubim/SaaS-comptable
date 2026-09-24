import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findCabinetById } from "../repositories/cabinet.repository.js";
import { createCheckoutSession, changeSubscriptionPlan, createPortalSession } from "../services/billing.service.js";

const billingRouter = Router();
const VALID_PLANS = new Set(["connect", "pro"]);
const VALID_INTERVALS = new Set(["monthly", "annual"]);

// La facturation est reservee au owner du cabinet (decision multi-utilisateurs
// du 24/09/2026) : un membre peut consulter/utiliser les dossiers, mais ne
// choisit ni ne paie l'abonnement du cabinet.
function requireOwner(req, res, next) {
  if (req.auth.role !== "owner") {
    return res.status(403).json({ message: "Reserve au titulaire du cabinet" });
  }
  return next();
}

billingRouter.post("/checkout", requireAuth, requireOwner, async (req, res) => {
  try {
    const plan = String(req.body?.plan || "");
    const interval = String(req.body?.interval || "");

    if (!VALID_PLANS.has(plan) || !VALID_INTERVALS.has(interval)) {
      return res.status(400).json({ message: "plan doit etre 'connect'|'pro', interval 'monthly'|'annual'" });
    }

    const cabinet = await findCabinetById(req.auth.cabinetId);
    if (!cabinet) {
      return res.status(404).json({ message: "Cabinet introuvable" });
    }

    const session = await createCheckoutSession(cabinet, {
      plan,
      interval,
      ownerEmail: req.auth.email,
      ownerFullName: req.auth.fullName
    });
    return res.json({ url: session.url });
  } catch (error) {
    console.error("Erreur creation checkout session:", error.message);
    return res.status(500).json({ message: "Impossible de creer la session de paiement" });
  }
});

billingRouter.post("/change-plan", requireAuth, requireOwner, async (req, res) => {
  try {
    const plan = String(req.body?.plan || "");
    const interval = String(req.body?.interval || "");

    if (!VALID_PLANS.has(plan) || !VALID_INTERVALS.has(interval)) {
      return res.status(400).json({ message: "plan doit etre 'connect'|'pro', interval 'monthly'|'annual'" });
    }

    const cabinet = await findCabinetById(req.auth.cabinetId);
    if (!cabinet) {
      return res.status(404).json({ message: "Cabinet introuvable" });
    }

    const updated = await changeSubscriptionPlan(cabinet, { plan, interval });
    if (!updated) {
      return res.status(500).json({ message: "Changement de plan non reflete en base" });
    }

    return res.json({
      plan: updated.subscription_plan,
      status: updated.subscription_status
    });
  } catch (error) {
    console.error("Erreur changement de plan:", error.message);
    return res.status(500).json({ message: error.message || "Impossible de changer de plan" });
  }
});

billingRouter.post("/portal", requireAuth, requireOwner, async (req, res) => {
  try {
    const cabinet = await findCabinetById(req.auth.cabinetId);
    if (!cabinet) {
      return res.status(404).json({ message: "Cabinet introuvable" });
    }

    const session = await createPortalSession(cabinet, {
      ownerEmail: req.auth.email,
      ownerFullName: req.auth.fullName
    });
    return res.json({ url: session.url });
  } catch (error) {
    console.error("Erreur creation portal session:", error.message);
    return res.status(500).json({ message: "Impossible d'ouvrir le portail de facturation" });
  }
});

export { billingRouter };
