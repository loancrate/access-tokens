import express from "express";
import { JWTVerifyResult } from "jose";
import { Logger } from "pino";
import type { Mocked } from "vitest";

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

export function createMockPat(): Mocked<DynamoDBPat> {
  // Creating a partial mock of DynamoDBPat class. The object literal only
  // includes method mocks, not all class properties and private members.
  // Double cast through 'unknown' is necessary because Mocked wraps
  // the class type incompletely.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    list: vi.fn(),
    batchLoad: vi.fn(),
    generate: vi.fn(),
    register: vi.fn(),
    issue: vi.fn(),
    verify: vi.fn(),
    revoke: vi.fn(),
    restore: vi.fn(),
    update: vi.fn(),
    bootstrap: vi.fn(),
  } as unknown as Mocked<DynamoDBPat>;
}

export function createMockSignerVerifier(): Mocked<
  Awaited<ReturnType<typeof buildSignerVerifier<ExtendedJwtPayload>>>
> {
  return {
    sign: vi.fn(),
    verify: vi.fn(),
    jwks: { keys: [] },
  };
}

export function createMockLogger(): Mocked<
  Pick<Logger, "trace" | "debug" | "info" | "warn" | "error" | "fatal">
> {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
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
