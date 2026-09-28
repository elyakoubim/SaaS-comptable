import "./config/env.js";
import { Sentry, isSentryEnabled } from "./instrument.js";
import { app } from "./app.js";
import { authConfig } from "./config/auth.config.js";
import { ensureDatabaseSchema, verifyDatabaseConnection } from "./config/db.js";
import { ensureDemoAccount } from "./repositories/accountant.repository.js";
import { hashPassword } from "./utils/authCrypto.js";
import { backfillAlertClassification } from "./migrations/backfillAlertClassification.js";

const port = Number(process.env.PORT || 4000);

// Filet de securite : sans ces deux handlers, une erreur non rattrapee dans un
// callback async fait planter le process (ou pire, le laisse dans un etat
// indefini) sans jamais remonter a Sentry.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  if (isSentryEnabled) {
    Sentry.captureException(reason);
  }
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (isSentryEnabled) {
    Sentry.captureException(error);
  }
  process.exit(1);
});

async function bootstrap() {
  try {
    await verifyDatabaseConnection();
    await ensureDatabaseSchema();

    // Recalcule les alertes créées avec l'ancien classificateur (titres
    // `[cle] ...`). Ciblé sur ces seules lignes : no-op rapide une fois fait.
    // Isolé dans son propre try/catch pour ne jamais bloquer le reste du
    // bootstrap (compte démo, démarrage du serveur) en cas de souci.
    try {
      const { scanned, updated } = await backfillAlertClassification();
      if (scanned > 0) {
        console.log(`[migration] alertes reclassifiees : ${updated}/${scanned}`);
      }
    } catch (migrationError) {
      console.warn("Alert classification backfill warning:", migrationError.message || migrationError);
    }

    if (process.env.ACCOUNTANT_DEMO_ID) {
      await ensureDemoAccount({
        accountantId: process.env.ACCOUNTANT_DEMO_ID,
        email: authConfig.demoEmail,
        passwordHash: await hashPassword(authConfig.demoPassword, authConfig.bcryptRounds),
        fullName: authConfig.demoFullName
      });
    }
  } catch (error) {
    console.warn("Database bootstrap warning:", error.message || error);
    if (isSentryEnabled) {
      Sentry.captureException(error);
    }
  }

  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap backend:", error.message);
  process.exit(1);
});
