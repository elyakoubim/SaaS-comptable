import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findMandantByEcb } from "../repositories/mandant.repository.js";
import { enqueueDocumentSyncForMandant } from "../workers/queues.js";

const syncRouter = Router();

syncRouter.post("/:cbe", requireAuth, async (req, res) => {
  try {
    const cbe = String(req.params.cbe || "");
    if (!/^\d{10}$/.test(cbe)) {
      return res.status(400).json({ message: "cbe must contain exactly 10 digits" });
    }

    const mandant = await findMandantByEcb(cbe);
    if (!mandant || mandant.accountant_id !== req.auth.accountantId) {
      return res.status(404).json({ message: "Mandant not found for authenticated accountant" });
    }

    const job = await enqueueDocumentSyncForMandant(cbe);
    return res.status(202).json({ queued: true, jobId: job.id });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { syncRouter };
