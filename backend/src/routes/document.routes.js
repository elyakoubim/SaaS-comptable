import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { findByFpsId } from "../repositories/document.repository.js";
import { findMandantByEcb } from "../repositories/mandant.repository.js";
import { getValidAccessToken } from "../services/fpsAuth.service.js";
import { downloadDocument } from "../services/myMinfinClient.service.js";
import { ApiError, AuthError, RateLimitError } from "../services/myMinfinErrors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const documentRouter = Router();

/**
 * Télécharge le contenu d'un document MyMinfin et le relaie au navigateur.
 *
 * Le PDF n'est pas stocké : il est récupéré à la demande avec le token du
 * mandant. La fenêtre MyMinfin étant de 60 jours glissants, un archivage
 * viendra plus tard — il suppose une décision de stockage (disque persistant
 * ou object storage) qui n'a pas à bloquer la consultation.
 *
 * Le propriétaire réel du document (`owner_type` / `owner_identifier`, issus de
 * `relatedTo`) est indispensable dès qu'il appartient à un mandant : sans lui
 * le SPF répond 403 (scénarios S04 vs S05).
 */
documentRouter.get("/:uuid/content", requireAuth, async (req, res) => {
  const uuid = String(req.params.uuid || "");

  if (!UUID_PATTERN.test(uuid)) {
    return res.status(400).json({ message: "uuid invalide" });
  }

  try {
    const document = await findByFpsId(uuid);

    // Cloisonnement : un comptable ne peut atteindre que les documents des
    // mandants qui lui appartiennent. On répond 404 plutôt que 403 pour ne pas
    // révéler l'existence d'un document appartenant à un autre cabinet.
    const mandant = document ? await findMandantByEcb(document.mandant_ecb) : null;
    if (!document || !mandant || mandant.accountant_id !== req.auth.accountantId) {
      return res.status(404).json({ message: "Document introuvable" });
    }

    const accessToken = await getValidAccessToken(document.mandant_ecb);
    const { content, contentType, extension } = await downloadDocument(accessToken, uuid, {
      ownerType: document.owner_type,
      ownerIdentifier: document.owner_identifier
    });

    // Le type est déduit des octets, pas de l'en-tête du SPF qui annonce
    // `application/octet-stream` pour tout. Un .docx servi en application/pdf
    // ouvrirait un lecteur PDF sur un fichier qui n'en est pas un.
    const fileName = extension ? `${uuid}.${extension}` : uuid;
    const disposition = contentType === "application/pdf" ? "inline" : "attachment";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${fileName}"`);
    res.setHeader("Content-Length", String(content.length));
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(content);
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      return res.status(429).json({
        message: "Quota MyMinfin atteint, réessayez dans un instant",
        retryAfterSeconds: error.retryAfterSeconds
      });
    }

    if (error instanceof AuthError) {
      return res.status(error.retryable ? 503 : 403).json({ message: error.message });
    }

    if (error instanceof ApiError) {
      return res.status(error.status && error.status >= 400 ? error.status : 502).json({
        message: error.message
      });
    }

    console.error(`[documents] download failed for ${uuid}:`, error.message);
    return res.status(500).json({ message: error.message });
  }
});

export { documentRouter };
