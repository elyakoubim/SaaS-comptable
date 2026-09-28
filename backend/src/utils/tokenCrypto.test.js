import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { encryptText, decryptText } from "./tokenCrypto.js";

describe("encryptText / decryptText", () => {
  const originalKey = process.env.TOKEN_ENCRYPTION_KEY;

  before(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(32);
  });

  after(() => {
    if (originalKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    }
  });

  test("chiffrement puis déchiffrement restitue le texte d'origine", () => {
    const plain = "un-refresh-token-myminfin-tres-sensible";
    const cipher = encryptText(plain);
    assert.notEqual(cipher, plain);
    assert.equal(decryptText(cipher), plain);
  });

  test("deux chiffrements du même texte produisent des résultats différents (IV aléatoire)", () => {
    const plain = "meme-texte";
    const cipherA = encryptText(plain);
    const cipherB = encryptText(plain);
    assert.notEqual(cipherA, cipherB);
    assert.equal(decryptText(cipherA), plain);
    assert.equal(decryptText(cipherB), plain);
  });

  test("un texte altéré échoue à la vérification GCM plutôt que de renvoyer des données corrompues", () => {
    const cipher = encryptText("donnee-integre");
    const buffer = Buffer.from(cipher, "base64");
    // Modifie un octet du texte chiffré (après iv[12] + tag[16]) sans toucher
    // à la longueur : la vérification d'intégrité GCM doit lever une erreur.
    buffer[buffer.length - 1] ^= 0xff;
    const tampered = buffer.toString("base64");
    assert.throws(() => decryptText(tampered));
  });

  test("clé absente lève une erreur explicite", () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.throws(() => encryptText("x"), /TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(32);
  });

  test("clé trop courte lève une erreur explicite", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "trop-court";
    assert.throws(() => encryptText("x"), /TOKEN_ENCRYPTION_KEY/);
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(32);
  });
});
