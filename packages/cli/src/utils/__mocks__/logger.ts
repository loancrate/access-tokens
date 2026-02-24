import { type Mock, vi } from "vitest";

export const Logger: Mock = vi.fn(function () {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    verbose: vi.fn(),
    json: vi.fn(),
    dryRun: vi.fn(),
  };
});
