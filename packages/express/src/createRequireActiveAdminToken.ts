import express from "express";
import pino from "pino";

import { DynamoDBPat } from "@access-tokens/core";

import { getLogger } from "./utils/getLogger";
import { sendError } from "./utils/sendError";

export type CreateRequireActiveAdminTokenConfig = {
  pat: DynamoDBPat;
  logger?: pino.Logger;
};

export function createRequireActiveAdminToken({
  pat,
  logger: parentLogger,
}: CreateRequireActiveAdminTokenConfig): express.RequestHandler {
  return async function requireActiveAdminToken(req, res, next) {
    try {
      const logger = getLogger(req, parentLogger);
      if (!req.user) {
        sendError(res, 401, "User not authenticated");
        return;
      }

      const record = await pat.get(req.user.sub);
      if (!record || record.revokedAt != null) {
        const { method, path } = req;
        const { sub, owner } = req.user;
        logger.info(
          { sub, owner, method, path },
          "Admin token is no longer active",
        );
        sendError(res, 401, "Invalid Authorization token");
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (record.expiresAt != null && record.expiresAt <= now) {
        const { method, path } = req;
        const { sub, owner } = req.user;
        logger.info({ sub, owner, method, path }, "Admin token has expired");
        sendError(res, 401, "Invalid Authorization token");
        return;
      }

      if (!record.isAdmin) {
        const { method, path } = req;
        const { tokenId, owner } = record;
        logger.info(
          { sub: tokenId, owner, method, path },
          `Access denied to non-admin user ${owner}`,
        );
        sendError(res, 403, "Admin access required");
        return;
      }

      req.user = {
        sub: record.tokenId,
        owner: record.owner,
        admin: record.isAdmin,
        roles: record.roles ?? [],
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
