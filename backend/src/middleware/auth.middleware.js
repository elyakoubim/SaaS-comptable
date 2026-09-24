import { authConfig } from "../config/auth.config.js";
import { findAccountantById } from "../repositories/accountant.repository.js";
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

    req.auth = {
      accountantId: accountant.id,
      email: accountant.email,
      fullName: accountant.full_name,
      subscriptionPlan: accountant.subscription_plan,
      subscriptionStatus: accountant.subscription_status,
      trialEnd: accountant.trial_end
    };

    return next();
  } catch (error) {
    return res.status(401).json({ message: error.message || "Unauthorized" });
  }
}

export { requireAuth };
