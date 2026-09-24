import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alertRouter } from "./routes/alert.routes.js";
import { analysisRouter } from "./routes/analysis.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { cabinetRouter } from "./routes/cabinet.routes.js";
import { stripe, webhookSecret } from "./config/stripe.config.js";
import { processWebhookEvent } from "./services/billing.service.js";
import { documentRouter } from "./routes/document.routes.js";
import { fpsRouter } from "./routes/fps.routes.js";
import { syncRouter } from "./routes/sync.routes.js";
import { fpsConfig } from "./config/fps.config.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = resolve(__dirname, "..", "..", "frontend", "dist");
const hasFrontendBuild = existsSync(frontendDistPath);
const jwksPath = resolve(__dirname, "..", "keys", "jwks.json");

app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 0));

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));

// Montee AVANT express.json(): Stripe signe le corps brut de la requete, un
// corps deja parse en JSON invaliderait la verification de signature.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET non configure - webhook rejete");
      return res.status(500).send("Webhook non configure");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error) {
      console.error("Signature webhook Stripe invalide:", error.message);
      return res.status(400).send("Webhook signature verification failed");
    }

    try {
      await processWebhookEvent(event);
      return res.json({ received: true });
    } catch (error) {
      console.error(`Erreur traitement webhook Stripe (${event.type}):`, error.message);
      // 500 pour que Stripe reessaie automatiquement cet evenement plus tard.
      return res.status(500).json({ message: "Erreur interne" });
    }
  }
);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Derive the public JWKS directly from the signing private key so the published
// key can never drift from the key actually used to sign client assertions.
// Falls back to the static keys/jwks.json only if no private key is configured.
function deriveJwksFromPrivateKey() {
  const pem = fpsConfig.privateKeyPem;
  if (!pem) {
    return null;
  }

  try {
    const publicKey = crypto.createPublicKey({ key: pem, format: "pem" });
    const jwk = publicKey.export({ format: "jwk" });
    return {
      keys: [
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          kid: fpsConfig.keyId || "fps-key",
          use: "sig",
          alg: "RS256"
        }
      ]
    };
  } catch (error) {
    console.error("Could not derive JWKS from FPS_PRIVATE_KEY_PEM:", error.message);
    return null;
  }
}

app.get("/.well-known/jwks.json", (_req, res) => {
  const derived = deriveJwksFromPrivateKey();
  if (derived) {
    res.type("application/jwk-set+json");
    return res.json(derived);
  }

  if (!existsSync(jwksPath)) {
    return res.status(500).json({ message: "JWKS file not found on server" });
  }

  res.type("application/jwk-set+json");
  return res.sendFile(jwksPath);
});

app.use("/api/auth", authRouter);
app.use("/api/fps", fpsRouter);
app.use("/api/alerts", alertRouter);
app.use("/api/analysis", analysisRouter);
app.use("/api/documents", documentRouter);
app.use("/api/sync", syncRouter);
app.use("/api/billing", billingRouter);
app.use("/api/cabinet", cabinetRouter);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }
    return res.sendFile(resolve(frontendDistPath, "index.html"));
  });
}

export { app };
