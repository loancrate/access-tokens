/**
 * Smoke test for bundled CommonJS output
 *
 * Purpose: Validates that the built package (in dist/) works correctly for
 * downstream consumers using Jest in CommonJS mode.
 *
 * What it tests:
 * - Built artifacts in dist/, not TypeScript source
 * - jose library is properly bundled as CommonJS
 * - No ESM/CJS interop errors occur
 * - Basic functionality works end-to-end
 *
 * When it runs: After build, before full test suite (fail fast on critical issues)
 */

import { describe, expect, it } from "@jest/globals";

// Import from built output, not source
import { buildSignerVerifier, generateKeySet } from "../../dist/index.js";

describe("Smoke test - bundled CommonJS output", () => {
  it("should generate keys, sign and verify JWTs without ESM/CJS errors", async () => {
    // Test EdDSA keyset generation (jose bundled correctly)
    const eddsaKeySet = await generateKeySet("smoke-test-eddsa", "EdDSA");
    expect(eddsaKeySet).toBeDefined();
    expect(eddsaKeySet.active_kid).toBe("smoke-test-eddsa");
    expect(eddsaKeySet.private_keys).toHaveLength(1);
    expect(eddsaKeySet.public_keys).toHaveLength(1);
    expect(eddsaKeySet.private_keys[0].alg).toBe("EdDSA");

    // Test RS256 keyset generation (verify algorithm support)
    const rs256KeySet = await generateKeySet("smoke-test-rs256", "RS256");
    expect(rs256KeySet.private_keys[0].alg).toBe("RS256");

    // Test signer/verifier creation
    const signerVerifier = await buildSignerVerifier({
      keySet: eddsaKeySet,
      issuer: "smoke-test",
      ttl: "1h",
    });
    expect(signerVerifier).toBeDefined();
    expect(signerVerifier.sign).toBeInstanceOf(Function);
    expect(signerVerifier.verify).toBeInstanceOf(Function);
    expect(signerVerifier.jwks).toBeDefined();
    expect(signerVerifier.jwks.keys).toEqual(eddsaKeySet.public_keys);

    // Test JWT signing and verification (end-to-end)
    const token = await signerVerifier.sign({
      sub: "test-user",
      custom: "data",
    });
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");

    const verified = await signerVerifier.verify(token);
    expect(verified.payload.sub).toBe("test-user");
    expect(verified.payload.custom).toBe("data");
    expect(verified.payload.iss).toBe("smoke-test");
  });
});
