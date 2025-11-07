import express from "express";
import pino from "pino";

import { getLogger } from "./utils/getLogger";
import { sendError } from "./utils/sendError";

export type CreateRequireAdminConfig = {
  logger?: pino.Logger;
};

export function createRequireAdmin({
  logger: parentLogger,
}: CreateRequireAdminConfig = {}): express.RequestHandler {
  return function requireAdmin(req, res, next) {
    try {
      const logger = getLogger(req, parentLogger);
      if (!req.user) {
        sendError(res, 401, "User not authenticated");
        return;
      }
      if (!req.user.admin) {
        const { method, path } = req;
        const { sub, owner } = req.user;
        logger.info(
          { sub, owner, method, path },
          `Access denied to non-admin user ${owner}`,
        );
        sendError(res, 403, "Admin access required");
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
