import type { TokenRecord } from "@access-tokens/client";

import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { formatDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";

export type ListOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  includeRevoked?: boolean;
  includeExpired?: boolean;
  includeSecretPhc?: boolean;
  hasRole?: string;
  configDir?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
};

export async function listCommand(options: ListOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  logger.verbose(`Fetching tokens from ${endpointConfig.url}...`);

  const tokens = await client.list({
    includeRevoked: options.includeRevoked,
    includeExpired: options.includeExpired,
    includeSecretPhc: options.includeSecretPhc,
    hasRole: options.hasRole,
  });

  if (options.json) {
    logger.json(tokens);
  } else {
    if (tokens.length === 0) {
      logger.info("No tokens found");
    } else {
      logger.info(`Found ${tokens.length} token(s):\n`);
      for (const token of tokens) {
        displayToken(token, logger);
      }
    }
  }
}

function displayToken(token: TokenRecord, logger: Logger): void {
  logger.info(`Token ID: ${token.tokenId}`);
  logger.info(`  Owner: ${token.owner}`);
  logger.info(`  Admin: ${token.isAdmin}`);
  if (token.roles?.length) {
    logger.info(`  Roles: ${token.roles.join(", ")}`);
  }
  logger.info(`  Created: ${formatDate(token.createdAt)}`);
  if (token.lastUsedAt) {
    logger.info(`  Last Used: ${formatDate(token.lastUsedAt)}`);
  }
  if (token.expiresAt) {
    logger.info(`  Expires: ${formatDate(token.expiresAt)}`);
  }
  if (token.revokedAt) {
    logger.info(`  Revoked: ${formatDate(token.revokedAt)}`);
  }
  if (token.secretPhc) {
    logger.info(`  Secret PHC: ${token.secretPhc}`);
  }
  logger.info("");
}
