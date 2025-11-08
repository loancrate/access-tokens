import { beforeEach, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";

import { createRequireAdmin } from "../createRequireAdmin";

import { httpErrorMiddleware } from "./httpErrorMiddleware";
import { setupMockLogger } from "./testMocks";

describe("createRequireAdmin", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    // Use 'extended' query parser for Express 5 compatibility
    app.set("query parser", "extended");

    setupMockLogger(app);

    const requireAdmin = createRequireAdmin();

    app.get("/admin-only", requireAdmin, (req, res) => {
      res.status(200).json({
        message: "Admin access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);
  });

  it("should return 401 when req.user is not set", async () => {
    const response = await request(app).get("/admin-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "User not authenticated" },
    });
  });

  it("should return 403 when user is not admin", async () => {
    app = express();

    setupMockLogger(app);

    const requireAdmin = createRequireAdmin();

    app.use((req, _res, next) => {
      req.user = {
        sub: "regular-user",
        owner: "regular-owner",
        admin: false,
      };
      next();
    });

    app.get("/admin-only", requireAdmin, (req, res) => {
      res.status(200).json({
        message: "Admin access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/admin-only");

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: { message: "Admin access required" },
    });
  });

  it("should call next and allow access when user is admin", async () => {
    app = express();

    setupMockLogger(app);

    const requireAdmin = createRequireAdmin();

    app.use((req, _res, next) => {
      req.user = {
        sub: "admin-user",
        owner: "admin-owner",
        admin: true,
      };
      next();
    });

    app.get("/admin-only", requireAdmin, (req, res) => {
      res.status(200).json({
        message: "Admin access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/admin-only");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      message: "Admin access granted",
      user: {
        sub: "admin-user",
        owner: "admin-owner",
        admin: true,
      },
    });
  });

  it("should handle undefined admin property as non-admin", async () => {
    app = express();

    setupMockLogger(app);

    const requireAdmin = createRequireAdmin();

    app.use((req, _res, next) => {
      // Creating a test user object that intentionally omits the 'admin'
      // property to test the middleware's handling of undefined admin status.
      // Using 'as never' to bypass type checking for this specific test case.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      req.user = {
        sub: "user",
        owner: "owner",
      } as never;
      next();
    });

    app.get("/admin-only", requireAdmin, (_req, res) => {
      res.status(200).json({ message: "Should not reach here" });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/admin-only");

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: { message: "Admin access required" },
    });
  });
});
