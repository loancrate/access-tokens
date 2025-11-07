/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/unbound-method */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

import { createAdminTokensRouter } from "../createAdminTokensRouter.js";

import { httpErrorMiddleware } from "./httpErrorMiddleware.js";
import {
  createMockPat,
  createMockSignerVerifier,
  setupMockLogger,
  verifiedAdminJwt,
  verifiedJwt,
} from "./testMocks.js";

describe("createAdminTokensRouter", () => {
  let app: express.Application;
  let mockPat: ReturnType<typeof createMockPat>;
  let mockSignerVerifier: ReturnType<typeof createMockSignerVerifier>;

  beforeEach(() => {
    app = express();
    // Use 'extended' query parser to handle array syntax like limit[]=1
    app.set("query parser", "extended");

    setupMockLogger(app);

    mockPat = createMockPat();
    mockSignerVerifier = createMockSignerVerifier();

    const adminTokenRouter = createAdminTokensRouter({
      pat: mockPat,
      signerVerifier: mockSignerVerifier,
    });

    app.use("/admin", adminTokenRouter);

    app.use(httpErrorMiddleware);

    jest.clearAllMocks();
  });

  describe("GET /admin/tokens", () => {
    it("should return 401 if no JWT token", async () => {
      const response = await request(app).get("/admin/tokens");
      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        error: { message: "Missing or invalid Authorization header" },
      });
    });

    it("should return 403 if user is not admin", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .get("/admin/tokens")
        .set("Authorization", "Bearer valid-jwt");
      expect(response.status).toBe(403);
      expect(response.body).toStrictEqual({
        error: { message: "Admin access required" },
      });
    });

    it("should return tokens for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.list.mockReturnValue(
        (async function* () {
          yield await Promise.resolve({
            tokenId: "token1",
            owner: "user1",
            isAdmin: false,
            createdAt: Date.now(),
          });
        })(),
      );

      const response = await request(app)
        .get("/admin/tokens")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        records: [
          {
            tokenId: "token1",
            owner: "user1",
            isAdmin: false,
          },
        ],
      });
    });

    it("should handle query parameters", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      mockPat.list.mockReturnValue(
        (async function* () {
          // Empty iterator
        })(),
      );

      const response = await request(app)
        .get("/admin/tokens?afterTokenId=token-1&limit=50")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(200);
      expect(mockPat.list).toHaveBeenCalledWith({
        afterTokenId: "token-1",
        limit: 50,
      });
    });

    it("should enforce maximum limit", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      mockPat.list.mockReturnValue(
        (async function* () {
          // Empty iterator
        })(),
      );

      const response = await request(app)
        .get("/admin/tokens?limit=2000")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(200);
      expect(mockPat.list).toHaveBeenCalledWith({
        afterTokenId: undefined,
        limit: 1000,
      });
    });

    it("should return 400 if limit is array", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .get("/admin/tokens?limit[]=1")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: {
          message: "Invalid query parameters",
          details:
            "✖ Invalid input: expected string, received array\n  → at limit",
        },
      });
    });

    it("should return 400 if limit is not a number", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .get("/admin/tokens?limit=invalid")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: {
          message: "Invalid query parameters",
          details: "✖ Limit must be a positive integer\n  → at limit",
        },
      });
    });

    it("should return 400 if invalid afterTokenId", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .get("/admin/tokens?afterTokenId[]=invalid")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(400);
      expect(response.body).toStrictEqual({
        error: {
          message: "Invalid query parameters",
          details:
            "✖ Invalid input: expected string, received array\n  → at afterTokenId",
        },
      });
    });
  });

  describe("POST /admin/tokens", () => {
    it("should return 401 if no JWT token", async () => {
      const response = await request(app)
        .post("/admin/tokens")
        .send({ owner: "test" });
      expect(response.status).toBe(401);
      expect(response.body).toStrictEqual({
        error: { message: "Missing or invalid Authorization header" },
      });
    });

    it("should return 403 if user is not admin", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .post("/admin/tokens")
        .set("Authorization", "Bearer valid-jwt")
        .send({ owner: "new-owner" });
      expect(response.status).toBe(403);
    });

    it("should create token for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.issue.mockResolvedValue({
        token: "new-token",
        record: {
          tokenId: "new-token-id",
          owner: "new-owner",
          isAdmin: false,
          createdAt: Date.now(),
        },
      });

      const response = await request(app)
        .post("/admin/tokens")
        .set("Authorization", "Bearer admin-jwt")
        .send({ owner: "new-owner" });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        token: "new-token",
        record: {
          tokenId: "new-token-id",
          owner: "new-owner",
        },
      });
    });

    it("should handle optional fields", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const mockResponse = {
        token: "admin-token",
        record: {
          tokenId: "custom-token-id",
          owner: "admin-user",
          isAdmin: true,
          createdAt: 1234567890,
        },
      };
      mockPat.issue.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post("/admin/tokens")
        .set("Authorization", "Bearer admin-jwt")
        .send({
          tokenId: "custom-token-id",
          owner: "admin-user",
          isAdmin: true,
        });
      expect(response.status).toBe(201);
      expect(response.body).toStrictEqual(mockResponse);
      expect(mockPat.issue).toHaveBeenCalledWith({
        tokenId: "custom-token-id",
        owner: "admin-user",
        isAdmin: true,
      });
    });

    it("should create token with expiresAt", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const mockResponse = {
        token: "new-token",
        record: {
          tokenId: "new-token-id",
          owner: "new-owner",
          isAdmin: false,
          createdAt: Date.now(),
          expiresAt,
        },
      };
      mockPat.issue.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post("/admin/tokens")
        .set("Authorization", "Bearer admin-jwt")
        .send({ owner: "new-owner", expiresAt });
      expect(response.status).toBe(201);
      expect(response.body).toStrictEqual(mockResponse);
      expect(mockPat.issue).toHaveBeenCalledWith({
        owner: "new-owner",
        expiresAt,
        isAdmin: false,
      });
    });

    it("should return 400 if invalid request body", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .post("/admin/tokens")
        .set("Authorization", "Bearer admin-jwt")
        .send({ invalid: "field" });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toBe("Invalid request body");
    });
  });

  describe("PUT /admin/tokens/:tokenId", () => {
    it("should return 403 if non-admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .put("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer valid-jwt")
        .send({
          secretPhc: "hashed-secret",
          owner: "test-owner",
        });
      expect(response.status).toBe(403);
      expect(response.body).toStrictEqual({
        error: { message: "Admin access required" },
      });
    });

    it("should register token for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const mockRecord = {
        tokenId: "test-token-id",
        secretPhc: "hashed-secret",
        owner: "test-owner",
        isAdmin: false,
        createdAt: 1234567890,
      };
      mockPat.register.mockResolvedValue(mockRecord);

      const response = await request(app)
        .put("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send({
          secretPhc: "hashed-secret",
          owner: "test-owner",
        });
      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({ record: mockRecord });
      expect(mockPat.register).toHaveBeenCalledWith({
        tokenId: "test-token-id",
        secretPhc: "hashed-secret",
        owner: "test-owner",
        isAdmin: false,
      });
    });

    it("should register token with expiresAt", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const expiresAt = Math.floor(Date.now() / 1000) + 7200;
      const mockRecord = {
        tokenId: "expiry-token-id",
        secretPhc: "hashed-secret",
        owner: "expiry-test-owner",
        isAdmin: true,
        createdAt: 1234567890,
        expiresAt,
      };
      mockPat.register.mockResolvedValue(mockRecord);

      const response = await request(app)
        .put("/admin/tokens/expiry-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send({
          secretPhc: "hashed-secret",
          owner: "expiry-test-owner",
          isAdmin: true,
          expiresAt,
        });
      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({ record: mockRecord });
      expect(mockPat.register).toHaveBeenCalledWith({
        tokenId: "expiry-token-id",
        secretPhc: "hashed-secret",
        owner: "expiry-test-owner",
        isAdmin: true,
        expiresAt,
      });
    });

    it("should return 400 if invalid request body", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .put("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send({ owner: "test-owner" });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toBe("Invalid request body");
    });
  });

  describe("PATCH /admin/tokens/:tokenId", () => {
    it("should return 403 if non-admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .patch("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer valid-jwt")
        .send({ owner: "new-owner" });
      expect(response.status).toBe(403);
      expect(response.body).toStrictEqual({
        error: { message: "Admin access required" },
      });
    });

    it("should update token for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.update.mockResolvedValue();

      const updates = {
        owner: "new-owner",
        isAdmin: true,
      };

      const response = await request(app)
        .patch("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send(updates);
      expect(response.status).toBe(204);
      expect(mockPat.update).toHaveBeenCalledWith("test-token-id", updates);
    });

    it("should handle all optional fields", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.update.mockResolvedValue();

      const updates = {
        secretPhc: "new-hashed-secret",
        owner: "new-owner",
        isAdmin: true,
        expiresAt: 1234567890,
      };

      const response = await request(app)
        .patch("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send(updates);
      expect(response.status).toBe(204);
      expect(mockPat.update).toHaveBeenCalledWith("test-token-id", updates);
    });

    it("should return 400 if invalid request body", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .patch("/admin/tokens/test-token-id")
        .set("Authorization", "Bearer admin-jwt")
        .send({ invalidField: "value" });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toBe("Invalid request body");
    });
  });

  describe("PUT /admin/tokens/:tokenId/revoke", () => {
    it("should return 403 if non-admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .put("/admin/tokens/test-token-id/revoke")
        .set("Authorization", "Bearer valid-jwt")
        .send({});
      expect(response.status).toBe(403);
      expect(response.body).toStrictEqual({
        error: { message: "Admin access required" },
      });
    });

    it("should revoke token for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.revoke.mockResolvedValue();

      const response = await request(app)
        .put("/admin/tokens/test-token-id/revoke")
        .set("Authorization", "Bearer admin-jwt")
        .send({});
      expect(response.status).toBe(204);
      expect(mockPat.revoke).toHaveBeenCalledWith("test-token-id", {
        expiresAt: undefined,
      });
    });

    it("should handle optional expiresAt", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.revoke.mockResolvedValue();

      const expiresAt = 1234567890;
      const response = await request(app)
        .put("/admin/tokens/test-token-id/revoke")
        .set("Authorization", "Bearer admin-jwt")
        .send({ expiresAt });
      expect(response.status).toBe(204);
      expect(mockPat.revoke).toHaveBeenCalledWith("test-token-id", {
        expiresAt,
      });
    });

    it("should return 400 if invalid request body", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);

      const response = await request(app)
        .put("/admin/tokens/test-token-id/revoke")
        .set("Authorization", "Bearer admin-jwt")
        .send({ invalidField: "value" });
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error.message).toBe("Invalid request body");
    });
  });

  describe("PUT /admin/tokens/:tokenId/restore", () => {
    it("should return 403 if non-admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedJwt);

      const response = await request(app)
        .put("/admin/tokens/test-token-id/restore")
        .set("Authorization", "Bearer valid-jwt");
      expect(response.status).toBe(403);
      expect(response.body).toStrictEqual({
        error: { message: "Admin access required" },
      });
    });

    it("should restore token for admin user", async () => {
      mockSignerVerifier.verify.mockResolvedValue(verifiedAdminJwt);
      mockPat.restore.mockResolvedValue();

      const response = await request(app)
        .put("/admin/tokens/test-token-id/restore")
        .set("Authorization", "Bearer admin-jwt");
      expect(response.status).toBe(204);
      expect(mockPat.restore).toHaveBeenCalledWith("test-token-id");
    });
  });
});
