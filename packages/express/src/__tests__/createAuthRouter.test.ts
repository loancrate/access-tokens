/* eslint-disable @typescript-eslint/unbound-method */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import { UnsecuredJWT } from "jose";
import request from "supertest";

import { createAuthRouter } from "../createAuthRouter";

import { httpErrorMiddleware } from "./httpErrorMiddleware";
import {
  createMockPat,
  createMockSignerVerifier,
  setupMockLogger,
} from "./testMocks";

describe("createAuthRouter", () => {
  let app: express.Application;
  let mockPat: ReturnType<typeof createMockPat>;
  let mockSignerVerifier: ReturnType<typeof createMockSignerVerifier>;

  beforeEach(() => {
    app = express();
    // Use 'extended' query parser for Express 5 compatibility
    app.set("query parser", "extended");

    setupMockLogger(app);

    mockPat = createMockPat();
    mockSignerVerifier = createMockSignerVerifier();

    const authRouter = createAuthRouter({
      pat: mockPat,
      signerVerifier: mockSignerVerifier,
    });

    app.use("/auth", authRouter);

    app.use(httpErrorMiddleware);

    jest.clearAllMocks();
  });

  describe("POST /auth/token", () => {
    it("should return 400 if no credentials provided", async () => {
      const response = await request(app).post("/auth/token");
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: {
          message:
            "Missing credentials: provide client_secret, Basic auth, or Bearer token",
        },
      });
    });

    it("should return 400 if invalid body", async () => {
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", "Bearer invalid-token")
        .send({ state: 42 });
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: {
          message: "Invalid request body",
          details: expect.any(String),
        },
      });
    });

    it("should return 400 if unsupported grant_type", async () => {
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", "Bearer valid-token")
        .send({ grant_type: "authorization_code" });
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: { message: "Unsupported grant_type" },
      });
    });

    it("should return 401 if invalid Basic auth format", async () => {
      const invalidBase64 = Buffer.from("no-colon-in-credentials").toString(
        "base64",
      );
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", `Basic ${invalidBase64}`)
        .send({ grant_type: "client_credentials" });
      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        error: { message: "Invalid Basic authentication format" },
      });
    });

    it("should return 401 if invalid token", async () => {
      mockPat.verify.mockResolvedValue({ valid: false, reason: "not_found" });
      mockPat.bootstrap.mockResolvedValue({
        valid: false,
        reason: "not_found",
      });

      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", "Bearer invalid-token");
      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        error: { message: "Invalid Authorization token" },
      });
    });

    it("should return 200 with OAuth 2.0 client_secret_post", async () => {
      mockPat.verify.mockResolvedValue({
        valid: true,
        record: {
          tokenId: "test-token-id",
          owner: "test-owner",
          isAdmin: false,
          createdAt: 0,
        },
      });

      const testJwt = new UnsecuredJWT()
        .setIssuedAt()
        .setExpirationTime("1h")
        .encode();
      mockSignerVerifier.sign.mockResolvedValue(testJwt);

      const response = await request(app)
        .post("/auth/token")
        .type("form")
        .send({
          grant_type: "client_credentials",
          client_secret: "valid-token",
          state: "test-state",
        });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("access_token", testJwt);
      expect(response.body).toHaveProperty("token_type", "Bearer");
      expect(response.body).toHaveProperty("expires_in", 3600);
      expect(response.body).toHaveProperty("state", "test-state");
      expect(mockPat.verify).toHaveBeenCalledWith("valid-token");
    });

    it("should return 200 with OAuth 2.0 client_secret_basic", async () => {
      mockPat.verify.mockResolvedValue({
        valid: true,
        record: {
          tokenId: "test-token-id",
          owner: "test-owner",
          isAdmin: false,
          createdAt: 0,
        },
      });

      const testJwt = new UnsecuredJWT()
        .setIssuedAt()
        .setExpirationTime("1h")
        .encode();
      mockSignerVerifier.sign.mockResolvedValue(testJwt);

      const basicAuth = Buffer.from(":valid-token").toString("base64");
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", `Basic ${basicAuth}`)
        .type("form")
        .send({
          grant_type: "client_credentials",
          state: "test-state",
        });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("access_token", testJwt);
      expect(response.body).toHaveProperty("token_type", "Bearer");
      expect(response.body).toHaveProperty("expires_in", 3600);
      expect(response.body).toHaveProperty("state", "test-state");
      expect(mockPat.verify).toHaveBeenCalledWith("valid-token");
    });

    it("should return 200 with Bearer token", async () => {
      mockPat.verify.mockResolvedValue({
        valid: true,
        record: {
          tokenId: "test-token-id",
          owner: "test-owner",
          isAdmin: false,
          createdAt: 0,
        },
      });

      const testJwt = new UnsecuredJWT()
        .setIssuedAt()
        .setExpirationTime("1h")
        .encode();
      mockSignerVerifier.sign.mockResolvedValue(testJwt);

      const state = "test-state";
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", "Bearer valid-token")
        .send({ state });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("access_token", testJwt);
      expect(response.body).toHaveProperty("token_type", "Bearer");
      expect(response.body).toHaveProperty("expires_in", 3600);
      expect(response.body).toHaveProperty("state", state);
    });

    it("should support bootstrapping", async () => {
      mockPat.verify.mockResolvedValue({ valid: false, reason: "not_found" });
      mockPat.bootstrap.mockResolvedValue({
        valid: true,
        record: {
          tokenId: "admin-token-id",
          owner: "admin",
          isAdmin: true,
          createdAt: 0,
        },
      });

      const testJwt = new UnsecuredJWT()
        .setIssuedAt()
        .setExpirationTime("1h")
        .encode();
      mockSignerVerifier.sign.mockResolvedValue(testJwt);

      const state = "test-state";
      const response = await request(app)
        .post("/auth/token")
        .set("Authorization", "Bearer valid-token")
        .send({ state });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("access_token", testJwt);
      expect(response.body).toHaveProperty("token_type", "Bearer");
      expect(response.body).toHaveProperty("expires_in", 3600);
      expect(response.body).toHaveProperty("state", state);
    });
  });
});
