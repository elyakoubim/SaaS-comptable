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
    // Chemin AVEC le realm, tel que l'annonce le document de decouverte du SPF.
    // Le chemin court /sso/oauth2/connect/jwk_uri sert les cles du realm racine,
    // qui ne recouvrent que partiellement celles de /externalapi : l'id_token peut
    // etre signe par une cle absente de cette liste, et la verification echouerait.
    jwks: process.env.FPS_JWKS_TEST_URL || "https://fediamapi-a.minfin.be/sso/oauth2/realms/root/realms/externalapi/connect/jwk_uri",
    mmf: process.env.FPS_MMF_BASE_URL_TEST || "https://wsapi-a.minfin.be",
    // `iss` du id_token, relevé sur le document de découverte OIDC du SPF.
    issuer: process.env.FPS_ISSUER_TEST_URL || "https://fediamapi-a.minfin.be/sso/oauth2"
  },
  prod: {
    authorization: process.env.FPS_AUTH_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/authorize",
    token: process.env.FPS_TOKEN_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/access_token",
    jwks: process.env.FPS_JWKS_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2/realms/root/realms/externalapi/connect/jwk_uri",
    mmf: process.env.FPS_MMF_BASE_URL_PROD || "https://wsapi.minfin.fgov.be",
    issuer: process.env.FPS_ISSUER_PROD_URL || "https://fediamapi.minfin.fgov.be/sso/oauth2"
  }
};

const fpsConfig = {
  env: fpsEnv,
  clientId: process.env.FPS_CLIENT_ID || "",
  redirectUri: process.env.FPS_REDIRECT_URI || "",
  scope: process.env.FPS_SCOPE || "openid profile",
  realm: process.env.FPS_REALM || "/externalapi",
  // "private_key_jwt" (confidential client) or "none" (public client + PKCE only)
  clientAuthMethod: process.env.FPS_CLIENT_AUTH_METHOD || "private_key_jwt",
  keyId: process.env.FPS_KEY_ID || "",
  privateKeyPem: normalizePrivateKeyPem(process.env.FPS_PRIVATE_KEY_PEM),
  claimsEcbField: process.env.FPS_CLAIMS_ECB_FIELD || "ecb",
  // Derive de FPS_ENV comme les autres endpoints : le basculement acceptation ->
  // production ne doit rester qu'un seul interrupteur. FPS_EXPECTED_ISSUER reste
  // accepte comme surcharge d'urgence, mais ne doit pas etre defini en temps normal.
  expectedIssuer: process.env.FPS_EXPECTED_ISSUER || endpoints[fpsEnv].issuer,
  authUrl: endpoints[fpsEnv].authorization,
  tokenUrl: endpoints[fpsEnv].token,
  jwksUrl: endpoints[fpsEnv].jwks,
  mmfBaseUrl: endpoints[fpsEnv].mmf
};

export { fpsConfig };
