import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { parseDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";

export type UpdateOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  tokenId: string;
  owner?: string;
  admin?: boolean;
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
    secretPhc?: string;
    expiresAt?: number | null;
  } = {};

  if (options.owner !== undefined) {
    updates.owner = options.owner;
  }
  if (options.admin !== undefined) {
    updates.isAdmin = options.admin;
  }
  if (options.secretPhc !== undefined) {
    updates.secretPhc = options.secretPhc;
  }
  if (options.expiresAt !== undefined) {
    updates.expiresAt = parseDate(options.expiresAt);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error(
      "No updates specified. Use --owner, --admin, --secret-phc, or --expires-at",
    );
  }

  logger.verbose(`Updating token ${options.tokenId}...`);

  await client.update(options.tokenId, updates);

  logger.success(`Token ${options.tokenId} updated successfully`);
}
