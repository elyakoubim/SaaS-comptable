/**
 * Client minimal pour le webservice BCE Public Search (SOAP), utilisé
 * uniquement pour résoudre le nom d'une entreprise à partir de son numéro
 * BCE. Le SPF ne fournit ce nom nulle part dans l'API MyMinfin ni dans
 * l'id_token OIDC (cf. vatu/decisions.md, 23/09/2026) — c'est la BCE, pas
 * MyMinfin, qui la connaît.
 *
 * Compte partagé avec les autres produits Legakte (KBO_WS_USERNAME /
 * KBO_WS_PASSWORD, Environment Group vatu-shared). Le webservice deviendra
 * gratuit mi-octobre 2026 (confirmé par le SPF, cf. decisions.md) ; en
 * attendant chaque appel consomme un crédit payant partagé — d'où l'appel
 * une seule fois par mandant (à la connexion), jamais à chaque sync.
 *
 * Porté depuis legakte-new/lib/bce.js (compte Legakte, même WS-Security),
 * réduit au strict nécessaire pour Vatu : uniquement la dénomination.
 */
import crypto from "crypto";
import { XMLParser } from "fast-xml-parser";

const WS_URL =
  process.env.KBO_WS_URL ||
  "https://kbopub.economie.fgov.be/kbopubws180000/services/wsKBOPub";

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

function deepFind(o, key) {
  if (o == null || typeof o !== "object") return undefined;
  if (!Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
  for (const k of Object.keys(o)) {
    const r = deepFind(o[k], key);
    if (r !== undefined) return r;
  }
  return undefined;
}

function pickDesc(node, lang) {
  if (!node) return "";
  const ds = arr(node.description);
  const hit = ds.find((d) => String(d?.language || "").toLowerCase() === lang) || ds[0];
  if (hit == null) return "";
  return typeof hit === "object" ? String(hit.value ?? "") : String(hit);
}

function lcKeys(o) {
  if (Array.isArray(o)) return o.map(lcKeys);
  if (o && typeof o === "object") {
    const out = {};
    for (const k of Object.keys(o)) out[k.charAt(0).toLowerCase() + k.slice(1)] = lcKeys(o[k]);
    return out;
  }
  return o;
}

function buildSoap(number, lang) {
  const user = process.env.KBO_WS_USERNAME || "";
  const pass = process.env.KBO_WS_PASSWORD || "";
  const nonceBytes = crypto.randomBytes(16);
  const nonce = nonceBytes.toString("base64");
  const created = new Date().toISOString();
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const digest = crypto
    .createHash("sha1")
    .update(Buffer.concat([nonceBytes, Buffer.from(created, "utf8"), Buffer.from(pass, "utf8")]))
    .digest("base64");
  const utId = "UsernameToken-" + crypto.randomBytes(8).toString("hex").toUpperCase();
  const tsId = "TS-" + crypto.randomBytes(8).toString("hex").toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:dat="http://economie.fgov.be/kbopub/webservices/v1/datamodel" xmlns:mes="http://economie.fgov.be/kbopub/webservices/v1/messages" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Header>
  <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" soapenv:mustUnderstand="1">
   <wsse:UsernameToken wsu:Id="${utId}">
    <wsse:Username>${user}</wsse:Username>
    <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>
    <wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonce}</wsse:Nonce>
    <wsu:Created>${created}</wsu:Created>
   </wsse:UsernameToken>
   <wsu:Timestamp wsu:Id="${tsId}">
    <wsu:Created>${created}</wsu:Created>
    <wsu:Expires>${expires}</wsu:Expires>
   </wsu:Timestamp>
  </wsse:Security>
  <mes:RequestContext><mes:Id>Vatu-1</mes:Id><mes:Language>${lang}</mes:Language></mes:RequestContext>
 </soapenv:Header>
 <soapenv:Body><mes:ReadEnterpriseRequest><dat:EnterpriseNumber>${number}</dat:EnterpriseNumber></mes:ReadEnterpriseRequest></soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Résout le nom (dénomination officielle, code 001) d'une entreprise à
 * partir de son numéro BCE. Retourne null si le webservice ne répond pas
 * ou si les identifiants ne sont pas configurés — ne lève jamais, pour ne
 * jamais faire échouer une connexion/refresh de mandant à cause d'un souci
 * côté BCE.
 */
export async function lookupCompanyNameByEcb(rawNumber, lang = "fr") {
  if (!process.env.KBO_WS_USERNAME || !process.env.KBO_WS_PASSWORD) {
    console.warn("[bce-client] KBO_WS_USERNAME/KBO_WS_PASSWORD non configurés, lookup ignoré");
    return null;
  }
  const number = String(rawNumber || "").replace(/\D/g, "");
  if (number.length < 9) return null;

  try {
    const res = await fetch(WS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        SOAPAction: '"http://fgov.economie.be/kbopub/ReadEnterprise"'
      },
      body: buildSoap(number, lang)
    });
    const text = await res.text();

    const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true });
    const obj = parser.parse(text);
    const enterpriseRaw = deepFind(obj, "Enterprise");
    if (!enterpriseRaw) {
      const fault = deepFind(obj, "faultstring");
      console.warn(`[bce-client] pas de nom pour ${number} : ${fault || "réponse sans Enterprise"}`);
      return null;
    }
    const ent = lcKeys(enterpriseRaw);
    const denoms = arr(ent.denomination);
    const off = denoms.find((d) => String(d.code) === "001") || denoms[0];
    const nom = pickDesc(off, lang);
    return nom || null;
  } catch (error) {
    console.warn(`[bce-client] lookup BCE échoué pour ${number} :`, error.message);
    return null;
  }
}
