import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, signSessionToken, verifySessionToken } from "./authCrypto.js";

describe("hashPassword / verifyPassword", () => {
  test("rejette un mot de passe de moins de 8 caractères", async () => {
    await assert.rejects(() => hashPassword("short"), /at least 8 characters/);
  });

  test("hash puis vérification réussissent avec le bon mot de passe", async () => {
    const hash = await hashPassword("un-mot-de-passe-valide");
    const ok = await verifyPassword("un-mot-de-passe-valide", hash);
    assert.equal(ok, true);
  });

  test("la vérification échoue avec un mauvais mot de passe", async () => {
    const hash = await hashPassword("un-mot-de-passe-valide");
    const ok = await verifyPassword("un-autre-mot-de-passe", hash);
    assert.equal(ok, false);
  });

  test("la vérification échoue proprement si le hash stocké est vide", async () => {
    const ok = await verifyPassword("peu importe", "");
    assert.equal(ok, false);
  });
});

describe("signSessionToken / verifySessionToken", () => {
  const secret = "un-secret-de-test-suffisamment-long";

  test("un token signé se vérifie et porte le bon sujet", () => {
    const token = signSessionToken({
      accountantId: "acc-123",
      email: "contact@legakte.be",
      fullName: "Test User",
      secret,
      expiresInSeconds: 3600
    });

    const decoded = verifySessionToken(token, secret);
    assert.equal(decoded.sub, "acc-123");
    assert.equal(decoded.email, "contact@legakte.be");
    assert.equal(decoded.name, "Test User");
  });

  test("signer sans secret lève une erreur explicite", () => {
    assert.throws(
      () =>
        signSessionToken({
          accountantId: "acc-123",
          email: "x@x.be",
          fullName: "X",
          secret: "",
          expiresInSeconds: 3600
        }),
      /AUTH_JWT_SECRET/
    );
  });

  test("vérifier sans secret lève une erreur explicite", () => {
    assert.throws(() => verifySessionToken("un-token", ""), /AUTH_JWT_SECRET/);
  });

  test("un token vérifié avec le mauvais secret échoue", () => {
    const token = signSessionToken({
      accountantId: "acc-123",
      email: "x@x.be",
      fullName: "X",
      secret,
      expiresInSeconds: 3600
    });
    assert.throws(() => verifySessionToken(token, "un-secret-different"));
  });

  test("un token vérifié avec un issuer différent échoue", () => {
    const token = signSessionToken({
      accountantId: "acc-123",
      email: "x@x.be",
      fullName: "X",
      secret,
      expiresInSeconds: 3600,
      issuer: "autre-issuer"
    });
    // par défaut verifySessionToken attend "nv-saas-backend"
    assert.throws(() => verifySessionToken(token, secret));
  });
});
