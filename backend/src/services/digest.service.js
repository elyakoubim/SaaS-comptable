import { listCabinetsForDigest, markDigestSent } from "../repositories/cabinet.repository.js";
import { listAlertsSince } from "../repositories/alert.repository.js";
import { sendDigestEmail, NotificationUnavailableError } from "./notification.service.js";

// Fenetre de repli pour un cabinet dont last_digest_sent_at serait NULL
// (ne devrait plus arriver depuis que la colonne a un DEFAULT NOW(), gardee
// par prudence si un cabinet est cree autrement qu'via createCabinet()).
const FALLBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Recap quotidien par email (cf. vatu/decisions.md, 24/09/2026) : un email par
 * cabinet listant les alertes apparues depuis le dernier envoi, adresse a tous
 * les membres du cabinet (coherent avec "tout le monde voit tout").
 *
 * Pas de gating Vatu Pro ici : contrairement a "Lire avec l'IA", prevenir un
 * cabinet d'une nouvelle alerte n'est pas une fonctionnalite premium.
 *
 * Un cabinet sans nouvelle alerte ne recoit rien (pas de bruit inutile), mais
 * son horodatage est quand meme avance - sinon une fenetre vide grandirait
 * indefiniment sans jamais rien changer au resultat.
 */
async function runDailyDigest() {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[digest] RESEND_API_KEY non configure - recap quotidien desactive");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const cabinets = await listCabinetsForDigest();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const cabinet of cabinets) {
    const since = cabinet.last_digest_sent_at || new Date(Date.now() - FALLBACK_WINDOW_MS);

    try {
      const alerts = await listAlertsSince(cabinet.id, since);

      if (alerts.length === 0) {
        await markDigestSent(cabinet.id);
        skipped += 1;
        continue;
      }

      const recipients = (cabinet.members || [])
        .map((m) => m.email)
        .filter(Boolean);

      if (recipients.length === 0) {
        console.warn(`[digest] cabinet ${cabinet.id} sans email de membre valide - ignore`);
        skipped += 1;
        continue;
      }

      await sendDigestEmail({ to: recipients, cabinetName: cabinet.name, alerts });
      await markDigestSent(cabinet.id);
      sent += 1;
      console.log(`[digest] cabinet ${cabinet.id}: ${alerts.length} alerte(s) envoyee(s) a ${recipients.length} destinataire(s)`);
    } catch (error) {
      failed += 1;
      // Pas de markDigestSent en cas d'echec : le prochain passage reprend la
      // meme fenetre (plus les alertes survenues depuis), rien n'est perdu.
      if (error instanceof NotificationUnavailableError) {
        console.warn(`[digest] cabinet ${cabinet.id}: ${error.message}`);
      } else {
        console.error(`[digest] cabinet ${cabinet.id} echec envoi:`, error.message);
      }
    }
  }

  console.log(`[digest] termine: ${sent} envoye(s), ${skipped} sans nouveaute, ${failed} echec(s)`);
  return { sent, skipped, failed };
}

export { runDailyDigest };
