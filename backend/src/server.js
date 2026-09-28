import "./config/env.js";
import { app } from "./app.js";
import { authConfig } from "./config/auth.config.js";
import { ensureDatabaseSchema, verifyDatabaseConnection } from "./config/db.js";
import { ensureDemoAccount } from "./repositories/accountant.repository.js";
import { hashPassword } from "./utils/authCrypto.js";
import { backfillAlertClassification } from "./migrations/backfillAlertClassification.js";

const port = Number(process.env.PORT || 4000);

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
  }

  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap backend:", error.message);
  process.exit(1);
});
