import { findCabinetById } from "../repositories/cabinet.repository.js";
import { hasProAccess } from "../services/billing.service.js";

// A utiliser derriere requireAuth sur les routes reservees a Vatu Pro
// (ex: extraction/lecture de document par IA - phase 3). L'acces depend de
// l'abonnement du cabinet, pas du comptable individuel : tous les membres
// d'un cabinet Pro y ont droit (cf. decision multi-utilisateurs du 24/09/2026).
async function requireProPlan(req, res, next) {
  try {
    const cabinet = await findCabinetById(req.auth.cabinetId);
    if (!cabinet) {
      return res.status(404).json({ message: "Cabinet introuvable" });
    }

    if (!hasProAccess(cabinet)) {
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
