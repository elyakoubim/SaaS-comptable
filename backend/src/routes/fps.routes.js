import { Router } from "express";
import { buildAuthorizationUrl, exchangeAuthorizationCode } from "../services/fpsAuth.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findMandantByEcb, listMandantsSummary } from "../repositories/mandant.repository.js";

const fpsRouter = Router();

fpsRouter.post("/connect/start", requireAuth, (req, res) => {
  try {
    const { ecbNumber } = req.body;
    if (!/^\d{10}$/.test(String(ecbNumber || ""))) {
      return res.status(400).json({ message: "ecbNumber must contain exactly 10 digits" });
    }

    const authorizationUrl = buildAuthorizationUrl(String(ecbNumber), req.auth.accountantId);
    return res.json({ authorizationUrl });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

fpsRouter.get("/connect/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ message: "Missing code or state" });
    }

    const { ecbNumber } = await exchangeAuthorizationCode({
      code: String(code),
      state: String(state)
    });

    // Premiere collecte immediate. Sans elle, un dossier fraichement connecte
    // reste vide jusqu'au balayage horaire suivant : le client voit « Connexion
    // reussie » puis un tableau de bord desert, ce qui est le pire premier
    // contact possible. Le worker calcule lui-meme la fenetre — 60 jours quand
    // last_sync_at est nul, c'est-a-dire ici.
    try {
      const { enqueueDocumentSyncForMandant } = await import("../workers/queues.js");
      await enqueueDocumentSyncForMandant(ecbNumber);
      console.log(`[fps] initial document sync enqueued for ${ecbNumber}`);
    } catch (syncError) {
      // Redis indisponible ne doit pas transformer un consentement reussi en
      // echec : le consentement est acquis, le balayage horaire rattrapera.
      console.error(`[fps] could not enqueue initial sync for ${ecbNumber}: ${syncError.message}`);
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/connect/success`);
  } catch (error) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const reason = encodeURIComponent(error.message || "Unexpected callback error");
    return res.redirect(`${frontendUrl}/connect/error?reason=${reason}`);
  }
});

fpsRouter.get("/mandants", requireAuth, async (req, res) => {
  try {
    const rows = await listMandantsSummary(req.auth.accountantId);
    return res.json({ data: rows });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

fpsRouter.post("/tokens/refresh", requireAuth, async (req, res) => {
  try {
    const { enqueueBulkRefresh, enqueueRefreshForMandant } = await import("../workers/queues.js");
    const { ecbNumber } = req.body || {};

    if (ecbNumber) {
      if (!/^\d{10}$/.test(String(ecbNumber))) {
        return res.status(400).json({ message: "ecbNumber must contain exactly 10 digits" });
      }

      const mandant = await findMandantByEcb(String(ecbNumber));
      if (!mandant || mandant.accountant_id !== req.auth.accountantId) {
        return res.status(404).json({ message: "Mandant not found for authenticated accountant" });
      }

      await enqueueRefreshForMandant(String(ecbNumber));
      return res.status(202).json({ message: "Refresh job enqueued", scope: "single" });
    }

    await enqueueBulkRefresh();
    return res.status(202).json({ message: "Refresh job enqueued", scope: "all" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { fpsRouter };
