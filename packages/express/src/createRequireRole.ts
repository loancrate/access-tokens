import express from "express";
import pino from "pino";

import { getLogger } from "./utils/getLogger";
import { sendError } from "./utils/sendError";

export type CreateRequireRoleConfig = {
  role: string;
  logger?: pino.Logger;
};

export function createRequireRole({
  role,
  logger: parentLogger,
}: CreateRequireRoleConfig): express.RequestHandler {
  return function requireRole(req, res, next) {
    try {
      const logger = getLogger(req, parentLogger);
      if (!req.user) {
        sendError(res, 401, "User not authenticated");
        return;
      }
      if (!req.user.roles.includes(role)) {
        const { method, path } = req;
        const { sub, owner } = req.user;
        logger.info(
          { sub, owner, method, path },
          `Access denied to user ${owner} without role ${role}`,
        );
        sendError(res, 403, "Access denied");
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
