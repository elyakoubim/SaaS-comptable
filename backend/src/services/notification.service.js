import { resendClient, fromAddress } from "../config/resend.config.js";

class NotificationUnavailableError extends Error {}

const LEVEL_LABELS = { critical: "Critique", warning: "À traiter", info: "Info" };
const LEVEL_COLORS = { critical: "#dc2626", warning: "#d97706", info: "#2563eb" };

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("fr-BE", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/**
 * Rendu HTML minimal du recap quotidien - pas de webfont ni de dependance
 * externe (un client mail n'execute pas de CSS externe de toute facon),
 * styles inline uniquement, compatible avec la plupart des clients mail.
 */
function renderDigestHtml({ cabinetName, alerts, appUrl }) {
  const criticalCount = alerts.filter((a) => a.niveau === "critical").length;
  const warningCount = alerts.filter((a) => a.niveau === "warning").length;

  const summaryParts = [];
  if (criticalCount > 0) summaryParts.push(`${criticalCount} critique${criticalCount > 1 ? "s" : ""}`);
  if (warningCount > 0) summaryParts.push(`${warningCount} à traiter`);
  const summary = summaryParts.length > 0 ? summaryParts.join(", ") : `${alerts.length} nouvelle(s)`;

  const rows = alerts
    .map((alert) => {
      const color = LEVEL_COLORS[alert.niveau] || "#6b7280";
      const label = LEVEL_LABELS[alert.niveau] || alert.niveau;
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${color}1a;color:${color};font-size:12px;font-weight:600;">${escapeHtml(label)}</span>
            <div style="margin-top:6px;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(alert.company_name || alert.ecb_number)}</div>
            <div style="font-size:13px;color:#4b5563;">${escapeHtml(alert.titre)}${alert.document_date ? ` · ${formatDate(alert.document_date)}` : ""}</div>
          </td>
        </tr>`;
    })
    .join("");

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <h1 style="font-size:18px;color:#111827;">Récap Vatu — ${escapeHtml(cabinetName || "votre cabinet")}</h1>
      <p style="font-size:14px;color:#4b5563;">${escapeHtml(summary)} depuis votre dernier récap.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <p style="margin-top:20px;">
        <a href="${escapeHtml(appUrl)}/alerts" style="display:inline-block;padding:10px 16px;background:#059669;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Voir les alertes sur Vatu</a>
      </p>
    </div>`;
}

async function sendDigestEmail({ to, cabinetName, alerts }) {
  if (!resendClient) {
    throw new NotificationUnavailableError("RESEND_API_KEY non configure");
  }

  const appUrl = process.env.FRONTEND_URL || "https://app.vatu.be";
  const html = renderDigestHtml({ cabinetName, alerts, appUrl });
  const criticalCount = alerts.filter((a) => a.niveau === "critical").length;
  const subject = criticalCount > 0
    ? `Vatu — ${criticalCount} alerte(s) critique(s) à traiter`
    : `Vatu — ${alerts.length} nouvelle(s) alerte(s)`;

  const { error } = await resendClient.emails.send({
    from: fromAddress,
    to,
    subject,
    html
  });

  if (error) {
    throw new Error(`Resend a refuse l'envoi: ${error.message || JSON.stringify(error)}`);
  }
}

export { sendDigestEmail, renderDigestHtml, NotificationUnavailableError };
