import { exportJWK, generateKeyPair, JWK } from "jose";

import { KeySet } from "./buildSignerVerifier";

export type AlgorithmType = "EdDSA" | "RS256";

export async function generateKeySet(
  kid: string,
  algorithm: AlgorithmType = "EdDSA",
): Promise<KeySet> {
  let privateKey: JWK;
  let publicKey: JWK;
  switch (algorithm) {
    case "EdDSA":
      ({ privateKey, publicKey } = await generateEdDSAKeyPair(kid));
      break;
    case "RS256":
      ({ privateKey, publicKey } = await generateRSAKeyPair(kid));
      break;
    // istanbul ignore next
    default: {
      const exhaustiveCheck: never = algorithm;
      throw new Error(`Unsupported algorithm: ${String(exhaustiveCheck)}`);
    }
  }
  return {
    active_kid: kid,
    private_keys: [privateKey],
    public_keys: [publicKey],
  };
}

async function generateEdDSAKeyPair(
  kid: string,
): Promise<{ privateKey: JWK; publicKey: JWK }> {
  const keyPair = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  const privateKey = await exportJWK(keyPair.privateKey);
  const publicKey = await exportJWK(keyPair.publicKey);

  privateKey.kid = kid;
  privateKey.alg = "EdDSA";
  privateKey.use = "sig";

  publicKey.kid = kid;
  publicKey.alg = "EdDSA";
  publicKey.use = "sig";

  return { privateKey, publicKey };
}

async function generateRSAKeyPair(
  kid: string,
): Promise<{ privateKey: JWK; publicKey: JWK }> {
  const keyPair = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const privateKey = await exportJWK(keyPair.privateKey);
  const publicKey = await exportJWK(keyPair.publicKey);

  privateKey.kid = kid;
  privateKey.alg = "RS256";
  privateKey.use = "sig";

  publicKey.kid = kid;
  publicKey.alg = "RS256";
  publicKey.use = "sig";

  return { privateKey, publicKey };
}
