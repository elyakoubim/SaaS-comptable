import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signS3Request, toAmzDate, encodeUriPath, getSignatureKey } from "./awsSigV4.js";

const FIXED_DATE = new Date("2026-09-28T14:30:00.000Z");

const BASE_PARAMS = {
  method: "GET",
  host: "abc123.r2.cloudflarestorage.com",
  path: "/mon-bucket/documents/mandant-ecb/doc-uuid",
  region: "auto",
  service: "s3",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  date: FIXED_DATE
};

describe("toAmzDate", () => {
  test("produit le format compact ISO8601 attendu par SigV4", () => {
    assert.equal(toAmzDate(FIXED_DATE), "20260928T143000Z");
  });
});

describe("encodeUriPath", () => {
  test("encode chaque segment sans toucher aux séparateurs /", () => {
    assert.equal(encodeUriPath("/bucket/documents/a b/c"), "/bucket/documents/a%20b/c");
  });

  test("laisse les segments déjà valides intacts", () => {
    assert.equal(encodeUriPath("/bucket/documents/1234567890/uuid-1234"), "/bucket/documents/1234567890/uuid-1234");
  });
});

describe("getSignatureKey", () => {
  test("est déterministe : mêmes entrées, même clé de signature", () => {
    const a = getSignatureKey("secret", "20260928", "auto", "s3");
    const b = getSignatureKey("secret", "20260928", "auto", "s3");
    assert.deepEqual(a, b);
  });

  test("un secret différent produit une clé différente", () => {
    const a = getSignatureKey("secret-a", "20260928", "auto", "s3");
    const b = getSignatureKey("secret-b", "20260928", "auto", "s3");
    assert.notDeepEqual(a, b);
  });
});

describe("signS3Request", () => {
  test("produit une Authorization avec le bon schéma et la bonne portée", () => {
    const { headers } = signS3Request(BASE_PARAMS);
    assert.match(
      headers.Authorization,
      /^AWS4-HMAC-SHA256 Credential=test-access-key\/20260928\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/
    );
  });

  test("est déterministe pour des entrées et une date fixées", () => {
    const first = signS3Request(BASE_PARAMS);
    const second = signS3Request(BASE_PARAMS);
    assert.equal(first.headers.Authorization, second.headers.Authorization);
  });

  test("une date différente change la signature", () => {
    const first = signS3Request(BASE_PARAMS);
    const second = signS3Request({ ...BASE_PARAMS, date: new Date("2026-09-29T00:00:00.000Z") });
    assert.notEqual(first.headers.Authorization, second.headers.Authorization);
  });

  test("un corps différent change la signature (payload hash inclus)", () => {
    const put = { ...BASE_PARAMS, method: "PUT" };
    const first = signS3Request({ ...put, body: Buffer.from("contenu-a") });
    const second = signS3Request({ ...put, body: Buffer.from("contenu-b") });
    assert.notEqual(first.headers.Authorization, second.headers.Authorization);
    assert.notEqual(first.headers["X-Amz-Content-Sha256"], second.headers["X-Amz-Content-Sha256"]);
  });

  test("le hash du corps vide est celui d'une chaîne vide (GET sans body)", () => {
    const { headers } = signS3Request(BASE_PARAMS);
    // sha256("") — constante bien connue, indépendante de toute entrée secrète.
    assert.equal(
      headers["X-Amz-Content-Sha256"],
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  test("inclut les en-têtes additionnels (ex: content-type) dans la réponse et dans la signature", () => {
    const { headers, canonicalRequest } = signS3Request({
      ...BASE_PARAMS,
      method: "PUT",
      body: Buffer.from("test"),
      extraHeaders: { "content-type": "application/pdf" }
    });
    assert.equal(headers["content-type"], "application/pdf");
    assert.match(canonicalRequest, /content-type:application\/pdf/);
  });

  test("construit l'URL à partir du host et du chemin", () => {
    const { url } = signS3Request(BASE_PARAMS);
    assert.equal(url, "https://abc123.r2.cloudflarestorage.com/mon-bucket/documents/mandant-ecb/doc-uuid");
  });
});
