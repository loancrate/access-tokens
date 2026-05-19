import express from "express";
import request from "supertest";

import { createRequireActiveAdminToken } from "../createRequireActiveAdminToken";

import { httpErrorMiddleware } from "./httpErrorMiddleware";
import { createMockPat, setupMockLogger } from "./testMocks";

describe("createRequireActiveAdminToken", () => {
  let app: express.Application;
  let mockPat: ReturnType<typeof createMockPat>;

  function useActiveAdminTokenRoute(user?: express.Request["user"]): void {
    app = express();
    // Use 'extended' query parser for Express 5 compatibility
    app.set("query parser", "extended");

    setupMockLogger(app);

    if (user) {
      app.use((req, _res, next) => {
        req.user = user;
        next();
      });
    }

    const requireActiveAdminToken = createRequireActiveAdminToken({
      pat: mockPat,
    });

    app.get("/active-admin-token-only", requireActiveAdminToken, (req, res) => {
      res.status(200).json({
        message: "Active admin token access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);
    // Plain errors fall through httpErrorMiddleware; this fallback surfaces
    // them as 500 responses for the rejection propagation test.
    app.use(((err, _req, res, _next) => {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: { message } });
    }) satisfies express.ErrorRequestHandler);
  }

  beforeEach(() => {
    mockPat = createMockPat();
  });

  it("should return 401 when req.user is not set", async () => {
    useActiveAdminTokenRoute();

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "User not authenticated" },
    });
    expect(mockPat.get.mock.calls).toHaveLength(0);
  });

  it("should return 401 when the backing token is missing", async () => {
    mockPat.get.mockResolvedValueOnce(null);
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid Authorization token" },
    });
    expect(mockPat.get.mock.calls).toStrictEqual([["admin-token"]]);
  });

  it("should return 401 when the backing token is revoked", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "admin-owner",
      isAdmin: true,
      createdAt: 1000,
      revokedAt: 2000,
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid Authorization token" },
    });
  });

  it("should return 401 when the backing token is expired", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "admin-owner",
      isAdmin: true,
      createdAt: 1000,
      expiresAt: Math.floor(Date.now() / 1000) - 1,
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid Authorization token" },
    });
  });

  it("should return 401 when the backing token expires at the current second", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "admin-owner",
      isAdmin: true,
      createdAt: 1000,
      expiresAt: Math.floor(Date.now() / 1000),
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "Invalid Authorization token" },
    });
  });

  it("should return 403 when the backing token is no longer admin", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "admin-owner",
      isAdmin: false,
      createdAt: 1000,
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: { message: "Admin access required" },
    });
  });

  it("should pass backing token load errors to error middleware", async () => {
    mockPat.get.mockRejectedValueOnce(new Error("ddb down"));
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "admin-owner",
      admin: true,
      roles: [],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(500);
    expect(response.body).toStrictEqual({
      error: { message: "ddb down" },
    });
    expect(mockPat.get.mock.calls).toStrictEqual([["admin-token"]]);
  });

  it("should refresh req.user from the active backing token", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "current-owner",
      isAdmin: true,
      roles: ["operator"],
      createdAt: 1000,
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "stale-owner",
      admin: true,
      roles: ["stale-role"],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      message: "Active admin token access granted",
      user: {
        sub: "admin-token",
        owner: "current-owner",
        admin: true,
        roles: ["operator"],
      },
    });
    expect(mockPat.get.mock.calls).toStrictEqual([["admin-token"]]);
  });

  it("should refresh missing roles to an empty array", async () => {
    mockPat.get.mockResolvedValueOnce({
      tokenId: "admin-token",
      owner: "current-owner",
      isAdmin: true,
      createdAt: 1000,
    });
    useActiveAdminTokenRoute({
      sub: "admin-token",
      owner: "stale-owner",
      admin: true,
      roles: ["stale-role"],
    });

    const response = await request(app).get("/active-admin-token-only");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      message: "Active admin token access granted",
      user: {
        sub: "admin-token",
        owner: "current-owner",
        admin: true,
        roles: [],
      },
    });
    expect(mockPat.get.mock.calls).toStrictEqual([["admin-token"]]);
  });
});
