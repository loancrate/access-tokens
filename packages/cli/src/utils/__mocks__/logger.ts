import { jest } from "@jest/globals";

export const Logger: jest.Mock = jest.fn(() => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  success: jest.fn(),
  verbose: jest.fn(),
  json: jest.fn(),
  dryRun: jest.fn(),
}));
