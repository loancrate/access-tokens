import express from "express";
import pino from "pino";

let defaultLogger: pino.Logger;

export function getLogger(
  req: Pick<express.Request, "method" | "path" | "clientIp" | "logger">,
  parent?: pino.Logger,
): pino.Logger {
  if (req.logger) {
    return req.logger;
  }

  let parentLogger = parent ?? defaultLogger;
  if (!parentLogger) {
    parentLogger = defaultLogger = pino({
      level: process.env.LOG_LEVEL ?? "info",
    });
  }

  return parentLogger.child({
    method: req.method,
    path: req.path,
    clientIp: req.clientIp,
  });
}
