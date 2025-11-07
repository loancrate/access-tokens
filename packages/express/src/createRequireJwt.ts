import { asError } from "catch-unknown";
import express from "express";
import { errors, JWTPayload } from "jose";
import pino from "pino";

import { JwtSignerVerifier } from "./buildSignerVerifier";
import { getLogger } from "./utils/getLogger";
import { sendError } from "./utils/sendError";

export interface ExtendedJwtPayload extends JWTPayload {
  sub: string;
  owner: string;
  admin: boolean;
}

export type CreateRequireJwtConfig = {
  signerVerifier: JwtSignerVerifier<ExtendedJwtPayload>;
  logger?: pino.Logger;
};

export function createRequireJwt({
  signerVerifier,
  logger: parentLogger,
}: CreateRequireJwtConfig): express.RequestHandler {
  return async function requireJwt(req, res, next) {
    try {
      const logger = getLogger(req, parentLogger);
      const auth = req.get("authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        sendError(res, 401, "Missing or invalid Authorization header");
        return;
      }

      const token = auth.substring("Bearer ".length).trim();
      let verifyResult;
      try {
        verifyResult = await signerVerifier.verify(token);
      } catch (err) {
        if (err instanceof errors.JOSEError) {
          const { code, message } = err;
          logger.info({ code, message }, "Invalid JWT");
          sendError(res, 401, "Invalid JWT", { code });
        } else {
          const { name, message } = asError(err);
          logger.info({ name, message }, "Invalid JWT");
          sendError(res, 401, "Invalid JWT");
        }
        return;
      }

      const { payload } = verifyResult;
      const { sub, owner, admin } = payload;
      req.user = { sub, owner, admin };

      next();
    } catch (err) {
      next(err);
    }
  };
}
