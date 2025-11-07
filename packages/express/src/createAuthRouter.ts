import assert from "assert";

import express from "express";
import asyncHandler from "express-async-handler";
import createError from "http-errors";
import { decodeJwt } from "jose";
import pino from "pino";
import * as z from "zod";

import { DynamoDBPat, ValidTokenRecord } from "@access-tokens/core";

import { JwtSignerVerifier } from "./buildSignerVerifier";
import { ExtendedJwtPayload } from "./createRequireJwt";
import { getLogger } from "./utils/getLogger";

export type AuthRouterConfig = {
  pat: DynamoDBPat;
  signerVerifier: JwtSignerVerifier<ExtendedJwtPayload>;
  logger?: pino.Logger;
};

type AccessTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  state?: string;
};

const authTokenBodySchema = z
  .object({
    grant_type: z.string().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    state: z.string().optional(),
  })
  .default({});

export function createAuthRouter({
  pat,
  signerVerifier,
  logger: parentLogger,
}: AuthRouterConfig): express.Router {
  const router = express.Router();

  router.post(
    "/token",
    express.urlencoded({ extended: true }),
    express.json(),
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);

      const body = authTokenBodySchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      if (
        body.data.grant_type &&
        body.data.grant_type !== "client_credentials"
      ) {
        throw createError(400, "Unsupported grant_type");
      }

      let token: string;
      const auth = req.get("authorization");
      if (body.data.client_secret) {
        token = body.data.client_secret;
      } else if (auth?.startsWith("Basic ")) {
        const credentials = auth.substring("Basic ".length).trim();
        const decoded = Buffer.from(credentials, "base64").toString("utf-8");
        const colonIndex = decoded.indexOf(":");
        if (colonIndex === -1) {
          throw createError(401, "Invalid Basic authentication format");
        }
        token = decoded.substring(colonIndex + 1);
      } else if (auth?.startsWith("Bearer ")) {
        token = auth.substring("Bearer ".length).trim();
      } else {
        throw createError(
          400,
          "Missing credentials: provide client_secret, Basic auth, or Bearer token",
        );
      }

      const verifyResult = await pat.verify(token);
      let record: ValidTokenRecord;
      if (verifyResult.valid) {
        ({ record } = verifyResult);
        const { tokenId, owner } = record;
        logger.info({ record }, `Authenticated token ${tokenId} for ${owner}`);
      } else {
        const bootstrapResult = await pat.bootstrap(token, { owner: "admin" });
        if (bootstrapResult.valid) {
          ({ record } = bootstrapResult);
          const { tokenId, owner } = record;
          logger.info({ record }, `Bootstrapped token ${tokenId} for ${owner}`);
        } else {
          const { reason, record } = verifyResult;
          logger.info({ reason, record }, "Invalid Authorization token");
          throw createError(401, "Invalid Authorization token");
        }
      }

      const access_token = await signerVerifier.sign({
        sub: record.tokenId,
        owner: record.owner,
        admin: record.isAdmin,
      });

      const { exp, iat } = decodeJwt(access_token);
      assert(exp != null && iat != null);
      const expires_in = exp - iat;

      const response: AccessTokenResponse = {
        access_token,
        token_type: "Bearer",
        expires_in,
        state: body.data.state,
      };
      res.status(200).send(response);
    }),
  );

  return router;
}
