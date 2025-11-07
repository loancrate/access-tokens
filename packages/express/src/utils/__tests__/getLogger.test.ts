import { jest } from "@jest/globals";
import pino from "pino";

import { getLogger } from "../getLogger";

describe("getLogger", () => {
  const originalEnv = process.env;

  let mockRequest: {
    method: string;
    path: string;
    clientIp?: string;
    logger?: pino.Logger;
  };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.LOG_LEVEL;

    mockRequest = {
      method: "GET",
      path: "/test",
      clientIp: "127.0.0.1",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return req.logger if it exists", () => {
    const existingLogger = pino();
    mockRequest.logger = existingLogger;

    const logger = getLogger(mockRequest);

    expect(logger).toBe(existingLogger);
  });

  it("should create child logger with request metadata", () => {
    const parentLogger = pino();
    const childSpy = jest.spyOn(parentLogger, "child");

    getLogger(mockRequest, parentLogger);

    expect(childSpy).toHaveBeenCalledWith({
      method: "GET",
      path: "/test",
      clientIp: "127.0.0.1",
    });

    childSpy.mockRestore();
  });

  it("should use provided parent logger over default", () => {
    const explicitParent = pino({ level: "trace" });
    const childSpy = jest.spyOn(explicitParent, "child");

    getLogger(mockRequest, explicitParent);

    expect(childSpy).toHaveBeenCalled();
    childSpy.mockRestore();
  });

  it("should inherit level from provided parent logger", () => {
    const parentWithDebug = pino({ level: "debug" });

    const logger = getLogger(mockRequest, parentWithDebug);

    expect(logger).toBeDefined();
    // The child logger inherits the parent's level
    expect(logger.level).toBe("debug");
  });

  it("should create default logger with 'info' level when LOG_LEVEL is not set", () => {
    delete process.env.LOG_LEVEL;

    const logger = getLogger(mockRequest);

    expect(logger).toBeDefined();
    expect(logger.level).toBe("info");
  });
});
