import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findAccountantById } from "../repositories/accountant.repository.js";
import { createCheckoutSession, createPortalSession } from "../services/billing.service.js";

const billingRouter = Router();
const VALID_PLANS = new Set(["connect", "pro"]);
const VALID_INTERVALS = new Set(["monthly", "annual"]);

billingRouter.post("/checkout", requireAuth, async (req, res) => {
  try {
    const plan = String(req.body?.plan || "");
    const interval = String(req.body?.interval || "");

    if (!VALID_PLANS.has(plan) || !VALID_INTERVALS.has(interval)) {
      return res.status(400).json({ message: "plan doit etre 'connect'|'pro', interval 'monthly'|'annual'" });
    }

    const accountant = await findAccountantById(req.auth.accountantId);
    if (!accountant) {
      return res.status(404).json({ message: "Comptable introuvable" });
    }

    const session = await createCheckoutSession(accountant, { plan, interval });
    return res.json({ url: session.url });
  } catch (error) {
    console.error("Erreur creation checkout session:", error.message);
    return res.status(500).json({ message: "Impossible de creer la session de paiement" });
  }
});

billingRouter.post("/portal", requireAuth, async (req, res) => {
  try {
    const accountant = await findAccountantById(req.auth.accountantId);
    if (!accountant) {
      return res.status(404).json({ message: "Comptable introuvable" });
    }

    const session = await createPortalSession(accountant);
    return res.json({ url: session.url });
  } catch (error) {
    console.error("Erreur creation portal session:", error.message);
    return res.status(500).json({ message: "Impossible d'ouvrir le portail de facturation" });
  }
});

export { billingRouter };
