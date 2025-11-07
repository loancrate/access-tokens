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
import { registerCommand } from "../register";

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

describe("registerCommand", () => {
  describe("with --url", () => {
    it("should register token successfully", async () => {
      const mockClient = createMockClient();
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);
      mockLoadUserConfig.mockResolvedValue(null);

      await registerCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
      });
      expect(mockClient.register).toHaveBeenCalledWith({
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
        isAdmin: undefined,
        expiresAt: undefined,
      });
    });

    it("should register admin token", async () => {
      const mockClient = createMockClient();
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      await registerCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "admin@example.com",
        admin: true,
      });

      expect(mockClient.register).toHaveBeenCalledWith({
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "admin@example.com",
        isAdmin: true,
        expiresAt: undefined,
      });
    });

    it("should register token with expiration", async () => {
      const mockClient = createMockClient();
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      await registerCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
        expiresAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockClient.register).toHaveBeenCalledWith({
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
        isAdmin: undefined,
        expiresAt: 1704067200,
      });
    });

    it("should throw when adminToken is missing", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("--admin-token is required when using --url"),
      );

      await expect(
        registerCommand({
          url: "https://test-api.example.com",
          tokenId: "test123456789012345",
          secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          owner: "test@example.com",
        }),
      ).rejects.toThrow("--admin-token is required when using --url");
    });
  });

  describe("with --endpoint", () => {
    it("should register token from named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      await registerCommand({
        endpoint: "prod",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        endpoint: "prod",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
      });
      expect(mockClient.register).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw when neither --url nor --endpoint provided", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("Either --endpoint or --url must be specified"),
      );

      await expect(
        registerCommand({
          tokenId: "test123456789012345",
          secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          owner: "test@example.com",
        }),
      ).rejects.toThrow("Either --endpoint or --url must be specified");
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.register.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      await expect(
        registerCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
          tokenId: "test123456789012345",
          secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          owner: "test@example.com",
        }),
      ).rejects.toThrow("API error");
    });
  });
});
