import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY || "";
// Doit venir d'un domaine verifie sur Resend (vatu.be) - sinon Resend refuse
// l'envoi ou le classe en spam. Voir vatu/decisions.md pour la procedure.
const fromAddress = process.env.DIGEST_FROM_EMAIL || "Vatu <alertes@vatu.be>";

const resendClient = apiKey ? new Resend(apiKey) : null;

export { resendClient, fromAddress };
