import * as os from "os";
import * as path from "path";

import * as fs from "fs-extra";
import * as YAML from "yaml";

import {
  Config,
  configSchema,
  EndpointConfig,
  MergedEndpointConfig,
} from "./schemas";

export class ConfigLoader {
  private readonly userConfigPath: string;

  constructor(userConfigPath?: string) {
    this.userConfigPath =
      userConfigPath ||
      path.join(os.homedir(), ".access-tokens-cli", "config.yaml");
  }

  async loadUserConfig(): Promise<Config | null> {
    const { userConfigPath } = this;
    if (!(await fs.pathExists(userConfigPath))) {
      return null;
    }

    return await this.loadConfig(userConfigPath);
  }

  async loadSyncConfig(syncConfigPath: string): Promise<Config> {
    if (!(await fs.pathExists(syncConfigPath))) {
      throw new Error(`Sync config file not found: ${syncConfigPath}`);
    }

    return await this.loadConfig(syncConfigPath);
  }

  private async loadConfig(configPath: string): Promise<Config> {
    const content = await fs.readFile(configPath, "utf-8");
    const parsed: unknown = YAML.parse(content);
    const result = configSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(
        `Invalid config at ${configPath}: ${result.error.message}`,
      );
    }

    return result.data;
  }

  mergeConfigs(userConfig: Config | null, syncConfig: Config): Config {
    const defaults = {
      ...userConfig?.defaults,
      ...syncConfig.defaults,
    };

    const mergedEndpoints: Config["endpoints"] = {};

    const allEndpointNames = new Set([
      ...Object.keys(userConfig?.endpoints || {}),
      ...Object.keys(syncConfig.endpoints || {}),
    ]);

    for (const name of allEndpointNames) {
      mergedEndpoints[name] = {
        ...userConfig?.endpoints?.[name],
        ...syncConfig.endpoints?.[name],
      };
    }

    return {
      defaults,
      endpoints: mergedEndpoints,
      tokens: syncConfig.tokens || [],
    };
  }

  resolveEndpointConfig(
    endpointName: string,
    config: Config,
  ): MergedEndpointConfig {
    const endpointConfig = config.endpoints?.[endpointName];
    if (!endpointConfig) {
      throw new Error(`Endpoint '${endpointName}' not found in configuration`);
    }

    const { url } = endpointConfig;
    if (!url) {
      throw new Error(`Endpoint '${endpointName}' missing URL`);
    }

    const { defaults = {} } = config;
    const adminToken = endpointConfig.adminToken || defaults.adminToken;
    if (!adminToken) {
      throw new Error(`No adminToken for endpoint '${endpointName}'`);
    }

    const authPath = endpointConfig.authPath || defaults.authPath || "/auth";
    const adminPath =
      endpointConfig.adminPath || defaults.adminPath || "/admin";

    return { url, adminToken, authPath, adminPath };
  }

  resolveDirectEndpointConfig(
    config: EndpointConfig & { url: string },
    defaults?: Config["defaults"],
  ): MergedEndpointConfig {
    const { url, adminToken, authPath, adminPath } = config;

    if (!adminToken) {
      throw new Error("--admin-token is required when using --url");
    }

    return {
      url,
      adminToken,
      authPath: authPath || defaults?.authPath || "/auth",
      adminPath: adminPath || defaults?.adminPath || "/admin",
    };
  }

  async resolveEndpointFromOptions(
    options: EndpointConfig & {
      endpoint?: string;
    },
  ): Promise<MergedEndpointConfig> {
    const userConfig = await this.loadUserConfig();

    if (options.url) {
      const optionsWithUrl = { ...options, url: options.url };
      return this.resolveDirectEndpointConfig(
        optionsWithUrl,
        userConfig?.defaults,
      );
    } else if (options.endpoint) {
      return this.resolveEndpointConfig(options.endpoint, userConfig || {});
    } else {
      throw new Error("Either --endpoint or --url must be specified");
    }
  }
}
