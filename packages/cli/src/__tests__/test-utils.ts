import { Readable, Writable } from "stream";

import { type Mocked, vi } from "vitest";

import type { AccessTokensClient } from "@access-tokens/client";

export function createMockClient(): Mocked<AccessTokensClient> {
  // Creating a partial mock of AccessTokensClient interface. The object
  // literal only includes method mocks, not all client properties. Double
  // cast through 'unknown' is necessary because jest.Mocked wraps the type
  // incompletely.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    list: vi.fn(),
    batchLoad: vi.fn(),
    issue: vi.fn(),
    register: vi.fn(),
    update: vi.fn(),
    revoke: vi.fn(),
    restore: vi.fn(),
  } as unknown as Mocked<AccessTokensClient>;
}

export function createTestStreams(): {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  getStdout: () => string;
  getStderr: () => string;
} {
  const stdin = new Readable({
    read() {
      this.push(null);
    },
  });

  const outChunks: Buffer[] = [];
  const stdout = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      outChunks.push(chunk);
      callback();
    },
  });

  const errChunks: Buffer[] = [];
  const stderr = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      errChunks.push(chunk);
      callback();
    },
  });

  return {
    stdin,
    stdout,
    stderr,
    getStdout: () => Buffer.concat(outChunks).toString("utf-8"),
    getStderr: () => Buffer.concat(errChunks).toString("utf-8"),
  };
}

export const mockConfig = {
  url: "https://test-api.example.com",
  adminToken: "test-admin-token",
  authPath: "/auth",
  adminPath: "/admin",
};

export const mockTokenRecord = {
  tokenId: "test123456789012345",
  owner: "test@example.com",
  isAdmin: false,
  createdAt: 1704067200,
};
