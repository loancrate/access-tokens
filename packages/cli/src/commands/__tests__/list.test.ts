/* eslint-disable @typescript-eslint/unbound-method */

jest.mock("../../config/loader");
jest.mock("../../utils/client-factory");
jest.mock("../../utils/logger");

import { jest } from "@jest/globals";

import {
  createMockClient,
  mockConfig,
  mockTokenRecord,
} from "../../__tests__/test-utils";
import { ConfigLoader } from "../../config/loader";
import * as clientFactory from "../../utils/client-factory";
import { listCommand } from "../list";

const mockCreateClient = jest.mocked(clientFactory.createClient);
const mockLoadUserConfig = jest.spyOn(ConfigLoader.prototype, "loadUserConfig");
const mockResolveEndpointConfig = jest.spyOn(
  ConfigLoader.prototype,
  "resolveEndpointConfig",
);
const mockResolveDirectEndpointConfig = jest.spyOn(
  ConfigLoader.prototype,
  "resolveDirectEndpointConfig",
);
const mockResolveEndpointFromOptions = jest.spyOn(
  ConfigLoader.prototype,
  "resolveEndpointFromOptions",
);

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDirectEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointFromOptions.mockResolvedValue(mockConfig);
});

describe("listCommand", () => {
  describe("with --url", () => {
    it("should list tokens successfully", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([mockTokenRecord]);
      mockCreateClient.mockReturnValue(mockClient);
      mockLoadUserConfig.mockResolvedValue(null);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });
      expect(mockClient.list).toHaveBeenCalledWith({
        includeRevoked: undefined,
        includeExpired: undefined,
        includeSecretPhc: undefined,
      });
    });

    it("should pass include options to client", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        includeRevoked: true,
        includeExpired: true,
        includeSecretPhc: true,
      });

      expect(mockClient.list).toHaveBeenCalledWith({
        includeRevoked: true,
        includeExpired: true,
        includeSecretPhc: true,
      });
    });

    it("should throw when adminToken is missing", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("--admin-token is required when using --url"),
      );

      await expect(
        listCommand({
          url: "https://test-api.example.com",
        }),
      ).rejects.toThrow("--admin-token is required when using --url");
    });
  });

  describe("with --endpoint", () => {
    it("should list tokens from named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([mockTokenRecord]);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        endpoint: "prod",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        endpoint: "prod",
      });
      expect(mockClient.list).toHaveBeenCalled();
    });
  });

  describe("output modes", () => {
    it("should output tokens as JSON when --json flag is set", async () => {
      const mockClient = createMockClient();
      const tokens = [
        mockTokenRecord,
        {
          tokenId: "test123456789012346",
          owner: "another@example.com",
          isAdmin: true,
          createdAt: 1704067200,
        },
      ];
      mockClient.list.mockResolvedValue(tokens);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        json: true,
      });

      expect(mockClient.list).toHaveBeenCalled();
    });

    it("should display token with all fields in non-JSON mode", async () => {
      const mockClient = createMockClient();
      const tokenWithAllFields = {
        tokenId: "test123456789012345",
        owner: "test@example.com",
        isAdmin: true,
        createdAt: 1704067200,
        lastUsedAt: 1704153600,
        expiresAt: 1767225600,
        revokedAt: 1704240000,
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
      };
      mockClient.list.mockResolvedValue([tokenWithAllFields]);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.list).toHaveBeenCalled();
    });

    it("should handle empty token list", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.list).toHaveBeenCalled();
    });

    it("should handle empty token list in JSON mode", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      await listCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        json: true,
      });

      expect(mockClient.list).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw when neither --url nor --endpoint provided", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("Either --endpoint or --url must be specified"),
      );

      await expect(listCommand({})).rejects.toThrow(
        "Either --endpoint or --url must be specified",
      );
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      await expect(
        listCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
        }),
      ).rejects.toThrow("API error");
    });
  });
});
