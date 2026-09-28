import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyDocument, buildAlertTitle, normalize } from "./documentClassifier.service.js";

describe("classifyDocument", () => {
  test("« amendement » ne doit jamais matcher la règle amende (bug historique)", () => {
    // Régression : sans les bornes de mot \b...\b, "amende" matchait dans
    // "amendement" et 81 "Demande de documents pour la demande d'amendement
    // d'une déclaration" partaient à tort en alerte critique.
    const result = classifyDocument(
      "Demande de documents pour la demande d'amendement d'une déclaration"
    );
    assert.notEqual(result.titleKey, "amende_administrative");
    assert.notEqual(result.level, "critical");
    assert.equal(result.titleKey, "demande_documents");
    assert.equal(result.level, "warning");
  });

  test("amende administrative réelle reste critical", () => {
    const result = classifyDocument("Avertissement-extrait de rôle amende administrative");
    assert.equal(result.level, "critical");
    assert.equal(result.titleKey, "amende_administrative");
  });

  test("« avis de paiement » (42% du volume) est warning/paiement, pas autre_document", () => {
    const result = classifyDocument("Avis de paiement");
    assert.equal(result.level, "warning");
    assert.equal(result.titleKey, "avis_paiement");
    assert.equal(result.category, "paiement");
  });

  test("« décision favorable remboursement » est info, pas critical", () => {
    // Bug historique : le mot "décision" seul remontait en alerte critique.
    // La règle remboursement doit gagner avant la règle décision_favorable.
    const result = classifyDocument("Décision favorable Remboursement");
    assert.equal(result.level, "info");
    assert.equal(result.titleKey, "remboursement");
    assert.equal(result.actionable, false);
  });

  test("saisie-arrêt reste la priorité absolue (critical, recouvrement)", () => {
    const result = classifyDocument("Saisie-arrêt entre les mains d'un tiers");
    assert.equal(result.level, "critical");
    assert.equal(result.category, "recouvrement");
    assert.equal(result.actionable, true);
  });

  test("type inconnu retombe sur le fallback autre_document/info", () => {
    const result = classifyDocument("Un type totalement inédit jamais vu");
    assert.deepEqual(result, {
      level: "info",
      titleKey: "autre_document",
      category: "autre",
      actionable: false
    });
  });

  test("chaîne vide, null ou undefined retombent sur le fallback", () => {
    for (const value of ["", null, undefined, "   "]) {
      const result = classifyDocument(value);
      assert.equal(result.titleKey, "autre_document");
    }
  });

  test("matche sur une seule langue d'un LocalizedString (NL seul)", () => {
    const result = classifyDocument({ fr: "", nl: "Aanmaning tot betaling", de: "", en: "" });
    assert.equal(result.titleKey, "sommation");
    assert.equal(result.level, "critical");
  });

  test("matche même si seule la langue DE porte l'information", () => {
    const result = classifyDocument({ fr: "xxx", nl: "yyy", de: "Mahnung", en: "zzz" });
    assert.equal(result.titleKey, "sommation");
  });

  test("les gabarits {XXX} et les nombres n'empêchent pas le matching", () => {
    const result = classifyDocument("Avis de paiement {FISC_EXERCISE_YEAR} 2024");
    assert.equal(result.titleKey, "avis_paiement");
  });

  test("amende UBO est distincte de l'amende administrative générique", () => {
    const result = classifyDocument("UBO - notification d'amende");
    assert.equal(result.titleKey, "amende_ubo");
    assert.equal(result.category, "ubo");
  });

  test("annexe d'attestation reste classée comme attestation (règle spécifique avant générique)", () => {
    const result = classifyDocument("Annexe - Attestation de non-activité");
    assert.equal(result.titleKey, "attestation");
  });
});

describe("normalize", () => {
  test("supprime accents, gabarits, nombres, et compacte les espaces", () => {
    assert.equal(normalize("Décision {FISC_EXERCISE_YEAR} n°2024  favorable"), "decision n favorable");
  });

  test("gère une valeur non-string sans lever", () => {
    assert.equal(normalize(null), "");
    assert.equal(normalize(undefined), "");
    assert.equal(normalize(42), "");
  });
});

describe("buildAlertTitle", () => {
  test("retourne uniquement le libellé si le type brut est identique une fois normalisé", () => {
    const title = buildAlertTitle("avis_paiement", "Avis de paiement");
    assert.equal(title, "Avis de paiement");
  });

  test("concatène libellé et type brut quand ils diffèrent", () => {
    const title = buildAlertTitle("attestation", "Attestation de résidence fiscale");
    assert.equal(title, "Attestation — Attestation de résidence fiscale");
  });

  test("tronque à 300 caractères", () => {
    const longRaw = "x".repeat(500);
    const title = buildAlertTitle("attestation", longRaw);
    assert.equal(title.length, 300);
  });

  test("clé de titre inconnue retombe sur « Document »", () => {
    const title = buildAlertTitle("cle_inexistante", "");
    assert.equal(title, "Document");
  });

  test("respecte la langue demandée avec repli sur le français", () => {
    assert.equal(buildAlertTitle("sommation", "", "nl"), "Aanmaning tot betaling");
    assert.equal(buildAlertTitle("sommation", "", "en"), "Sommation de payer");
  });
});
