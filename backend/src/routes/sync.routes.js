import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findMandantByEcb } from "../repositories/mandant.repository.js";
import { enqueueDocumentSyncForMandant } from "../workers/queues.js";
import { listSyncRunsForCabinet } from "../repositories/syncRun.repository.js";

const syncRouter = Router();

syncRouter.post("/:cbe", requireAuth, async (req, res) => {
  try {
    const cbe = String(req.params.cbe || "");
    if (!/^\d{10}$/.test(cbe)) {
      return res.status(400).json({ message: "cbe must contain exactly 10 digits" });
    }

    const mandant = await findMandantByEcb(cbe);
    if (!mandant || mandant.cabinet_id !== req.auth.cabinetId) {
      return res.status(404).json({ message: "Mandant not found for authenticated accountant" });
    }

    const job = await enqueueDocumentSyncForMandant(cbe);
    return res.status(202).json({ queued: true, jobId: job.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Historique des synchros (succes/echec) pour le cabinet authentifie.
// Filtrable par ?cbe=<10 chiffres> et paginable par ?limit=<n> (defaut 50, max 200).
syncRouter.get("/runs", requireAuth, async (req, res) => {
  try {
    const cbe = req.query.cbe ? String(req.query.cbe) : null;
    if (cbe && !/^\d{10}$/.test(cbe)) {
      return res.status(400).json({ message: "cbe must contain exactly 10 digits" });
    }

    const items = await listSyncRunsForCabinet(req.auth.cabinetId, {
      ecbNumber: cbe,
      limit: req.query.limit
    });

    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { syncRouter };
