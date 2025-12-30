import { beforeEach, describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";

import { createRequireRole } from "../createRequireRole";

import { httpErrorMiddleware } from "./httpErrorMiddleware";
import { setupMockLogger } from "./testMocks";

describe("createRequireRole", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    // Use 'extended' query parser for Express 5 compatibility
    app.set("query parser", "extended");

    setupMockLogger(app);

    const requireEditor = createRequireRole({ role: "editor" });

    app.get("/editor-only", requireEditor, (req, res) => {
      res.status(200).json({
        message: "Editor access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);
  });

  it("should return 401 when req.user is not set", async () => {
    const response = await request(app).get("/editor-only");

    expect(response.status).toBe(401);
    expect(response.body).toStrictEqual({
      error: { message: "User not authenticated" },
    });
  });

  it("should return 403 when user does not have the required role", async () => {
    app = express();

    setupMockLogger(app);

    const requireEditor = createRequireRole({ role: "editor" });

    app.use((req, _res, next) => {
      req.user = {
        sub: "regular-user",
        owner: "regular-owner",
        admin: false,
        roles: ["reader"],
      };
      next();
    });

    app.get("/editor-only", requireEditor, (req, res) => {
      res.status(200).json({
        message: "Editor access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/editor-only");

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      error: { message: "Access denied" },
    });
  });

  it("should call next and allow access when user has the required role", async () => {
    app = express();

    setupMockLogger(app);

    const requireEditor = createRequireRole({ role: "editor" });

    app.use((req, _res, next) => {
      req.user = {
        sub: "editor-user",
        owner: "editor-owner",
        admin: false,
        roles: ["editor"],
      };
      next();
    });

    app.get("/editor-only", requireEditor, (req, res) => {
      res.status(200).json({
        message: "Editor access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/editor-only");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      message: "Editor access granted",
      user: {
        sub: "editor-user",
        owner: "editor-owner",
        admin: false,
        roles: ["editor"],
      },
    });
  });

  it("should allow access when user has required role among multiple roles", async () => {
    app = express();

    setupMockLogger(app);

    const requireEditor = createRequireRole({ role: "editor" });

    app.use((req, _res, next) => {
      req.user = {
        sub: "multi-role-user",
        owner: "multi-role-owner",
        admin: false,
        roles: ["reader", "editor", "reviewer"],
      };
      next();
    });

    app.get("/editor-only", requireEditor, (req, res) => {
      res.status(200).json({
        message: "Editor access granted",
        user: req.user,
      });
    });

    app.use(httpErrorMiddleware);

    const response = await request(app).get("/editor-only");

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      message: "Editor access granted",
      user: {
        sub: "multi-role-user",
        owner: "multi-role-owner",
        admin: false,
        roles: ["reader", "editor", "reviewer"],
      },
    });
  });
});
