// Outil interne de revue (point #21 - mesurer la precision de "Lire avec
// l'IA" avant de facturer dessus). Inerte tant qu'ADMIN_SECRET n'est pas
// configure, meme principe que Sentry/R2 : le code est livre pret, mais ne
// s'active qu'une fois le secret genere et pose sur Render. Jamais expose
// aux cabinets clients - uniquement a l'operateur de Vatu.
const adminSecret = process.env.ADMIN_SECRET || "";
const isAdminReviewEnabled = Boolean(adminSecret);

export { adminSecret, isAdminReviewEnabled };
