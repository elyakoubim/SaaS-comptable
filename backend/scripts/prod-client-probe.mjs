/**
 * Sonde le client OIDC de PRODUCTION : est-il confidentiel ou public ?
 *
 * Le SPF a créé le client de production avec `"Type": "Public"`, alors que
 * notre intégration s'authentifie en `private_key_jwt` (RFC 7523) et qu'ils ont
 * pourtant enregistré un JWKUri — qui n'a de sens que pour un client
 * confidentiel. Plutôt que de leur poser la question à l'aveugle, on mesure.
 *
 * MÉTHODE — deux appels au token endpoint de production avec un code
 * d'autorisation volontairement invalide. C'est la nature de l'erreur qui
 * répond, car ForgeRock authentifie le client AVANT de valider le code :
 *
 *   A. avec client_assertion   B. sans client_assertion   → conclusion
 *   ────────────────────────────────────────────────────────────────────────
 *   invalid_grant              invalid_client             confidentiel, assertion exigée ✅
 *   invalid_grant              invalid_grant              public, aucune authentification ⚠️
 *   invalid_client             invalid_grant              public, et l'assertion est rejetée ⚠️
 *   invalid_client             invalid_client             autre problème (JWKS, kid, aud…)
 *
 * INNOCUITÉ — le code d'autorisation est bidon, donc aucun token ne peut être
 * émis. Rien n'est créé, modifié ni consommé côté SPF : ni quota de l'API
 * MyMinfin, ni consentement, ni session utilisateur. Aucune donnée client n'est
 * touchée. Le script ne bascule PAS FPS_ENV : il vise l'URL de production en
 * dur, la configuration du service reste sur l'acceptation.
 *
 * Usage (Render Web Shell, depuis backend/) :
 *   npm run fps:probe-prod
 */

import "../src/config/env.js";
import { fpsConfig } from "../src/config/fps.config.js";
import { buildClientAssertion } from "../src/utils/jwtAssertion.js";

const PROD_TOKEN_URL = "https://fediamapi.minfin.fgov.be/sso/oauth2/access_token";
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

// Code d'autorisation manifestement invalide : aucun token ne peut en sortir.
const BOGUS_CODE = "vatu-probe-invalid-code-0000000000";
const BOGUS_VERIFIER = "vatu-probe-verifier-that-is-long-enough-to-be-accepted-43";

async function post(label, params) {
  const body = new URLSearchParams(params);
  const response = await fetch(PROD_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* certaines erreurs reviennent en HTML */
  }

  const error = json?.error ?? "(pas de champ error)";
  const description = json?.error_description ?? json?.message ?? raw.slice(0, 300);

  console.log(`\n── ${label}`);
  console.log(`   HTTP ${response.status}`);
  console.log(`   error             : ${error}`);
  console.log(`   error_description : ${description}`);

  return error;
}

async function main() {
  console.log("\n═══ Sonde du client OIDC de production ═══");
  console.log(`client_id : ${fpsConfig.clientId}`);
  console.log(`kid       : ${fpsConfig.keyId}`);
  console.log(`endpoint  : ${PROD_TOKEN_URL}`);
  console.log(`realm     : ${fpsConfig.realm}`);
  console.log(`\n(le service reste configuré sur ${fpsConfig.env} — rien n'est basculé)`);

  const common = {
    grant_type: "authorization_code",
    code: BOGUS_CODE,
    redirect_uri: fpsConfig.redirectUri,
    code_verifier: BOGUS_VERIFIER,
    realm: fpsConfig.realm
  };

  // A — comme aujourd'hui en acceptation : authentification par assertion signée.
  const assertion = buildClientAssertion({
    clientId: fpsConfig.clientId,
    audience: PROD_TOKEN_URL, // aud = URL NUE du token endpoint
    keyId: fpsConfig.keyId,
    privateKeyPem: fpsConfig.privateKeyPem
  });

  const a = await post("A · avec client_assertion (private_key_jwt)", {
    ...common,
    client_id: fpsConfig.clientId,
    client_assertion_type: ASSERTION_TYPE,
    client_assertion: assertion
  });

  // B — comme le ferait un client public : client_id seul, aucune authentification.
  const b = await post("B · sans client_assertion (client public)", {
    ...common,
    client_id: fpsConfig.clientId
  });

  console.log("\n" + "═".repeat(72));
  console.log("VERDICT");

  if (a === "invalid_grant" && b === "invalid_client") {
    console.log("✅ Client CONFIDENTIEL : l'assertion est acceptée et exigée.");
    console.log("   Le \"Type: Public\" du message du SPF ne reflète pas la configuration réelle.");
    console.log("   → On peut basculer FPS_ENV=prod sans rien changer au code.");
  } else if (a === "invalid_grant" && b === "invalid_grant") {
    console.log("⚠️  Client PUBLIC : aucune authentification n'est exigée.");
    console.log("   L'assertion est ignorée, et le JWKUri enregistré ne sert à rien.");
    console.log("   → À faire corriger : une application serveur qui détient des refresh tokens");
    console.log("     doit être un client confidentiel.");
  } else if (a === "invalid_client" && b === "invalid_grant") {
    console.log("⚠️  Client PUBLIC, et l'assertion est explicitement REJETÉE.");
    console.log("   → Basculer en l'état casserait l'échange de code. À faire corriger.");
  } else {
    console.log(`❓ Combinaison inattendue (A=${a}, B=${b}).`);
    console.log("   Peut venir d'autre chose : JWKS pas encore lu par ForgeRock, kid inconnu,");
    console.log("   aud incorrect, realm différent en production. Relire les descriptions ci-dessus.");
  }
  console.log("═".repeat(72) + "\n");
}

main().catch((error) => {
  console.error("Échec de la sonde :", error);
  process.exit(1);
});
