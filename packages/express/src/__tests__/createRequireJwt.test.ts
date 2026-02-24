/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import express from "express";
import { errors } from "jose";
import request from "supertest";

import { buildSignerVerifier } from "../buildSignerVerifier";
import { createRequireJwt, ExtendedJwtPayload } from "../createRequireJwt";
import { generateKeySet } from "../generateKeySet";

import { httpErrorMiddleware } from "./httpErrorMiddleware";
import { createMockSignerVerifier, setupMockLogger } from "./testMocks";

describe("createRequireJwt", () => {
  let app: express.Application;
  let signerVerifier: ReturnType<typeof createMockSignerVerifier>;

  beforeEach(() => {
    app = express();
    // Use 'extended' query parser for Express 5 compatibility
    app.set("query parser", "extended");

    setupMockLogger(app);

    signerVerifier = createMockSignerVerifier();

    const requireJwt = createRequireJwt({ signerVerifier });

    app.get("/protected", requireJwt, (req, res) => {
      res.status(200).json({
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    vi.clearAllMocks();
  });

  it("should return 401 when no Authorization header", async () => {
    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Missing or invalid Authorization header" },
    });
  });

  it("should return 401 when Authorization header is empty", async () => {
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Missing or invalid Authorization header" },
    });
  });

  it("should return 401 when Authorization header missing Bearer", async () => {
    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Basic abc123");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Missing or invalid Authorization header" },
    });
  });

  it("should return 401 with code when JWT verification fails with JOSEError", async () => {
    const joseError = new errors.JWSInvalid("Invalid signature");
    signerVerifier.verify.mockRejectedValue(joseError);

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid JWT", code: "ERR_JWS_INVALID" },
    });
  });

  it("should return 401 without code when JWT verification fails with non-JOSEError", async () => {
    const genericError = new Error("Unknown error");
    signerVerifier.verify.mockRejectedValue(genericError);

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid JWT" },
    });
  });

  it("should set req.user and call next for valid JWT", async () => {
    const verifiedJwt = {
      payload: { sub: "test-user", owner: "test-owner", admin: false },
      protectedHeader: { alg: "EdDSA", typ: "JWT" },
    };
    signerVerifier.verify.mockResolvedValue(verifiedJwt);

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer valid-token");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      user: {
        sub: "test-user",
        owner: "test-owner",
        admin: false,
        roles: [],
      },
    });
    expect(signerVerifier.verify).toHaveBeenCalledWith("valid-token");
  });

  it("should handle admin user", async () => {
    const verifiedAdminJwt = {
      payload: { sub: "admin-user", owner: "admin-owner", admin: true },
      protectedHeader: { alg: "EdDSA", typ: "JWT" },
    };
    signerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      user: {
        sub: "admin-user",
        owner: "admin-owner",
        admin: true,
        roles: [],
      },
    });
  });

  it("should handle JWTExpired error with code", async () => {
    const expiredError = new errors.JWTExpired("Token expired", {});
    signerVerifier.verify.mockRejectedValue(expiredError);

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer expired-token");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid JWT", code: "ERR_JWT_EXPIRED" },
    });
  });

  it("should integrate with real JWT signing and verification", async () => {
    const keySet = await generateKeySet("EdDSA");
    const signerVerifier = await buildSignerVerifier<ExtendedJwtPayload>({
      keySet,
      issuer: "test-issuer",
      ttl: "1h",
    });

    const realApp = express();

    setupMockLogger(realApp);

    const requireJwt = createRequireJwt({ signerVerifier });

    realApp.get("/protected", requireJwt, (req, res) => {
      res.status(200).json({ user: req.user });
    });

    realApp.use(httpErrorMiddleware);

    const jwt = await signerVerifier.sign({
      sub: "real-user",
      owner: "real-owner",
      admin: false,
    });

    const response = await request(realApp)
      .get("/protected")
      .set("Authorization", `Bearer ${jwt}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      sub: "real-user",
      owner: "real-owner",
      admin: false,
    });
  });
});
