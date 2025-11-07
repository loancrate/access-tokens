import { DynamoDBPat } from "@access-tokens/core";

import { Logger } from "../utils/logger";

export type GenerateOptions = {
  tokenPrefix?: string;
  tokenId?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
};

export async function generateCommand(options: GenerateOptions): Promise<void> {
  const logger = new Logger(options);

  // Create a DynamoDBPat instance with minimal configuration
  // Table name is not used by generate()
  const pat = new DynamoDBPat({
    tableName: "unused-table-name",
    tokenPrefix: options.tokenPrefix,
  });

  logger.verbose("Generating new token...");

  // Generate a new token
  const { token, tokenId, secretPhc } = await pat.generate({
    tokenId: options.tokenId,
  });

  if (options.json) {
    logger.json({ token, tokenId, secretPhc });
  } else {
    logger.success(
      "Here is your new personal access token. Don't share it with anyone!",
    );
    logger.info("");
    logger.info(token);
    logger.info("");
    logger.info(
      "Provide the following information to your administrator to register the token:",
    );
    logger.info("");
    logger.info(`Token ID: ${tokenId}`);
    logger.info(`Secret hash: ${secretPhc}`);
  }
}
