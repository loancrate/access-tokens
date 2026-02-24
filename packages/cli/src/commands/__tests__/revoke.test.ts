/* eslint-disable @typescript-eslint/unbound-method */

import { vi } from "vitest";

vi.mock("../../config/loader");
vi.mock("../../utils/client-factory");
vi.mock("../../utils/logger");

import { createMockClient, mockConfig } from "../../__tests__/test-utils";
import { ConfigLoader } from "../../config/loader";
import * as clientFactory from "../../utils/client-factory";
import { revokeCommand } from "../revoke";

const mockCreateClient = vi.mocked(clientFactory.createClient);
const mockLoadUserConfig = vi.spyOn(ConfigLoader.prototype, "loadUserConfig");
const mockResolveEndpointConfig = vi.spyOn(
  ConfigLoader.prototype,
  "resolveEndpointConfig",
);
const mockResolveDirectEndpointConfig = vi.spyOn(
  ConfigLoader.prototype,
  "resolveDirectEndpointConfig",
);
const mockResolveEndpointFromOptions = vi.spyOn(
  ConfigLoader.prototype,
  "resolveEndpointFromOptions",
);

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveDirectEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointFromOptions.mockResolvedValue(mockConfig);
});

describe("revokeCommand", () => {
  describe("with --url", () => {
    it("should revoke token successfully", async () => {
      const mockClient = createMockClient();
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);
      mockLoadUserConfig.mockResolvedValue(null);

      await revokeCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
      });
      expect(mockClient.revoke).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: undefined,
      });
    });

    it("should revoke token with expiration", async () => {
      const mockClient = createMockClient();
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await revokeCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        expiresAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockClient.revoke).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: 1704067200,
      });
    });

    it("should throw when adminToken is missing", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("--admin-token is required when using --url"),
      );

      await expect(
        revokeCommand({
          url: "https://test-api.example.com",
          tokenId: "test123456789012345",
        }),
      ).rejects.toThrow("--admin-token is required when using --url");
    });
  });

  describe("with --endpoint", () => {
    it("should revoke token from named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await revokeCommand({
        endpoint: "prod",
        tokenId: "test123456789012345",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        endpoint: "prod",
        tokenId: "test123456789012345",
      });
      expect(mockClient.revoke).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw when neither --url nor --endpoint provided", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("Either --endpoint or --url must be specified"),
      );

      await expect(
        revokeCommand({
          tokenId: "test123456789012345",
        }),
      ).rejects.toThrow("Either --endpoint or --url must be specified");
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.revoke.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      await expect(
        revokeCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
          tokenId: "test123456789012345",
        }),
      ).rejects.toThrow("API error");
    });
  });
});
