import { vi } from "vitest";

const { mockPathExists, mockReadFile } = vi.hoisted(() => ({
  mockPathExists: vi.fn<(path: string) => Promise<boolean>>(),
  mockReadFile: vi.fn<(path: string, encoding: string) => Promise<string>>(),
}));

vi.mock("fs-extra", () => ({
  pathExists: mockPathExists,
  readFile: mockReadFile,
}));

const { mockHomedir } = vi.hoisted(() => ({
  mockHomedir: vi.fn<() => string>(),
}));

vi.mock("os", () => ({
  homedir: mockHomedir,
}));

import { ConfigLoader } from "../loader";
import type { Config } from "../schemas";

describe("ConfigLoader", () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new ConfigLoader("/test/config/dir");
  });

  describe("constructor", () => {
    it("should use custom config path when provided", () => {
      const customLoader = new ConfigLoader("/custom/path/config.yaml");
      expect(customLoader["userConfigPath"]).toBe("/custom/path/config.yaml");
    });

    it("should use default config path when not provided", () => {
      mockHomedir.mockReturnValue("/home/testuser");
      const defaultLoader = new ConfigLoader();
      expect(defaultLoader["userConfigPath"]).toBe(
        "/home/testuser/.access-tokens-cli/config.yaml",
      );
    });
  });

  describe("loadUserConfig", () => {
    it("should return null when config file does not exist", async () => {
      mockPathExists.mockResolvedValue(false);

      const result = await loader.loadUserConfig();

      expect(result).toBeNull();
      expect(mockPathExists).toHaveBeenCalledWith("/test/config/dir");
    });

    it("should load and return config when file exists", async () => {
      const mockConfig: Config = {
        endpoints: {
          prod: {
            url: "https://prod.example.com",
            adminToken: "token",
          },
        },
        tokens: [],
      };

      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(`
endpoints:
  prod:
    url: https://prod.example.com
    adminToken: token
tokens: []
      `);

      const result = await loader.loadUserConfig();

      expect(result).toEqual(mockConfig);
      expect(mockPathExists).toHaveBeenCalledWith("/test/config/dir");
      expect(mockReadFile).toHaveBeenCalledWith("/test/config/dir", "utf-8");
    });
  });

  describe("loadSyncConfig", () => {
    it("should throw when config file does not exist", async () => {
      mockPathExists.mockResolvedValue(false);

      await expect(loader.loadSyncConfig("/sync/config.yaml")).rejects.toThrow(
        "Sync config file not found: /sync/config.yaml",
      );

      expect(mockPathExists).toHaveBeenCalledWith("/sync/config.yaml");
    });

    it("should load and return config when file exists", async () => {
      const mockConfig: Config = {
        endpoints: {
          dev: {
            url: "https://dev.example.com",
          },
        },
        tokens: [],
      };

      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(`
endpoints:
  dev:
    url: https://dev.example.com
tokens: []
      `);

      const result = await loader.loadSyncConfig("/sync/config.yaml");

      expect(result).toEqual(mockConfig);
      expect(mockPathExists).toHaveBeenCalledWith("/sync/config.yaml");
      expect(mockReadFile).toHaveBeenCalledWith("/sync/config.yaml", "utf-8");
    });
  });

  describe("loadConfig", () => {
    it("should parse and validate YAML config successfully", async () => {
      const yamlContent = `
defaults:
  adminToken: test-token
  authPath: /auth
endpoints:
  prod:
    url: https://prod.example.com
tokens: []
      `;

      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(yamlContent);

      const result = await loader.loadUserConfig();

      expect(result).toEqual({
        defaults: {
          adminToken: "test-token",
          authPath: "/auth",
        },
        endpoints: {
          prod: {
            url: "https://prod.example.com",
          },
        },
        tokens: [],
      });
    });

    it("should throw error when config fails schema validation", async () => {
      const invalidYaml = `
endpoints:
  prod:
    url: "not-a-valid-url"
tokens: []
      `;

      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(invalidYaml);

      await expect(loader.loadUserConfig()).rejects.toThrow(
        "Invalid config at /test/config/dir",
      );
    });
  });

  describe("mergeConfigs", () => {
    it("should merge user and sync configs with sync taking precedence", () => {
      const userConfig: Config = {
        defaults: {
          adminToken: "user-token",
          authPath: "/user-auth",
        },
        endpoints: {
          prod: {
            url: "https://user-prod.example.com",
          },
        },
        tokens: [],
      };

      const syncConfig: Config = {
        defaults: {
          authPath: "/sync-auth",
          adminPath: "/sync-admin",
        },
        endpoints: {
          dev: {
            url: "https://sync-dev.example.com",
          },
        },
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test-owner",
            isAdmin: false,
            revoked: false,
          },
        ],
      };

      const result = loader.mergeConfigs(userConfig, syncConfig);

      expect(result).toEqual({
        defaults: {
          adminToken: "user-token",
          authPath: "/sync-auth",
          adminPath: "/sync-admin",
        },
        endpoints: {
          prod: {
            url: "https://user-prod.example.com",
          },
          dev: {
            url: "https://sync-dev.example.com",
          },
        },
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test-owner",
            isAdmin: false,
            revoked: false,
          },
        ],
      });
    });

    it("should handle null user config", () => {
      const syncConfig: Config = {
        defaults: {
          adminToken: "sync-token",
        },
        endpoints: {
          dev: {
            url: "https://dev.example.com",
          },
        },
        tokens: [],
      };

      const result = loader.mergeConfigs(null, syncConfig);

      expect(result).toEqual({
        defaults: {
          adminToken: "sync-token",
        },
        endpoints: {
          dev: {
            url: "https://dev.example.com",
          },
        },
        tokens: [],
      });
    });

    it("should merge endpoint properties when same name exists in both configs", () => {
      const userConfig: Config = {
        endpoints: {
          prod: {
            url: "https://user-prod.example.com",
            adminToken: "user-token",
            authPath: "/user-auth",
          },
        },
        tokens: [],
      };

      const syncConfig: Config = {
        endpoints: {
          prod: {
            url: "https://sync-prod.example.com",
          },
        },
        tokens: [],
      };

      const result = loader.mergeConfigs(userConfig, syncConfig);

      expect(result.endpoints?.prod).toEqual({
        url: "https://sync-prod.example.com",
        adminToken: "user-token",
        authPath: "/user-auth",
      });
    });

    it("should use tokens from sync config", () => {
      const userConfig: Config = {
        tokens: [
          {
            tokenId: "user123456789012345",
            owner: "user-owner",
            isAdmin: false,
            revoked: false,
          },
        ],
      };

      const syncConfig: Config = {
        tokens: [
          {
            tokenId: "sync123456789012345",
            owner: "sync-owner",
            isAdmin: false,
            revoked: false,
          },
        ],
      };

      const result = loader.mergeConfigs(userConfig, syncConfig);

      expect(result.tokens).toEqual([
        {
          tokenId: "sync123456789012345",
          owner: "sync-owner",
          isAdmin: false,
          revoked: false,
        },
      ]);
    });
  });

  describe("resolveEndpointConfig", () => {
    it("should resolve endpoint with all config from endpoint", () => {
      const config: Config = {
        endpoints: {
          prod: {
            url: "https://prod.example.com",
            adminToken: "endpoint-token",
            authPath: "/endpoint-auth",
            adminPath: "/endpoint-admin",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result).toEqual({
        url: "https://prod.example.com",
        adminToken: "endpoint-token",
        authPath: "/endpoint-auth",
        adminPath: "/endpoint-admin",
      });
    });

    it("should fall back to defaults for adminToken", () => {
      const config: Config = {
        defaults: {
          adminToken: "default-token",
        },
        endpoints: {
          prod: {
            url: "https://prod.example.com",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result.adminToken).toBe("default-token");
    });

    it("should fall back to defaults for authPath", () => {
      const config: Config = {
        defaults: {
          adminToken: "token",
          authPath: "/default-auth",
        },
        endpoints: {
          prod: {
            url: "https://prod.example.com",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result.authPath).toBe("/default-auth");
    });

    it("should fall back to defaults for adminPath", () => {
      const config: Config = {
        defaults: {
          adminToken: "token",
          adminPath: "/default-admin",
        },
        endpoints: {
          prod: {
            url: "https://prod.example.com",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result.adminPath).toBe("/default-admin");
    });

    it("should use hardcoded defaults when no config defaults", () => {
      const config: Config = {
        endpoints: {
          prod: {
            url: "https://prod.example.com",
            adminToken: "token",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result.authPath).toBe("/auth");
      expect(result.adminPath).toBe("/admin");
    });

    it("should prefer endpoint config over defaults", () => {
      const config: Config = {
        defaults: {
          adminToken: "default-token",
          authPath: "/default-auth",
          adminPath: "/default-admin",
        },
        endpoints: {
          prod: {
            url: "https://prod.example.com",
            adminToken: "endpoint-token",
            authPath: "/endpoint-auth",
            adminPath: "/endpoint-admin",
          },
        },
        tokens: [],
      };

      const result = loader.resolveEndpointConfig("prod", config);

      expect(result).toEqual({
        url: "https://prod.example.com",
        adminToken: "endpoint-token",
        authPath: "/endpoint-auth",
        adminPath: "/endpoint-admin",
      });
    });

    it("should throw when endpoint not found", () => {
      const config: Config = {
        endpoints: {
          prod: {
            url: "https://prod.example.com",
            adminToken: "token",
          },
        },
        tokens: [],
      };

      expect(() => loader.resolveEndpointConfig("dev", config)).toThrow(
        "Endpoint 'dev' not found in configuration",
      );
    });

    it("should throw when endpoint missing URL", () => {
      const config: Config = {
        endpoints: {
          prod: {
            adminToken: "token",
          },
        },
        tokens: [],
      };

      expect(() => loader.resolveEndpointConfig("prod", config)).toThrow(
        "Endpoint 'prod' missing URL",
      );
    });

    it("should throw when adminToken missing from both endpoint and defaults", () => {
      const config: Config = {
        endpoints: {
          prod: {
            url: "https://prod.example.com",
          },
        },
        tokens: [],
      };

      expect(() => loader.resolveEndpointConfig("prod", config)).toThrow(
        "No adminToken for endpoint 'prod'",
      );
    });
  });

  describe("resolveDirectEndpointConfig", () => {
    it("should create config from direct URL parameters", () => {
      const result = loader.resolveDirectEndpointConfig({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/custom-auth",
        adminPath: "/custom-admin",
      });

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/custom-auth",
        adminPath: "/custom-admin",
      });
    });

    it("should use default paths when not provided", () => {
      const result = loader.resolveDirectEndpointConfig({
        url: "https://api.example.com",
        adminToken: "my-token",
      });

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/auth",
        adminPath: "/admin",
      });
    });

    it("should throw when adminToken is undefined", () => {
      expect(() =>
        loader.resolveDirectEndpointConfig({
          url: "https://api.example.com",
        }),
      ).toThrow("--admin-token is required when using --url");
    });

    it("should allow custom authPath only", () => {
      const result = loader.resolveDirectEndpointConfig({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/custom-auth",
      });

      expect(result.authPath).toBe("/custom-auth");
      expect(result.adminPath).toBe("/admin");
    });

    it("should allow custom adminPath only", () => {
      const result = loader.resolveDirectEndpointConfig({
        url: "https://api.example.com",
        adminToken: "my-token",
        adminPath: "/custom-admin",
      });

      expect(result.authPath).toBe("/auth");
      expect(result.adminPath).toBe("/custom-admin");
    });

    it("should use defaults.authPath when authPath not provided", () => {
      const defaults = {
        authPath: "/default-auth",
        adminPath: "/default-admin",
      };

      const result = loader.resolveDirectEndpointConfig(
        {
          url: "https://api.example.com",
          adminToken: "my-token",
        },
        defaults,
      );

      expect(result.authPath).toBe("/default-auth");
    });

    it("should use defaults.adminPath when adminPath not provided", () => {
      const defaults = {
        authPath: "/default-auth",
        adminPath: "/default-admin",
      };

      const result = loader.resolveDirectEndpointConfig(
        {
          url: "https://api.example.com",
          adminToken: "my-token",
        },
        defaults,
      );

      expect(result.adminPath).toBe("/default-admin");
    });

    it("should use both defaults paths when neither provided", () => {
      const defaults = {
        authPath: "/default-auth",
        adminPath: "/default-admin",
      };

      const result = loader.resolveDirectEndpointConfig(
        {
          url: "https://api.example.com",
          adminToken: "my-token",
        },
        defaults,
      );

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/default-auth",
        adminPath: "/default-admin",
      });
    });

    it("should prefer explicit paths over defaults", () => {
      const defaults = {
        authPath: "/default-auth",
        adminPath: "/default-admin",
      };

      const result = loader.resolveDirectEndpointConfig(
        {
          url: "https://api.example.com",
          adminToken: "my-token",
          authPath: "/custom-auth",
          adminPath: "/custom-admin",
        },
        defaults,
      );

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "my-token",
        authPath: "/custom-auth",
        adminPath: "/custom-admin",
      });
    });
  });

  describe("resolveEndpointFromOptions", () => {
    it("should resolve using --url when provided", async () => {
      mockPathExists.mockResolvedValue(false);

      const result = await loader.resolveEndpointFromOptions({
        url: "https://api.example.com",
        adminToken: "test-token",
        authPath: "/custom-auth",
        adminPath: "/custom-admin",
      });

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "test-token",
        authPath: "/custom-auth",
        adminPath: "/custom-admin",
      });
    });

    it("should resolve using --endpoint when provided", async () => {
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(`
endpoints:
  prod:
    url: https://prod.example.com
    adminToken: prod-token
tokens: []
      `);

      const result = await loader.resolveEndpointFromOptions({
        endpoint: "prod",
      });

      expect(result.url).toBe("https://prod.example.com");
      expect(result.adminToken).toBe("prod-token");
    });

    it("should throw when neither --url nor --endpoint provided", async () => {
      await expect(loader.resolveEndpointFromOptions({})).rejects.toThrow(
        "Either --endpoint or --url must be specified",
      );
    });

    it("should use defaults from user config when using --url", async () => {
      mockPathExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(`
defaults:
  authPath: /default-auth
  adminPath: /default-admin
tokens: []
      `);

      const result = await loader.resolveEndpointFromOptions({
        url: "https://api.example.com",
        adminToken: "test-token",
      });

      expect(result).toEqual({
        url: "https://api.example.com",
        adminToken: "test-token",
        authPath: "/default-auth",
        adminPath: "/default-admin",
      });
    });
  });
});
