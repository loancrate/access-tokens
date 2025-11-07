import { id62 } from "id62";
import {
  createLocalJWKSet,
  importJWK,
  JWK,
  JWTPayload,
  jwtVerify,
  JWTVerifyResult,
  SignJWT,
} from "jose";

export type KeySet = {
  active_kid: string;
  private_keys: JWK[];
  public_keys: JWK[];
};

export type JwtConfig = {
  keySet: KeySet;
  issuer: string;
  ttl: string;
};

export interface JwtSignerVerifier<
  PayloadType extends JWTPayload = JWTPayload,
> {
  sign: (claims: PayloadType) => Promise<string>;
  verify: (jws: string) => Promise<JWTVerifyResult<PayloadType>>;
  jwks: { keys: readonly JWK[] };
}

export async function buildSignerVerifier<
  PayloadType extends JWTPayload = JWTPayload,
>({ keySet, issuer, ttl }: JwtConfig): Promise<JwtSignerVerifier<PayloadType>> {
  const privateKeyByKid = new Map(keySet.private_keys.map((k) => [k.kid, k]));
  const active = privateKeyByKid.get(keySet.active_kid);
  if (!active) {
    throw new Error(`No private key found for active_kid ${keySet.active_kid}`);
  }
  if (!active.alg) {
    throw new Error("Active key is missing 'alg' property");
  }
  const { alg } = active;

  const privateKey = await importJWK(active);
  const jwks = { keys: keySet.public_keys };
  const verifier = createLocalJWKSet(jwks);

  async function sign(claims: PayloadType): Promise<string> {
    const jwt = new SignJWT(claims)
      .setProtectedHeader({ alg, kid: keySet.active_kid, typ: "JWT" })
      .setIssuer(issuer)
      .setIssuedAt()
      .setExpirationTime(ttl)
      .setJti(id62())
      .sign(privateKey);
    return jwt;
  }

  async function verify(jwt: string): Promise<JWTVerifyResult<PayloadType>> {
    return jwtVerify(jwt, verifier, { issuer });
  }

  return { sign, verify, jwks };
}
