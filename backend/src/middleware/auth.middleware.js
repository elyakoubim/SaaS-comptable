import { authConfig } from "../config/auth.config.js";
import { findAccountantById } from "../repositories/accountant.repository.js";
import { findCabinetById } from "../repositories/cabinet.repository.js";
import { verifySessionToken } from "../utils/authCrypto.js";

async function requireAuth(req, res, next) {
  try {
    const rawHeader = req.headers.authorization || "";
    const [scheme, token] = rawHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }

    const payload = verifySessionToken(token, authConfig.jwtSecret, authConfig.tokenIssuer);
    const accountant = await findAccountantById(payload.sub);

    if (!accountant) {
      return res.status(401).json({ message: "Session user not found" });
    }

    // L'abonnement (plan/statut) vit desormais sur le cabinet, pas sur le
    // comptable individuel : tous les membres d'un cabinet partagent le meme
    // acces (cf. decision multi-utilisateurs du 24/09/2026).
    const cabinet = await findCabinetById(accountant.cabinet_id);
    if (!cabinet) {
      return res.status(401).json({ message: "Cabinet introuvable pour ce compte" });
    }

    req.auth = {
      accountantId: accountant.id,
      cabinetId: cabinet.id,
      role: accountant.role,
      email: accountant.email,
      fullName: accountant.full_name,
      subscriptionPlan: cabinet.subscription_plan,
      subscriptionStatus: cabinet.subscription_status,
      trialEnd: cabinet.trial_end
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: error.message || "Unauthorized" });
  }
}

export { requireAuth };
