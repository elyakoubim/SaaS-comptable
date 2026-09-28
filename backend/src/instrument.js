/**
 * Suivi d'erreurs (Sentry, 28/09/2026). Desactive tant que SENTRY_DSN n'est
 * pas defini - je n'ai pas de compte Sentry a fournir, donc ce module ne fait
 * rien par defaut. Pour l'activer : creer un projet sur sentry.io, recuperer
 * son DSN, et le mettre dans les variables d'environnement de chaque service
 * Render (SaaS-comptable ET vatu-worker, ce sont deux process distincts).
 *
 * Importe en tout premier (avant tout autre import) dans server.js et
 * workers/scheduler.js - c'est la recommandation Sentry pour capturer les
 * erreurs le plus tot possible dans le cycle de vie du process.
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN || "";
const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
    // Pas de tracing de performance pour l'instant, seulement la capture
    // d'erreurs - un cout de complexite/quota qui n'a pas ete demande.
    tracesSampleRate: 0
  });
}

export { Sentry, isSentryEnabled };
