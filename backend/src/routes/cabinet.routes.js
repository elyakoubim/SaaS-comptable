import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { listMembers, createInvitation } from "../repositories/cabinet.repository.js";

const cabinetRouter = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

// Visible par tout membre du cabinet : "tout le monde voit tout" s'applique
// aussi a la liste de l'equipe elle-meme (decision du 24/09/2026).
cabinetRouter.get("/members", requireAuth, async (req, res) => {
  try {
    const members = await listMembers(req.auth.cabinetId);
    return res.json({
      items: members.map((m) => ({
        id: m.id,
        email: m.email,
        fullName: m.full_name,
        role: m.role,
        createdAt: m.created_at
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Reserve au owner : seul le titulaire du cabinet invite de nouveaux membres
// (decision du 24/09/2026 - un seul role gestionnaire).
cabinetRouter.post("/invite", requireAuth, async (req, res) => {
  try {
    if (req.auth.role !== "owner") {
      return res.status(403).json({ message: "Reserve au titulaire du cabinet" });
    }

    const email = String(req.body?.email || "").toLowerCase().trim();
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "email invalide" });
    }

    const invitation = await createInvitation(req.auth.cabinetId, email, req.auth.accountantId);
    const inviteUrl = `${frontendUrl()}/register?invite=${invitation.token}`;

    return res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      inviteUrl,
      createdAt: invitation.created_at
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export { cabinetRouter };
