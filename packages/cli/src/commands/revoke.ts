import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { parseDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";

export type RevokeOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  tokenId: string;
  expiresAt?: string;
  configDir?: string;
  verbose?: boolean;
  quiet?: boolean;
};

export async function revokeCommand(options: RevokeOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  const expiresAt = options.expiresAt
    ? parseDate(options.expiresAt)
    : undefined;

  logger.verbose(`Revoking token ${options.tokenId}...`);

  await client.revoke(options.tokenId, { expiresAt: expiresAt || undefined });

  logger.success(`Token ${options.tokenId} revoked successfully`);
}
