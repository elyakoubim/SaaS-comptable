import { findAccountantById } from "../repositories/accountant.repository.js";
import { hasProAccess } from "../services/billing.service.js";

// A utiliser derriere requireAuth sur les routes reservees a Vatu Pro
// (ex: extraction/lecture de document par IA - phase 3).
async function requireProPlan(req, res, next) {
  try {
    const accountant = await findAccountantById(req.auth.accountantId);
    if (!accountant) {
      return res.status(404).json({ message: "Comptable introuvable" });
    }

    if (!hasProAccess(accountant)) {
      return res.status(402).json({
        message: "Cette fonctionnalite necessite l'offre Vatu Pro",
        code: "UPGRADE_REQUIRED"
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({ message: error.message || "Erreur de verification d'abonnement" });
  }
}

export { requireProPlan };
