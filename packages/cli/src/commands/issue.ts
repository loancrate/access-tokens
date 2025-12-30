import { ConfigLoader } from "../config/loader";
import { createClient } from "../utils/client-factory";
import { parseDate } from "../utils/date-parser";
import { Logger } from "../utils/logger";
import { splitAndTrim } from "../utils/splitAndTrim";

export type IssueOptions = {
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  owner: string;
  admin?: boolean;
  roles?: string;
  expiresAt?: string;
  configDir?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
};

export async function issueCommand(options: IssueOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const endpointConfig = await loader.resolveEndpointFromOptions(options);

  const client = createClient(endpointConfig);

  const expiresAt = options.expiresAt
    ? parseDate(options.expiresAt)
    : undefined;

  const roles = options.roles ? splitAndTrim(options.roles) : undefined;

  logger.verbose(`Issuing token for ${options.owner}...`);

  const result = await client.issue({
    owner: options.owner,
    isAdmin: options.admin,
    roles,
    expiresAt: expiresAt || undefined,
  });

  if (options.json) {
    logger.json(result);
  } else {
    logger.success("Token issued successfully!");
    logger.info("");
    logger.info("TOKEN (save this securely, it won't be shown again):");
    logger.info(result.token);
    logger.info("");
    logger.info(`Token ID: ${result.record.tokenId}`);
    logger.info(`Owner: ${result.record.owner}`);
    logger.info(`Admin: ${result.record.isAdmin}`);
  }
}
