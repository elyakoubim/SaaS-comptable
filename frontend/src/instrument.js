/**
 * Suivi d'erreurs cote navigateur (Sentry, 28/09/2026). Desactive tant que
 * VITE_SENTRY_DSN n'est pas defini au build (Vercel/Render n'exposent que les
 * variables prefixees VITE_ au bundle - cf. import.meta.env). Meme raisonnement
 * que backend/src/instrument.js : pas de compte Sentry fourni, donc inactif
 * par defaut. Pour l'activer : creer un projet Sentry (type React) et poser
 * son DSN comme variable d'environnement de build du frontend.
 */
import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN || "";
const isSentryEnabled = Boolean(dsn);

if (isSentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0
  });
}

export { Sentry, isSentryEnabled };
