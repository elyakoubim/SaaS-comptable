import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisConnection } from "../config/redis.js";

const sendCommand = (...args) => redisConnection.call(...args);

function buildAuthRateLimiter({ prefix, windowMs, limit, messages }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    store: new RedisStore({ sendCommand, prefix }),
    handler: (_req, res, _next, options) => {
      const retryAfterSeconds = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(options.statusCode).json({
        message: messages.en,
        messages,
        retryAfterSeconds
      });
    }
  });
}

const loginRateLimiter = buildAuthRateLimiter({
  prefix: "auth_rl_login:",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  messages: {
    fr: "Trop de tentatives de connexion. Reessayez dans 15 minutes.",
    nl: "Te veel inlogpogingen. Probeer het over 15 minuten opnieuw.",
    de: "Zu viele Anmeldeversuche. Bitte versuchen Sie es in 15 Minuten erneut.",
    en: "Too many login attempts. Try again in 15 minutes."
  }
});

const registerRateLimiter = buildAuthRateLimiter({
  prefix: "auth_rl_register:",
  windowMs: 60 * 60 * 1000,
  limit: 3,
  messages: {
    fr: "Trop de tentatives d'inscription. Reessayez dans une heure.",
    nl: "Te veel registratiepogingen. Probeer het over een uur opnieuw.",
    de: "Zu viele Registrierungsversuche. Bitte versuchen Sie es in einer Stunde erneut.",
    en: "Too many registration attempts. Try again in one hour."
  }
});

export { loginRateLimiter, registerRateLimiter };
