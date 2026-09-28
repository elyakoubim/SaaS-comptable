import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderDigestHtml, renderImmediateAlertHtml } from "./notification.service.js";

describe("renderDigestHtml", () => {
  test("échappe le HTML injecté dans un titre d'alerte", () => {
    const html = renderDigestHtml({
      cabinetName: "Cabinet Test",
      alerts: [{ niveau: "warning", titre: "<script>alert(1)</script>", company_name: "ACME" }],
      appUrl: "https://app.vatu.be"
    });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  test("résume le nombre de critiques et de warnings", () => {
    const html = renderDigestHtml({
      cabinetName: "Cabinet Test",
      alerts: [
        { niveau: "critical", titre: "Sommation", company_name: "ACME" },
        { niveau: "critical", titre: "Mise en demeure", company_name: "ACME" },
        { niveau: "warning", titre: "Avis de paiement", company_name: "ACME" }
      ],
      appUrl: "https://app.vatu.be"
    });
    assert.match(html, /2 critiques, 1 à traiter/);
  });

  test("inclut le lien vers l'application", () => {
    const html = renderDigestHtml({ cabinetName: "X", alerts: [], appUrl: "https://app.vatu.be" });
    assert.match(html, /https:\/\/app\.vatu\.be\/alerts/);
  });
});

describe("renderImmediateAlertHtml", () => {
  test("accorde au singulier pour une seule alerte critique", () => {
    const html = renderImmediateAlertHtml({
      cabinetName: "Cabinet Test",
      alerts: [{ titre: "Sommation de payer", company_name: "ACME SPRL", document_date: "2026-09-28" }],
      appUrl: "https://app.vatu.be"
    });
    assert.match(html, /1 alerte critique(?!s)/);
    assert.match(html, /Ce document vient/);
    assert.match(html, /demande une action immédiate/);
  });

  test("accorde au pluriel pour plusieurs alertes critiques", () => {
    const html = renderImmediateAlertHtml({
      cabinetName: "Cabinet Test",
      alerts: [
        { titre: "Sommation de payer", company_name: "ACME SPRL" },
        { titre: "Mise en demeure", company_name: "ACME SPRL" }
      ],
      appUrl: "https://app.vatu.be"
    });
    assert.match(html, /2 alertes critiques/);
    assert.match(html, /Ces documents viennent/);
    assert.match(html, /demandent une action immédiate/);
  });

  test("échappe le HTML injecté dans le nom du cabinet ou le titre", () => {
    const html = renderImmediateAlertHtml({
      cabinetName: "<b>Cabinet</b>",
      alerts: [{ titre: "<img src=x>", company_name: "ACME" }],
      appUrl: "https://app.vatu.be"
    });
    assert.doesNotMatch(html, /<b>Cabinet<\/b>/);
    assert.doesNotMatch(html, /<img src=x>/);
  });

  test("chaque alerte affiche le nom de l'entreprise concernée", () => {
    const html = renderImmediateAlertHtml({
      cabinetName: "Cabinet Test",
      alerts: [
        { titre: "Sommation", company_name: "ACME SPRL" },
        { titre: "Saisie-arrêt", company_name: "Beta SA" }
      ],
      appUrl: "https://app.vatu.be"
    });
    assert.match(html, /ACME SPRL/);
    assert.match(html, /Beta SA/);
  });

  test("retombe sur le numéro BCE si l'entreprise n'a pas de nom", () => {
    const html = renderImmediateAlertHtml({
      cabinetName: "Cabinet Test",
      alerts: [{ titre: "Sommation", ecb_number: "0123456789" }],
      appUrl: "https://app.vatu.be"
    });
    assert.match(html, /0123456789/);
  });
});
