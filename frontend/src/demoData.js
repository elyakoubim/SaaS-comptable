// Donnees 100% fictives pour la page de demonstration publique (/demo).
//
// Pourquoi ce fichier existe (decision du 24/09/2026) : les 3 mandants de
// test reels de l'app (BOOST YOUR TEAM, Alliance for AI IoT, BAROCY) sont de
// VRAIES entreprises belges avec de VRAIS documents fiscaux, recuperes via
// l'environnement de test du SPF. Les exposer publiquement violerait leur
// confidentialite (RGPD) - donc la demo utilise exclusivement des noms,
// numeros BCE et documents entierement inventes, jamais les vraies donnees
// de test SPF.

const DEMO_PORTFOLIO = [
  {
    mandantEcb: "0000000001",
    companyName: "Exemple Boulangerie SRL",
    lastSyncAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    counts: { critical: 1, warning: 1, info: 0 },
    topAlert: {
      title: "Sommation de payer",
      level: "critical",
      category: "recouvrement",
      documentDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    }
  },
  {
    mandantEcb: "0000000002",
    companyName: "Demo Consulting SA",
    lastSyncAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    counts: { critical: 1, warning: 0, info: 1 },
    topAlert: {
      title: "Convocation pour controle fiscal",
      level: "critical",
      category: "controle",
      documentDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
  },
  {
    mandantEcb: "0000000003",
    companyName: "Atelier Demo Menuiserie",
    lastSyncAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    counts: { critical: 0, warning: 0, info: 0 },
    topAlert: null
  }
];

const DEMO_ALERTS = [
  {
    id: "demo-1",
    mandantEcb: "0000000001",
    companyName: "Exemple Boulangerie SRL",
    level: "critical",
    title: "Sommation de payer",
    detail: "Categorie : recouvrement · Date : " + new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-BE"),
    category: "recouvrement",
    documentFpsId: null,
    documentDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    extraction: {
      montant: "1 240,00 EUR",
      dateEcheance: "2026-10-05",
      reference: "REC-2026-004821",
      accroche: "Sommation de payer 1 240,00 EUR avant le 05/10, frais de poursuite inclus."
    }
  },
  {
    id: "demo-2",
    mandantEcb: "0000000001",
    companyName: "Exemple Boulangerie SRL",
    level: "warning",
    title: "Avis de paiement TVA",
    detail: "Categorie : paiement · Date : " + new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-BE"),
    category: "paiement",
    documentFpsId: null,
    documentDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    extraction: {
      montant: "820,50 EUR",
      dateEcheance: "2026-10-20",
      reference: "TVA-Q3-2026",
      accroche: "Solde TVA du 3e trimestre a regler avant le 20/10."
    }
  },
  {
    id: "demo-3",
    mandantEcb: "0000000002",
    companyName: "Demo Consulting SA",
    level: "critical",
    title: "Convocation pour controle fiscal",
    detail: "Categorie : controle · Date : " + new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-BE"),
    category: "controle",
    documentFpsId: null,
    documentDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    extraction: {
      montant: null,
      dateEcheance: "2026-10-12",
      reference: "CTRL-2026-1187",
      accroche: "Convocation pour controle sur place le 12/10 - documents comptables a preparer."
    }
  },
  {
    id: "demo-4",
    mandantEcb: "0000000002",
    companyName: "Demo Consulting SA",
    level: "info",
    title: "Accuse de reception",
    detail: "Categorie : accuse · Date : " + new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toLocaleDateString("fr-BE"),
    category: "accuse",
    documentFpsId: null,
    documentDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    extraction: null
  }
];

export { DEMO_PORTFOLIO, DEMO_ALERTS };
