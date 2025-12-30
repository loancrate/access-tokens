import { jest } from "@jest/globals";
import express from "express";
import { JWTVerifyResult } from "jose";
import { Logger } from "pino";

import { DynamoDBPat } from "@access-tokens/core";

import { buildSignerVerifier } from "../buildSignerVerifier";
import { ExtendedJwtPayload } from "../createRequireJwt";

export const verifiedJwt: JWTVerifyResult<ExtendedJwtPayload> = {
  payload: { sub: "test", owner: "test", admin: false },
  protectedHeader: { alg: "RS256", typ: "JWT" },
};

export const verifiedAdminJwt: JWTVerifyResult<ExtendedJwtPayload> = {
  payload: { sub: "admin", owner: "admin", admin: true },
  protectedHeader: { alg: "RS256", typ: "JWT" },
};

export function createMockPat(): jest.Mocked<DynamoDBPat> {
  // Creating a partial mock of DynamoDBPat class. The object literal only
  // includes method mocks, not all class properties and private members.
  // Double cast through 'unknown' is necessary because jest.Mocked wraps
  // the class type incompletely.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    list: jest.fn(),
    batchLoad: jest.fn(),
    generate: jest.fn(),
    register: jest.fn(),
    issue: jest.fn(),
    verify: jest.fn(),
    revoke: jest.fn(),
    restore: jest.fn(),
    update: jest.fn(),
    bootstrap: jest.fn(),
  } as unknown as jest.Mocked<DynamoDBPat>;
}

export function createMockSignerVerifier(): jest.Mocked<
  Awaited<ReturnType<typeof buildSignerVerifier<ExtendedJwtPayload>>>
> {
  return {
    sign: jest.fn(),
    verify: jest.fn(),
    jwks: { keys: [] },
  };
}

export function createMockLogger(): jest.Mocked<
  Pick<Logger, "trace" | "debug" | "info" | "warn" | "error" | "fatal">
> {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  };
}

export function setupMockLogger(
  app: express.Application,
): ReturnType<typeof createMockLogger> {
  const mockLogger = createMockLogger();
  app.use((req, _res, next) => {
    // Express Request augmentation requires assignment to a custom property.
    // Using 'as never' because the logger property is added via declaration
    // merging and TypeScript cannot verify the exact type at runtime.
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    req.logger = mockLogger as never;
    next();
  });
  return mockLogger;
}
