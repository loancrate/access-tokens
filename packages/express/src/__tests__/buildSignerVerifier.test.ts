import { describe, expect, it } from "@jest/globals";
import { decodeJwt } from "jose";

import { buildSignerVerifier, JwtConfig } from "../buildSignerVerifier.js";
import { generateKeySet } from "../generateKeySet.js";

describe("buildSignerVerifier", () => {
  it("should build signer and verifier with valid EdDSA config", async () => {
    const keySet = await generateKeySet("test-key-eddsa", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    const signerVerifier = await buildSignerVerifier(config);

    expect(signerVerifier).toHaveProperty("sign");
    expect(signerVerifier).toHaveProperty("verify");
    expect(signerVerifier).toHaveProperty("jwks");
    expect(signerVerifier.jwks.keys).toEqual(keySet.public_keys);
  });

  it("should build signer and verifier with valid RS256 config", async () => {
    const keySet = await generateKeySet("test-key-rs256", "RS256");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "15m",
    };

    const signerVerifier = await buildSignerVerifier(config);

    expect(signerVerifier).toHaveProperty("sign");
    expect(signerVerifier).toHaveProperty("verify");
    expect(signerVerifier).toHaveProperty("jwks");
    expect(signerVerifier.jwks.keys).toEqual(keySet.public_keys);
  });

  it("should throw error when active_kid not found in private_keys", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    keySet.active_kid = "non-existent-kid";

    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    await expect(buildSignerVerifier(config)).rejects.toThrow(
      "No private key found for active_kid non-existent-kid",
    );
  });

  it("should throw error when active key missing alg property", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    delete keySet.private_keys[0].alg;

    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    await expect(buildSignerVerifier(config)).rejects.toThrow(
      "Active key is missing 'alg' property",
    );
  });

  it("should sign JWT with correct claims and headers", async () => {
    const keySet = await generateKeySet("test-key-eddsa", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    const signerVerifier = await buildSignerVerifier(config);
    const claims = {
      sub: "test-subject",
      owner: "test-owner",
      admin: false,
    };

    const jwt = await signerVerifier.sign(claims);

    const decoded = decodeJwt(jwt);
    expect(decoded.sub).toBe("test-subject");
    expect(decoded.owner).toBe("test-owner");
    expect(decoded.admin).toBe(false);
    expect(decoded.iss).toBe("test-issuer");
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
    expect(decoded.jti).toBeDefined();
  });

  it("should verify valid JWT", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    const signerVerifier = await buildSignerVerifier(config);
    const claims = {
      sub: "test-subject",
      owner: "test-owner",
      admin: true,
    };

    const jwt = await signerVerifier.sign(claims);
    const result = await signerVerifier.verify(jwt);

    expect(result.payload.sub).toBe("test-subject");
    expect(result.payload.owner).toBe("test-owner");
    expect(result.payload.admin).toBe(true);
    expect(result.payload.iss).toBe("test-issuer");
    expect(result.protectedHeader.alg).toBe("EdDSA");
    expect(result.protectedHeader.kid).toBe("test-key");
  });

  it("should reject JWT with invalid signature", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    const signerVerifier = await buildSignerVerifier(config);

    const invalidJwt =
      "eyJhbGciOiJFZERTQSIsImtpZCI6InRlc3Qta2V5IiwidHlwIjoiSldUIn0.eyJzdWIiOiJ0ZXN0LXN1YmplY3QiLCJvd25lciI6InRlc3Qtb3duZXIiLCJhZG1pbiI6ZmFsc2UsImlzcyI6InRlc3QtaXNzdWVyIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjE3MDAwMDM2MDAsImp0aSI6InRlc3QtanRpIn0.invalid-signature";

    await expect(signerVerifier.verify(invalidJwt)).rejects.toThrow();
  });

  it("should reject JWT with wrong issuer", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    };

    const signerVerifier = await buildSignerVerifier(config);

    const wrongIssuerConfig: JwtConfig = {
      keySet,
      issuer: "wrong-issuer",
      ttl: "1h",
    };

    const wrongIssuerSignerVerifier =
      await buildSignerVerifier(wrongIssuerConfig);
    const jwt = await wrongIssuerSignerVerifier.sign({
      sub: "test",
      owner: "test",
      admin: false,
    });

    await expect(signerVerifier.verify(jwt)).rejects.toThrow();
  });

  it("should reject expired JWT", async () => {
    const keySet = await generateKeySet("test-key", "EdDSA");
    const config: JwtConfig = {
      keySet,
      issuer: "test-issuer",
      ttl: "0s",
    };

    const signerVerifier = await buildSignerVerifier(config);
    const jwt = await signerVerifier.sign({
      sub: "test",
      owner: "test",
      admin: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    await expect(signerVerifier.verify(jwt)).rejects.toThrow();
  });
});
