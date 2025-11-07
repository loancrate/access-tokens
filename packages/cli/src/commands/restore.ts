import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { Logger } from "../utils/logger";

export type RestoreOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  tokenId: string;
  configDir?: string;
  verbose?: boolean;
  quiet?: boolean;
};

export async function restoreCommand(options: RestoreOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  logger.verbose(`Restoring token ${options.tokenId}...`);

  await client.restore(options.tokenId);

  logger.success(`Token ${options.tokenId} restored successfully`);
}
