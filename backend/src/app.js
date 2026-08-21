import express from "express";
import cors from "cors";
import helmet from "helmet";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { alertRouter } from "./routes/alert.routes.js";
import { authRouter } from "./routes/auth.routes.js";
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
app.use("/api/sync", syncRouter);

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
