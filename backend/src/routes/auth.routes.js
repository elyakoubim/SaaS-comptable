import { randomBytes, createHash } from "node:crypto";
import { Router } from "express";
import { authConfig } from "../config/auth.config.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter
} from "../middleware/rateLimit.middleware.js";
import {
  createAccountant,
  findAccountantByEmail,
  findAccountantById,
  updateAccountantPassword
} from "../repositories/accountant.repository.js";
import {
  createCabinet,
  findInvitationByToken,
  markInvitationAccepted
} from "../repositories/cabinet.repository.js";
import {
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  invalidatePendingTokens
} from "../repositories/passwordReset.repository.js";
import { sendPasswordResetEmail, NotificationUnavailableError } from "../services/notification.service.js";
import { hashPassword, signSessionToken, verifyPassword } from "../utils/authCrypto.js";

const authRouter = Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function hashResetToken(rawToken) {
  return createHash("sha256").update(String(rawToken || "")).digest("hex");
}

function toAuthErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").trim();
  const code = String(error?.code || "").toUpperCase();

  if (code === "ECONNREFUSED" || message.toLowerCase().includes("econnrefused")) {
    return "Database unavailable";
  }

  if (message) {
    return message;
  }

  return fallbackMessage;
}

authRouter.post("/register", registerRateLimiter, async (req, res) => {
  try {
    const { email, password, fullName, inviteToken } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({ message: "email, password and fullName are required" });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await findAccountantByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: "An account already exists for this email" });
    }

    // Deux chemins : rejoindre un cabinet existant via une invitation, ou en
    // creer un nouveau (comportement historique d'une inscription "solo").
    let cabinetId;
    let role = "owner";
    let invitation = null;

    if (inviteToken) {
      invitation = await findInvitationByToken(String(inviteToken));
      if (!invitation || invitation.accepted_at) {
        return res.status(400).json({ message: "Invitation invalide ou deja utilisee" });
      }
      cabinetId = invitation.cabinet_id;
      role = "member";
    } else {
      const cabinet = await createCabinet({ name: String(fullName) });
      cabinetId = cabinet.id;
      role = "owner";
    }

    const passwordHash = await hashPassword(String(password), authConfig.bcryptRounds);
    const created = await createAccountant({
      email: normalizedEmail,
      passwordHash,
      fullName: String(fullName),
      cabinetId,
      role
    });

    if (invitation) {
      await markInvitationAccepted(invitation.id);
    }

    const token = signSessionToken({
      accountantId: created.id,
      email: created.email,
      fullName: created.full_name,
      secret: authConfig.jwtSecret,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      issuer: authConfig.tokenIssuer
    });

    return res.status(201).json({
      token,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      user: {
        id: created.id,
        email: created.email,
        fullName: created.full_name,
        role: created.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: toAuthErrorMessage(error, "Registration failed") });
  }
});

authRouter.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const accountant = await findAccountantByEmail(String(email).toLowerCase());
    const isValidPassword = accountant ? await verifyPassword(String(password), accountant.password_hash) : false;
    if (!accountant || !isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = signSessionToken({
      accountantId: accountant.id,
      email: accountant.email,
      fullName: accountant.full_name,
      secret: authConfig.jwtSecret,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      issuer: authConfig.tokenIssuer
    });

    return res.json({
      token,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      user: {
        id: accountant.id,
        email: accountant.email,
        fullName: accountant.full_name,
        role: accountant.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: toAuthErrorMessage(error, "Login failed") });
  }
});

// Reponse volontairement identique que le compte existe ou non, pour ne pas
// laisser deviner quels emails sont enregistres (enumeration d'utilisateurs).
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "Si un compte existe pour cette adresse, un email de reinitialisation vient d'etre envoye.";

authRouter.post("/forgot-password", forgotPasswordRateLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    const accountant = await findAccountantByEmail(String(email).toLowerCase());

    if (accountant) {
      await invalidatePendingTokens(accountant.id);

      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = hashResetToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await createPasswordResetToken({ accountantId: accountant.id, tokenHash, expiresAt });

      const frontendUrl = (process.env.FRONTEND_URL || "https://app.vatu.be").replace(/\/$/, "");
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      try {
        await sendPasswordResetEmail({ to: accountant.email, resetUrl });
      } catch (sendError) {
        if (!(sendError instanceof NotificationUnavailableError)) {
          throw sendError;
        }
        // RESEND_API_KEY absent (environnement local/test) : on ne fait pas
        // echouer la requete pour autant, le comportement reste silencieux
        // cote client comme en production.
      }
    }

    return res.json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  } catch (error) {
    return res.status(500).json({ message: toAuthErrorMessage(error, "Password reset request failed") });
  }
});

authRouter.post("/reset-password", resetPasswordRateLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ message: "token and password are required" });
    }

    const tokenHash = hashResetToken(String(token));
    const resetToken = await findValidPasswordResetToken(tokenHash);
    if (!resetToken) {
      return res.status(400).json({ message: "Lien de reinitialisation invalide ou expire" });
    }

    const accountant = await findAccountantById(resetToken.accountant_id);
    if (!accountant) {
      return res.status(400).json({ message: "Lien de reinitialisation invalide ou expire" });
    }

    const passwordHash = await hashPassword(String(password), authConfig.bcryptRounds);
    await updateAccountantPassword(accountant.id, passwordHash);
    await markPasswordResetTokenUsed(resetToken.id);

    const sessionToken = signSessionToken({
      accountantId: accountant.id,
      email: accountant.email,
      fullName: accountant.full_name,
      secret: authConfig.jwtSecret,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      issuer: authConfig.tokenIssuer
    });

    return res.json({
      token: sessionToken,
      expiresInSeconds: authConfig.tokenTtlSeconds,
      user: {
        id: accountant.id,
        email: accountant.email,
        fullName: accountant.full_name,
        role: accountant.role
      }
    });
  } catch (error) {
    return res.status(500).json({ message: toAuthErrorMessage(error, "Password reset failed") });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth });
});

authRouter.post("/logout", (_req, res) => {
  return res.status(204).send();
});

export { authRouter };
