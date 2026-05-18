import { Router } from "express";
import { authConfig } from "../config/auth.config.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { loginRateLimiter, registerRateLimiter } from "../middleware/rateLimit.middleware.js";
import { createAccountant, findAccountantByEmail } from "../repositories/accountant.repository.js";
import { hashPassword, signSessionToken, verifyPassword } from "../utils/authCrypto.js";

const authRouter = Router();

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
    const { email, password, fullName } = req.body || {};

    if (!email || !password || !fullName) {
      return res.status(400).json({ message: "email, password and fullName are required" });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await findAccountantByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: "An account already exists for this email" });
    }

    const passwordHash = await hashPassword(String(password), authConfig.bcryptRounds);
    const created = await createAccountant({
      email: normalizedEmail,
      passwordHash,
      fullName: String(fullName)
    });

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
        fullName: created.full_name
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
        fullName: accountant.full_name
      }
    });
  } catch (error) {
    return res.status(500).json({ message: toAuthErrorMessage(error, "Login failed") });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.auth });
});

authRouter.post("/logout", (_req, res) => {
  return res.status(204).send();
});

export { authRouter };
