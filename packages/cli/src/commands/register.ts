import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { parseDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";

export type RegisterOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  tokenId: string;
  secretPhc: string;
  owner: string;
  admin?: boolean;
  expiresAt?: string;
  configDir?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
};

export async function registerCommand(options: RegisterOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  const expiresAt = options.expiresAt
    ? parseDate(options.expiresAt)
    : undefined;

  logger.verbose(`Registering token ${options.tokenId}...`);

  const record = await client.register({
    tokenId: options.tokenId,
    secretPhc: options.secretPhc,
    owner: options.owner,
    isAdmin: options.admin,
    expiresAt: expiresAt || undefined,
  });

  if (options.json) {
    logger.json(record);
  } else {
    logger.success(`Token ${options.tokenId} registered successfully!`);
    logger.info(`Owner: ${record.owner}`);
    logger.info(`Admin: ${record.isAdmin}`);
  }
}
