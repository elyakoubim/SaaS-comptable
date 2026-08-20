import { fpsConfig } from "../config/fps.config.js";
import { buildClientAssertion } from "../utils/jwtAssertion.js";
import { generatePkcePair, randomOpaque } from "../utils/pkce.js";
import { decryptText, encryptText } from "../utils/tokenCrypto.js";
import {
  findMandantByEcb,
  listRefreshCandidates,
  updateMandantStatus,
  upsertMandantTokens
} from "../repositories/mandant.repository.js";
import { insertTokenEvent } from "../repositories/tokenEvent.repository.js";
import { verifyIdToken } from "./fpsOidcValidation.service.js";
import { saveLoginFlow, takeLoginFlow } from "./connectFlowStore.service.js";

function makeClientAssertion() {
  return buildClientAssertion({
    clientId: fpsConfig.clientId,
    audience: fpsConfig.tokenUrl,
    keyId: fpsConfig.keyId,
    privateKeyPem: fpsConfig.privateKeyPem
  });
}

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;

  return (
    normalized.includes("your-") ||
    normalized.includes("replace_with") ||
    normalized === "changeme" ||
    normalized.includes("example") ||
    normalized.includes("-----begin private key-----\\n...\\n-----end private key-----")
  );
}

async function callTokenEndpoint(body) {
  const response = await fetch(fpsConfig.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    const bodySnippet = String(text || "").slice(0, 300);
    if (bodySnippet.includes("invalid_grant")) {
      throw new Error(`Token endpoint failed (${response.status}): invalid_grant`);
    }
    if (bodySnippet.includes("invalid_client")) {
      throw new Error(`Token endpoint failed (${response.status}): invalid_client`);
    }
    throw new Error(`Token endpoint failed (${response.status}): ${bodySnippet}`);
  }

  return response.json();
}

async function persistTokenSet({
  ecbNumber,
  accountantId,
  tokenSet,
  fallbackCompanyName,
  consentGivenAt,
  consentGivenBy
}) {
  const now = Date.now();
  const expiresInMs = Number(tokenSet.expires_in || 300) * 1000;

  if (!tokenSet.access_token || !tokenSet.refresh_token) {
    throw new Error("Token response missing access_token or refresh_token");
  }

  if (!accountantId) {
    throw new Error("accountantId is required to persist FPS tokens");
  }

  await upsertMandantTokens({
    ecbNumber,
    companyName: tokenSet.customerName || fallbackCompanyName || null,
    accountantId,
    accessTokenEncrypted: encryptText(tokenSet.access_token),
    refreshTokenEncrypted: encryptText(tokenSet.refresh_token),
    tokenExpiry: new Date(now + expiresInMs).toISOString(),
    consentGivenAt: consentGivenAt || new Date().toISOString(),
    consentGivenBy: consentGivenBy || null,
    status: "ok"
  });
}

function buildAuthorizationUrl(ecbNumber, accountantId) {
  if (!accountantId) {
    throw new Error("Authenticated accountant is required");
  }

  const missing = [
    !fpsConfig.clientId || isPlaceholder(fpsConfig.clientId) ? "FPS_CLIENT_ID" : null,
    !fpsConfig.redirectUri || isPlaceholder(fpsConfig.redirectUri) ? "FPS_REDIRECT_URI" : null,
    !fpsConfig.keyId || isPlaceholder(fpsConfig.keyId) ? "FPS_KEY_ID" : null,
    !fpsConfig.privateKeyPem || isPlaceholder(fpsConfig.privateKeyPem) ? "FPS_PRIVATE_KEY_PEM" : null
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`FPS client configuration is missing: ${missing.join(", ")}`);
  }

  const usingSharedTestClient = String(fpsConfig.clientId).toLowerCase() === "testfineapi";
  if (usingSharedTestClient && !fpsConfig.redirectUri.includes("/TestFineapi/cbfineapi.html")) {
    throw new Error(
      "TestFineapi is a shared FPS demo client with fixed redirect URI and JWKS. " +
        "Use your own registered client for localhost callbacks or switch FPS_REDIRECT_URI to the official TestFineapi callback."
    );
  }

  const state = randomOpaque(24);
  const nonce = randomOpaque(24);
  const { codeVerifier, codeChallenge } = generatePkcePair();

  const claimsPayload = {
    [fpsConfig.claimsEcbField]: ecbNumber
  };

  saveLoginFlow(state, {
    accountantId,
    ecbNumber,
    nonce,
    codeVerifier
  });

  const query = new URLSearchParams({
    response_type: "code",
    client_id: fpsConfig.clientId,
    scope: fpsConfig.scope,
    redirect_uri: fpsConfig.redirectUri,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    claims: JSON.stringify(claimsPayload)
  });

  return `${fpsConfig.authUrl}?${query.toString()}`;
}

async function exchangeAuthorizationCode({ code, state }) {
  const flow = takeLoginFlow(state);
  if (!flow) {
    throw new Error("Invalid or expired state");
  }
  if (!flow.accountantId) {
    throw new Error("Missing authenticated accountant context for this state");
  }

  const clientAssertion = makeClientAssertion();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: fpsConfig.redirectUri,
    code,
    code_verifier: flow.codeVerifier,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    client_id: fpsConfig.clientId
  });

  try {
    const tokenSet = await callTokenEndpoint(body);
    const idTokenPayload = await verifyIdToken(tokenSet.id_token, flow.nonce);

    await persistTokenSet({
      ecbNumber: flow.ecbNumber,
      accountantId: flow.accountantId,
      tokenSet,
      fallbackCompanyName: tokenSet.customerName || null,
      consentGivenAt: new Date().toISOString(),
      consentGivenBy: idTokenPayload.sub || null
    });

    await insertTokenEvent({
      mandantEcb: flow.ecbNumber,
      eventType: "token_exchange",
      eventStatus: "success"
    });
  } catch (error) {
    console.error("FPS token exchange failed:", error.message);

    // Best-effort audit log. A failed exchange often means no mandant row was
    // persisted yet, so this INSERT can violate the token_events FK. Never let
    // that secondary failure mask the real error below.
    try {
      await insertTokenEvent({
        mandantEcb: flow.ecbNumber,
        eventType: "token_exchange",
        eventStatus: "failed",
        errorCode: "exchange_failed",
        errorDetail: error.message
      });
    } catch (logError) {
      console.error("Could not record token_exchange failure event:", logError.message);
    }

    throw error;
  }

  return {
    ecbNumber: flow.ecbNumber,
    expiresIn: tokenSet.expires_in,
    scope: tokenSet.scope
  };
}

async function refreshMandantByEcb(ecbNumber) {
  const mandant = await findMandantByEcb(ecbNumber);
  if (!mandant) {
    throw new Error(`Mandant not found for ECB ${ecbNumber}`);
  }

  const refreshToken = decryptText(mandant.refresh_token_encrypted);
  const clientAssertion = makeClientAssertion();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    client_id: fpsConfig.clientId
  });

  try {
    const tokenSet = await callTokenEndpoint(body);
    await persistTokenSet({
      ecbNumber,
      accountantId: mandant.accountant_id,
      tokenSet,
      fallbackCompanyName: mandant.company_name,
      consentGivenAt: mandant.consent_given_at,
      consentGivenBy: mandant.consent_given_by
    });

    await insertTokenEvent({
      mandantEcb: ecbNumber,
      eventType: "token_refresh",
      eventStatus: "success"
    });
  } catch (error) {
    await updateMandantStatus(ecbNumber, "warning");

    await insertTokenEvent({
      mandantEcb: ecbNumber,
      eventType: "refresh_failed",
      eventStatus: "failed",
      errorCode: error.message.includes("invalid_grant") ? "invalid_grant" : "refresh_failed",
      errorDetail: error.message
    });

    throw error;
  }
}

async function refreshExpiredMandants() {
  const cutoff = new Date(Date.now() + 60 * 1000).toISOString();
  const candidates = await listRefreshCandidates(cutoff);

  for (const item of candidates) {
    try {
      await refreshMandantByEcb(item.ecb_number);
    } catch (error) {
      console.error(`Refresh failed for ${item.ecb_number}:`, error.message);
    }
  }
}

export { buildAuthorizationUrl, exchangeAuthorizationCode, refreshMandantByEcb, refreshExpiredMandants };
