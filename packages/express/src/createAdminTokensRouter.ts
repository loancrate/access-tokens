import express from "express";
import asyncHandler from "express-async-handler";
import createError from "http-errors";
import pino from "pino";
import * as z from "zod";

import {
  DynamoDBPat,
  MAX_ROLE_LENGTH,
  MAX_ROLES_COUNT,
  PublicTokenRecord,
} from "@access-tokens/core";

import { JwtSignerVerifier } from "./buildSignerVerifier";
import { createRequireAdmin } from "./createRequireAdmin";
import { createRequireJwt, ExtendedJwtPayload } from "./createRequireJwt";
import { getLogger } from "./utils/getLogger";

export type AdminTokensRouterConfig = {
  pat: DynamoDBPat;
  signerVerifier: JwtSignerVerifier<ExtendedJwtPayload>;
  logger?: pino.Logger;
};

const defaultListLimit = 100;
const maxListLimit = 1000;

function parseBooleanQuery(val: string | undefined): boolean | undefined {
  switch (val) {
    case "0":
    case "false":
      return false;
    case "1":
    case "true":
      return true;
    default:
      return undefined;
  }
}

const getTokensQuerySchema = z.object({
  afterTokenId: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val != null ? parseInt(val) : undefined))
    .refine((val) => val == null || (Number.isInteger(val) && val > 0), {
      message: "Limit must be a positive integer",
    })
    .transform((val) =>
      val != null ? Math.min(val, maxListLimit) : defaultListLimit,
    ),
  includeRevoked: z.string().optional().transform(parseBooleanQuery),
  includeExpired: z.string().optional().transform(parseBooleanQuery),
  includeSecretPhc: z.string().optional().transform(parseBooleanQuery),
  hasRole: z.string().optional(),
});

const rolesArraySchema = z
  .array(z.string().min(1).max(MAX_ROLE_LENGTH))
  .max(MAX_ROLES_COUNT);

const rolesUpdateSchema = z.union([
  rolesArraySchema,
  z.strictObject({ add: rolesArraySchema }),
  z.strictObject({ remove: rolesArraySchema }),
]);

const adminTokenPostSchema = z.strictObject({
  tokenId: z.string().optional(),
  owner: z.string(),
  isAdmin: z.boolean().optional().default(false),
  roles: rolesArraySchema.optional(),
  expiresAt: z.number().optional(),
});

const adminTokenPutSchema = z.strictObject({
  secretPhc: z.string(),
  owner: z.string(),
  isAdmin: z.boolean().optional().default(false),
  roles: rolesArraySchema.optional(),
  expiresAt: z.number().optional(),
});

const adminTokenPatchSchema = z.strictObject({
  secretPhc: z.string().optional(),
  owner: z.string().optional(),
  isAdmin: z.boolean().optional(),
  roles: rolesUpdateSchema.optional(),
  expiresAt: z.number().optional().nullable(),
});

const adminTokenRevokeSchema = z.strictObject({
  expiresAt: z.number().optional(),
});

const batchGetTokensBodySchema = z.strictObject({
  tokenIds: z.array(z.string()),
  includeSecretPhc: z.boolean().optional().default(false),
});

export function createAdminTokensRouter({
  pat,
  signerVerifier,
  logger: parentLogger,
}: AdminTokensRouterConfig): express.Router {
  const router = express.Router();

  const requireJwt = createRequireJwt({ signerVerifier, logger: parentLogger });
  const requireAdmin = createRequireAdmin({ logger: parentLogger });

  router.get(
    "/tokens",
    requireJwt,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const queryParsed = getTokensQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        const details = z.prettifyError(queryParsed.error);
        throw createError(400, "Invalid query parameters", { details });
      }
      const {
        afterTokenId,
        limit,
        includeRevoked,
        includeExpired,
        includeSecretPhc,
        hasRole,
      } = queryParsed.data;

      const now = Math.floor(Date.now() / 1000);
      const records: PublicTokenRecord[] = [];

      for await (const record of pat.list({
        afterTokenId,
        limit,
        includeSecretPhc,
        hasRole,
      })) {
        const isRevoked = record.revokedAt != null;
        if (isRevoked && !includeRevoked) {
          continue;
        }

        const isExpired = record.expiresAt != null && record.expiresAt < now;
        if (isExpired && !includeExpired) {
          continue;
        }

        records.push(record);
      }

      res.status(200).send({ records });
    }),
  );

  router.post(
    "/tokens/batch",
    requireJwt,
    requireAdmin,
    express.json(),
    asyncHandler(async (req, res) => {
      const body = batchGetTokensBodySchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      const { tokenIds, includeSecretPhc } = body.data;
      const result = await pat.batchLoad(new Set(tokenIds), {
        includeSecretPhc,
      });

      res.status(200).send(result);
    }),
  );

  router.post(
    "/tokens",
    requireJwt,
    requireAdmin,
    express.json(),
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);
      const body = adminTokenPostSchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      const { token, record } = await pat.issue(body.data);

      const { tokenId, owner } = record;
      logger.info({ tokenId, record }, `Issued token ${tokenId} for ${owner}`);

      res.status(201).send({ token, record });
    }),
  );

  router.put(
    "/tokens/:tokenId",
    requireJwt,
    requireAdmin,
    express.json(),
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);
      const { tokenId } = req.params;
      const body = adminTokenPutSchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      const record = await pat.register({ tokenId, ...body.data });

      const { owner } = record;
      logger.info(
        { tokenId, record },
        `Registered token ${tokenId} for ${owner}`,
      );

      res.status(200).send({ record });
    }),
  );

  router.patch(
    "/tokens/:tokenId",
    requireJwt,
    requireAdmin,
    express.json(),
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);
      const { tokenId } = req.params;
      const body = adminTokenPatchSchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      const updates = body.data;
      await pat.update(tokenId, updates);

      logger.info({ tokenId, updates }, `Updated token ${tokenId}`);

      res.sendStatus(204);
    }),
  );

  router.put(
    "/tokens/:tokenId/revoke",
    requireJwt,
    requireAdmin,
    express.json(),
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);
      const { tokenId } = req.params;
      const body = adminTokenRevokeSchema.safeParse(req.body);
      if (!body.success) {
        const details = z.prettifyError(body.error);
        throw createError(400, "Invalid request body", { details });
      }

      const { expiresAt } = body.data;
      await pat.revoke(tokenId, { expiresAt });

      logger.info({ tokenId, expiresAt }, `Revoked token ${tokenId}`);

      res.sendStatus(204);
    }),
  );

  router.put(
    "/tokens/:tokenId/restore",
    requireJwt,
    requireAdmin,
    asyncHandler(async (req, res) => {
      const logger = getLogger(req, parentLogger);
      const { tokenId } = req.params;

      await pat.restore(tokenId);

      logger.info({ tokenId }, `Restored token ${tokenId}`);

      res.sendStatus(204);
    }),
  );

  return router;
}
