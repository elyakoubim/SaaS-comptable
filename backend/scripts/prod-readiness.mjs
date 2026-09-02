/**
 * Contrôle complet de la configuration de PRODUCTION côté SPF, avant bascule.
 *
 * La sonde `fps:probe-prod` n'a testé que le token endpoint. Trois choses
 * restaient non vérifiées : le redirect_uri et les scopes tels qu'enregistrés
 * en production, ce que leur serveur déclare accepter, et si l'API MyMinfin de
 * production répond. Ce script les couvre.
 *
 * INNOCUITÉ — trois lectures, aucune écriture. On ne suit aucune redirection,
 * on n'envoie aucun cookie, aucun utilisateur ne s'authentifie, aucun
 * consentement n'est créé, aucun token n'est émis. `FPS_ENV` n'est pas touché :
 * les URLs de production sont en dur, le service reste sur l'acceptation.
 *
 * Usage (Render Web Shell, depuis backend/) :
 *   npm run fps:check-prod
 */

import "../src/config/env.js";
import { fpsConfig } from "../src/config/fps.config.js";
import { generatePkcePair, randomOpaque } from "../src/utils/pkce.js";
import crypto from "node:crypto";

const PROD = {
  discovery: "https://fediamapi.minfin.fgov.be/sso/oauth2/.well-known/openid-configuration",
  authorize: "https://fediamapi.minfin.fgov.be/sso/oauth2/authorize",
  mmf: "https://wsapi.minfin.fgov.be/FineAPI/Generic/OAU/v2/documents"
};

// Le mandat sur lequel le premier test réel aura lieu : Legakte SRL elle-même.
const LEGAKTE_ECB = "1022158878";

const findings = [];
const ok = (t, d) => { findings.push({ s: "✅", t, d }); console.log(`   ✅ ${t}${d ? ` — ${d}` : ""}`); };
const warn = (t, d) => { findings.push({ s: "⚠️", t, d }); console.log(`   ⚠️  ${t}${d ? ` — ${d}` : ""}`); };
const bad = (t, d) => { findings.push({ s: "❌", t, d }); console.log(`   ❌ ${t}${d ? ` — ${d}` : ""}`); };

async function checkDiscovery() {
  console.log("\n─── 1. Ce que le serveur de production déclare ───");
  const res = await fetch(PROD.discovery, { headers: { Accept: "application/json" } });
  if (res.status !== 200) return bad("Document de découverte", `HTTP ${res.status}`);

  const d = await res.json();
  console.log(`   issuer         : ${d.issuer}`);
  console.log(`   authorize      : ${d.authorization_endpoint}`);
  console.log(`   token          : ${d.token_endpoint}`);
  console.log(`   jwks           : ${d.jwks_uri}`);

  if (d.issuer === "https://fediamapi.minfin.fgov.be/sso/oauth2") {
    ok("issuer conforme à la valeur dérivée dans fps.config.js");
  } else {
    bad("issuer inattendu", `${d.issuer} — la validation de l'id_token échouera`);
  }

  if (d.token_endpoint === "https://fediamapi.minfin.fgov.be/sso/oauth2/access_token") {
    ok("token endpoint conforme (c'est aussi la valeur de `aud` de l'assertion)");
  } else {
    warn("token endpoint différent de celui codé", d.token_endpoint);
  }

  const methods = d.token_endpoint_auth_methods_supported || [];
  if (methods.includes("private_key_jwt")) {
    ok("private_key_jwt supporté", methods.join(", "));
  } else {
    bad("private_key_jwt absent des méthodes annoncées", methods.join(", ") || "(aucune)");
  }

  const challenges = d.code_challenge_methods_supported || [];
  challenges.includes("S256")
    ? ok("PKCE S256 supporté")
    : warn("S256 non annoncé", challenges.join(", ") || "(aucun)");

  const scopes = d.scopes_supported;
  if (Array.isArray(scopes) && scopes.length) {
    const wanted = fpsConfig.scope.split(/\s+/).filter(Boolean);
    const missing = wanted.filter((s) => !scopes.includes(s));
    missing.length
      ? warn("scopes non annoncés par le serveur", missing.join(", ") + " (peut être normal : la liste publique est souvent partielle)")
      : ok("tous nos scopes figurent dans scopes_supported", wanted.join(" "));
  } else {
    console.log("   (scopes_supported non publié — non concluant)");
  }
}

async function checkAuthorize() {
  console.log("\n─── 2. Le redirect_uri et les scopes, tels qu'enregistrés ───");
  const { codeChallenge } = generatePkcePair();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: fpsConfig.clientId,
    scope: fpsConfig.scope,
    redirect_uri: fpsConfig.redirectUri,
    state: randomOpaque(24),
    nonce: randomOpaque(24),
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
    claims: JSON.stringify({ [fpsConfig.claimsEcbField]: LEGAKTE_ECB })
  });

  console.log(`   client_id    : ${fpsConfig.clientId}`);
  console.log(`   redirect_uri : ${fpsConfig.redirectUri}`);
  console.log(`   scope        : ${fpsConfig.scope}`);
  console.log(`   claims       : {"${fpsConfig.claimsEcbField}":"${LEGAKTE_ECB}"}`);

  // redirect: "manual" — on ne suit pas, on ne se connecte pas.
  const res = await fetch(`${PROD.authorize}?${query}`, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "text/html,application/json" }
  });

  const location = res.headers.get("location") || "";
  console.log(`   HTTP ${res.status}`);
  if (location) console.log(`   Location : ${location.slice(0, 220)}`);

  const errorInLocation = /[?#&]error=([^&]+)/.exec(location);
  const body = location ? "" : (await res.text().catch(() => "")).slice(0, 400);

  if (errorInLocation) {
    const code = decodeURIComponent(errorInLocation[1]);
    const desc = /[?#&]error_description=([^&]+)/.exec(location);
    bad(`le serveur refuse la requête : ${code}`, desc ? decodeURIComponent(desc[1]).replace(/\+/g, " ") : "");
    if (code === "invalid_scope") {
      console.log("      → un scope demandé n'est pas attribué au client de production.");
    }
    if (code.includes("redirect")) {
      console.log("      → le redirect_uri enregistré ne correspond pas à celui envoyé.");
    }
  } else if (res.status >= 300 && res.status < 400) {
    ok("requête d'autorisation acceptée", "redirection vers l'authentification, sans erreur");
    console.log("      → client_id, redirect_uri, scopes et PKCE sont validés en production.");
  } else if (res.status === 200) {
    /invalid|error/i.test(body)
      ? warn("réponse 200 contenant « error »", body.replace(/\s+/g, " ").slice(0, 200))
      : ok("page d'authentification servie directement (200)", "pas d'erreur détectée");
  } else {
    warn(`statut inattendu ${res.status}`, body.replace(/\s+/g, " ").slice(0, 200));
  }
}

async function checkMyMinfin() {
  console.log("\n─── 3. L'API MyMinfin de production répond-elle ? ───");
  const url = new URL(PROD.mmf);
  url.searchParams.set("since", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Minfin-Ws-Correlation": crypto.randomUUID(),
      "User-Agent": "Vatu/0.1 (+https://connect.vatu.be)"
      // volontairement sans Authorization : on attend un 401
    }
  });

  const wwwAuth = res.headers.get("www-authenticate") || "(aucun)";
  const bodyText = (await res.text().catch(() => "")).slice(0, 300);
  console.log(`   HTTP ${res.status} · WWW-Authenticate: ${wwwAuth}`);

  if (res.status === 401) {
    ok("l'API de production répond", "401 sans token, c'est le comportement attendu");
    console.log("      → hôte, chemin et TLS corrects. Reste à valider avec un vrai token.");
  } else if (res.status === 404) {
    bad("404 — le chemin de production diffère", PROD.mmf);
  } else {
    warn(`statut ${res.status}`, bodyText.replace(/\s+/g, " "));
  }
}

async function main() {
  console.log("\n═══ Contrôle de la configuration de production ═══");
  console.log(`(le service reste sur ${fpsConfig.env} — aucune bascule, aucune écriture)`);

  for (const [label, fn] of [
    ["découverte", checkDiscovery],
    ["autorisation", checkAuthorize],
    ["MyMinfin", checkMyMinfin]
  ]) {
    try {
      await fn();
    } catch (error) {
      bad(`contrôle « ${label} » impossible`, error.message);
    }
  }

  const nbBad = findings.filter((f) => f.s === "❌").length;
  const nbWarn = findings.filter((f) => f.s === "⚠️").length;

  console.log("\n" + "═".repeat(74));
  if (nbBad === 0 && nbWarn === 0) {
    console.log("✅ RIEN À SIGNALER AU SPF. La configuration de production est cohérente.");
    console.log("   → basculer FPS_ENV=prod (web service ET worker).");
  } else if (nbBad === 0) {
    console.log(`⚠️  ${nbWarn} point(s) d'attention, aucun bloquant.`);
    console.log("   → relire ci-dessus avant de décider d'écrire au SPF.");
  } else {
    console.log(`❌ ${nbBad} point(s) bloquant(s) — il y a matière à leur écrire :`);
    for (const f of findings.filter((x) => x.s === "❌")) {
      console.log(`     • ${f.t}${f.d ? ` — ${f.d}` : ""}`);
    }
  }
  console.log("═".repeat(74) + "\n");
}

main().catch((error) => {
  console.error("Échec du contrôle :", error);
  process.exit(1);
});
