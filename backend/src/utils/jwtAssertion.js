import crypto from "crypto";

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function signRs256(data, privateKeyPem) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  signer.end();
  return signer.sign(privateKeyPem, "base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function assertRealPrivateKeyPem(privateKeyPem) {
  const normalized = String(privateKeyPem || "").trim();

  if (!normalized) {
    throw new Error("FPS_PRIVATE_KEY_PEM is required to generate a real JWT client assertion");
  }

  if (!normalized.includes("BEGIN PRIVATE KEY") || !normalized.includes("END PRIVATE KEY")) {
    throw new Error("FPS_PRIVATE_KEY_PEM must be a valid PEM private key");
  }

  const lower = normalized.toLowerCase();
  if (
    lower.includes("replace_with") ||
    lower.includes("your-") ||
    lower.includes("changeme") ||
    lower.includes("example") ||
    lower.includes("...\n")
  ) {
    throw new Error("FPS_PRIVATE_KEY_PEM appears to be a placeholder; provide your real private key");
  }

  try {
    crypto.createPrivateKey({ key: normalized, format: "pem" });
  } catch {
    throw new Error("FPS_PRIVATE_KEY_PEM could not be parsed as a PEM private key");
  }
}

function buildClientAssertion({ clientId, audience, keyId, privateKeyPem }) {
  if (!clientId || !audience || !keyId) {
    throw new Error("clientId, audience and keyId are required to generate JWT client assertion");
  }

  assertRealPrivateKeyPem(privateKeyPem);

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: keyId
  };

  const payload = {
    iss: clientId,
    sub: clientId,
    aud: audience,
    exp: now + 300,
    iat: now,
    jti: crypto.randomUUID()
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signRs256(unsignedToken, privateKeyPem);

  return `${unsignedToken}.${signature}`;
}

export { buildClientAssertion };
