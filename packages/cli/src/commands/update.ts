import type { RolesUpdate } from "@access-tokens/client";

import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { parseDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";
import { splitAndTrim } from "../utils/splitAndTrim";

export type UpdateOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  tokenId: string;
  owner?: string;
  admin?: boolean;
  roles?: string;
  addRoles?: string;
  removeRoles?: string;
  secretPhc?: string;
  expiresAt?: string;
  configDir?: string;
  verbose?: boolean;
  quiet?: boolean;
};

export async function updateCommand(options: UpdateOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  const updates: {
    owner?: string;
    isAdmin?: boolean;
    roles?: RolesUpdate;
    secretPhc?: string;
    expiresAt?: number | null;
  } = {};

  if (options.owner !== undefined) {
    updates.owner = options.owner;
  }

  if (options.admin !== undefined) {
    updates.isAdmin = options.admin;
  }

  // Track role operations separately since add and remove cannot be combined
  let addRoles: string[] | undefined;
  let removeRoles: string[] | undefined;

  if (options.roles !== undefined) {
    // Full replacement
    updates.roles = splitAndTrim(options.roles);
  } else {
    if (options.addRoles !== undefined) {
      addRoles = splitAndTrim(options.addRoles);
      updates.roles = { add: addRoles };
    }
    if (options.removeRoles !== undefined) {
      removeRoles = splitAndTrim(options.removeRoles);
      // If we already have an add operation, we'll do remove separately after
      if (!addRoles) {
        updates.roles = { remove: removeRoles };
      }
    }
  }

  if (options.secretPhc !== undefined) {
    updates.secretPhc = options.secretPhc;
  }

  if (options.expiresAt !== undefined) {
    updates.expiresAt = parseDate(options.expiresAt);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error(
      "No updates specified. Use --owner, --admin, --roles, --add-roles, --remove-roles, --secret-phc, or --expires-at",
    );
  }

  logger.verbose(`Updating token ${options.tokenId}...`);

  await client.update(options.tokenId, updates);

  // If both add and remove were specified, do remove as a second operation
  if (addRoles && removeRoles) {
    logger.verbose(`Removing roles from token ${options.tokenId}...`);
    await client.update(options.tokenId, { roles: { remove: removeRoles } });
  }

  logger.success(`Token ${options.tokenId} updated successfully`);
}
