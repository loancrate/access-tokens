import assert from "assert";

import { ConfigLoader } from "../config/loader";
import type {
  Config,
  MergedEndpointConfig,
  TokenDefinition,
} from "../config/schemas";
import { createClient } from "../utils/client-factory";
import { formatDate } from "../utils/date-parser";
import { compareTokens } from "../utils/diff";
import { addDurationToNow } from "../utils/duration-parser";
import { Logger } from "../utils/logger";
import { checkFilePermissions } from "../utils/permissions";

export type SyncOptions = {
  config: string;
  endpoint?: string;
  url?: string;
  adminToken?: string;
  authPath?: string;
  adminPath?: string;
  dryRun?: boolean;
  orphanExpiresIn?: string;
  configDir?: string;
  verbose?: boolean;
  quiet?: boolean;
};

export async function syncCommand(options: SyncOptions): Promise<void> {
  const logger = new Logger(options);
  const loader = new ConfigLoader(options.configDir);

  const userConfig = await loader.loadUserConfig();
  const syncConfig = await loader.loadSyncConfig(options.config);

  await checkFilePermissions(
    options.config,
    !!syncConfig.defaults?.adminToken ||
      Object.values(syncConfig.endpoints || {}).some((e) => !!e.adminToken),
  );

  if (!syncConfig.tokens || syncConfig.tokens.length === 0) {
    logger.warn("No tokens defined in sync config");
    return;
  }

  const targetEndpoints = resolveTargetEndpoints({
    options,
    userConfig,
    syncConfig,
    loader,
    logger,
  });

  logger.info(
    `Syncing ${syncConfig.tokens.length} token(s) to ${targetEndpoints.length} endpoint(s)...`,
  );
  logger.info("");

  for (const { name, config: endpointConfig } of targetEndpoints) {
    logger.info(`=== Endpoint: ${name || endpointConfig.url} ===`);

    await syncToEndpoint({
      endpointConfig,
      tokens: syncConfig.tokens,
      dryRun: options.dryRun || false,
      orphanExpiresIn: options.orphanExpiresIn || "P30D",
      logger,
    });

    logger.info("");
  }

  if (options.dryRun) {
    logger.info("Dry run completed - no changes were made");
  } else {
    logger.success("Sync completed successfully!");
  }
}

function resolveTargetEndpoints({
  options,
  userConfig,
  syncConfig,
  loader,
  logger,
}: {
  options: SyncOptions;
  userConfig: Config | null;
  syncConfig: Config;
  loader: ConfigLoader;
  logger: Logger;
}) {
  const targetEndpoints: Array<{
    name: string | null;
    config: MergedEndpointConfig;
  }> = [];

  if (options.url) {
    const optionsWithUrl = { ...options, url: options.url };
    const config = loader.resolveDirectEndpointConfig(
      optionsWithUrl,
      userConfig?.defaults,
    );
    targetEndpoints.push({ name: null, config });
  } else if (options.endpoint) {
    const endpointNames = options.endpoint.split(",").map((e) => e.trim());
    const mergedConfig = loader.mergeConfigs(userConfig, syncConfig);

    for (const name of endpointNames) {
      const config = loader.resolveEndpointConfig(name, mergedConfig);
      targetEndpoints.push({ name, config });
    }
  } else {
    if (
      !syncConfig.endpoints ||
      Object.keys(syncConfig.endpoints).length === 0
    ) {
      throw new Error(
        "No endpoints specified. Either provide --endpoint, --url, or define endpoints in sync config",
      );
    }

    const mergedConfig = loader.mergeConfigs(userConfig, syncConfig);

    for (const name of Object.keys(syncConfig.endpoints)) {
      try {
        const config = loader.resolveEndpointConfig(name, mergedConfig);
        targetEndpoints.push({ name, config });
      } catch (error) {
        logger.warn(
          `Skipping endpoint '${name}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (targetEndpoints.length === 0) {
    throw new Error("No valid endpoints found to sync to");
  }

  return targetEndpoints;
}

async function syncToEndpoint({
  endpointConfig,
  tokens,
  dryRun,
  orphanExpiresIn,
  logger,
}: {
  endpointConfig: MergedEndpointConfig;
  tokens: TokenDefinition[];
  dryRun: boolean;
  orphanExpiresIn: string;
  logger: Logger;
}): Promise<void> {
  const client = createClient(endpointConfig);

  logger.verbose(`Fetching remote tokens...`);

  const allRemoteTokens = await client.list({
    includeSecretPhc: true,
  });

  const remoteTokens = new Map(allRemoteTokens.map((t) => [t.tokenId, t]));

  const now = Math.floor(Date.now() / 1000);
  for (const definition of tokens) {
    const { tokenId, owner, expiresAt } = definition;
    const isExpired = expiresAt != null && expiresAt < now;

    if (isExpired) {
      logger.verbose(`Token ${tokenId} is expired, skipping`);
      continue;
    }

    const remote = remoteTokens.get(tokenId);
    const diff = compareTokens(definition, remote);

    if (!diff.exists) {
      if (definition.secretPhc) {
        if (dryRun) {
          logger.dryRun(`Would register token ${tokenId} for ${owner}`);
        } else {
          logger.verbose(`Registering token ${tokenId} for ${owner}...`);
          await client.register({
            tokenId,
            secretPhc: definition.secretPhc,
            owner,
            isAdmin: definition.isAdmin,
            roles: definition.roles,
            expiresAt: definition.expiresAt || undefined,
          });
          logger.success(`Registered token ${tokenId} for ${owner}`);
        }
      } else {
        logger.warn(
          `Token ${tokenId} not found and no secretPhc provided - skipping`,
        );
      }
      continue;
    }

    if (diff.needsRevoke) {
      if (dryRun) {
        logger.dryRun(`Would revoke token ${tokenId} for ${owner}`);
      } else {
        logger.verbose(`Revoking token ${tokenId} for ${owner}...`);
        await client.revoke(tokenId, {
          expiresAt: expiresAt || undefined,
        });
        logger.info(`Revoked token ${tokenId} for ${owner}`);
      }
    } else if (diff.needsRestore) {
      if (dryRun) {
        logger.dryRun(`Would restore token ${tokenId} for ${owner}`);
      } else {
        logger.verbose(`Restoring token ${tokenId} for ${owner}...`);
        await client.restore(tokenId);
        logger.info(`Restored token ${tokenId} for ${owner}`);
      }
    }

    if (diff.needsUpdate) {
      const updates: {
        owner?: string;
        isAdmin?: boolean;
        secretPhc?: string;
        expiresAt?: number | null;
        roles?: string[];
      } = {};

      for (const change of diff.changes) {
        if (change.field === "owner") {
          assert(typeof change.newValue === "string", "owner must be a string");
          updates.owner = change.newValue;
        } else if (change.field === "isAdmin") {
          assert(
            typeof change.newValue === "boolean",
            "isAdmin must be a boolean",
          );
          updates.isAdmin = change.newValue;
        } else if (change.field === "secretPhc") {
          updates.secretPhc = definition.secretPhc;
        } else if (change.field === "expiresAt") {
          assert(
            typeof change.newValue === "number" || change.newValue === null,
            "expiresAt must be a number or null",
          );
          updates.expiresAt = change.newValue;
        } else if (change.field === "roles") {
          assert(Array.isArray(change.newValue), "roles must be an array");
          updates.roles = change.newValue.map(String);
        }
      }

      if (dryRun) {
        const changeList = diff.changes
          .map((c) => {
            if (c.field === "expiresAt") {
              let oldVal = "null";
              if (c.oldValue != null) {
                assert(
                  typeof c.oldValue === "number",
                  "expiresAt oldValue must be a number",
                );
                oldVal = formatDate(c.oldValue);
              }
              let newVal = "null";
              if (c.newValue != null) {
                assert(
                  typeof c.newValue === "number",
                  "expiresAt newValue must be a number",
                );
                newVal = formatDate(c.newValue);
              }
              return `${c.field}: ${oldVal} → ${newVal}`;
            }
            return `${c.field}: ${String(c.oldValue)} → ${String(c.newValue)}`;
          })
          .join(", ");
        logger.dryRun(
          `Would update token ${tokenId} for ${owner}: ${changeList}`,
        );
      } else {
        logger.verbose(`Updating token ${tokenId} for ${owner}...`);
        await client.update(tokenId, updates);
        const changeList = diff.changes.map((c) => c.field).join(", ");
        logger.info(`Updated token ${tokenId} for ${owner}: ${changeList}`);
      }
    }
  }

  // Revoke tokens that exist remotely but are not in the config
  const configTokenIds = new Set(tokens.map((t) => t.tokenId));
  const orphanExpiresAt = addDurationToNow(orphanExpiresIn);

  for (const remoteToken of allRemoteTokens) {
    const { tokenId, owner } = remoteToken;
    if (!configTokenIds.has(tokenId) && !remoteToken.revokedAt) {
      const description = `orphaned token ${tokenId} for ${owner}, expires ${formatDate(orphanExpiresAt)}`;
      if (dryRun) {
        logger.dryRun(`Would revoke ${description}`);
      } else {
        logger.verbose(`Revoking orphaned token ${tokenId} for ${owner}...`);
        await client.revoke(tokenId, { expiresAt: orphanExpiresAt });
        logger.info(`Revoked ${description}`);
      }
    }
  }
}
