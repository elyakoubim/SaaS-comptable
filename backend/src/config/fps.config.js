const fpsEnv = process.env.FPS_ENV === "prod" ? "prod" : "test";

function normalizePrivateKeyPem(rawValue) {
  let value = String(rawValue || "").trim();

  if (!value) {
    return "";
  }

  // .env values are sometimes wrapped in quotes; strip only matching wrappers.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.replace(/\\n/g, "\n").trim();
}

const endpoints = {
  test: {
    authorization: process.env.FPS_AUTH_TEST_URL || "https://fediamapi-a.minfin.be/sso/oauth2/authorize",
    token: process.env.FPS_TOKEN_TEST_URL || "https://fediamapi-a.minfin.be/sso/oauth2/access_token",
    jwks: process.env.FPS_JWKS_TEST_URL || "https://fediamapi-a.minfin.be/sso/oauth2/connect/jwk_uri",
    mmf: process.env.FPS_MMF_BASE_URL_TEST || "https://wsapi-a.minfin.be"
  },
  prod: {
    authorization: process.env.FPS_AUTH_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/authorize",
    token: process.env.FPS_TOKEN_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/access_token",
    jwks: process.env.FPS_JWKS_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/connect/jwk_uri",
    mmf: process.env.FPS_MMF_BASE_URL_PROD || "https://wsapi.minfin.fgov.be"
  }
};

const fpsConfig = {
  env: fpsEnv,
  clientId: process.env.FPS_CLIENT_ID || "",
  redirectUri: process.env.FPS_REDIRECT_URI || "",
  scope: process.env.FPS_SCOPE || "openid profile",
  realm: process.env.FPS_REALM || "/externalapi",
  keyId: process.env.FPS_KEY_ID || "",
  privateKeyPem: normalizePrivateKeyPem(process.env.FPS_PRIVATE_KEY_PEM),
  claimsEcbField: process.env.FPS_CLAIMS_ECB_FIELD || "ecb",
  expectedIssuer: process.env.FPS_EXPECTED_ISSUER || "",
  authUrl: endpoints[fpsEnv].authorization,
  tokenUrl: endpoints[fpsEnv].token,
  jwksUrl: endpoints[fpsEnv].jwks,
  mmfBaseUrl: endpoints[fpsEnv].mmf
};

export { fpsConfig };
