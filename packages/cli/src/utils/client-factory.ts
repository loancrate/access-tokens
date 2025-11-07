import { AccessTokensClient } from "@access-tokens/client";

import { MergedEndpointConfig } from "../config/schemas";

export function createClient(config: MergedEndpointConfig): AccessTokensClient {
  return new AccessTokensClient({
    endpoint: config.url,
    apiKey: config.adminToken,
    authPath: config.authPath,
    adminPath: config.adminPath,
  });
}
