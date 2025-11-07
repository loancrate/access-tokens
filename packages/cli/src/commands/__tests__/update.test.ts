/* eslint-disable @typescript-eslint/unbound-method */

jest.mock("../../config/loader");
jest.mock("../../utils/client-factory");
jest.mock("../../utils/logger");

import { jest } from "@jest/globals";

import { createMockClient, mockConfig } from "../../__tests__/test-utils";
import { ConfigLoader } from "../../config/loader";
import * as clientFactory from "../../utils/client-factory";
import { updateCommand } from "../update";

const mockCreateClient = jest.mocked(clientFactory.createClient);
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

describe("updateCommand", () => {
  describe("with --url", () => {
    it("should update token owner", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        owner: "newowner@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        owner: "newowner@example.com",
      });
      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        owner: "newowner@example.com",
      });
    });

    it("should update token admin status", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        admin: true,
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        isAdmin: true,
      });
    });

    it("should update token secret hash", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
      });
    });

    it("should update token expiration", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        expiresAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: 1704067200,
      });
    });

    it("should remove token expiration with null", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        expiresAt: "null",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: null,
      });
    });

    it("should update multiple fields", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        tokenId: "test123456789012345",
        owner: "newowner@example.com",
        admin: true,
        expiresAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        owner: "newowner@example.com",
        isAdmin: true,
        expiresAt: 1704067200,
      });
    });

    it("should throw when no updates specified", async () => {
      await expect(
        updateCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
          tokenId: "test123456789012345",
        }),
      ).rejects.toThrow("No updates specified");
    });

    it("should throw when adminToken is missing", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("--admin-token is required when using --url"),
      );

      await expect(
        updateCommand({
          url: "https://test-api.example.com",
          tokenId: "test123456789012345",
          owner: "newowner@example.com",
        }),
      ).rejects.toThrow("--admin-token is required when using --url");
    });
  });

  describe("with --endpoint", () => {
    it("should update token from named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      await updateCommand({
        endpoint: "prod",
        tokenId: "test123456789012345",
        owner: "newowner@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        endpoint: "prod",
        tokenId: "test123456789012345",
        owner: "newowner@example.com",
      });
      expect(mockClient.update).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw when neither --url nor --endpoint provided", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("Either --endpoint or --url must be specified"),
      );

      await expect(
        updateCommand({
          tokenId: "test123456789012345",
          owner: "newowner@example.com",
        }),
      ).rejects.toThrow("Either --endpoint or --url must be specified");
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.update.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      await expect(
        updateCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
          tokenId: "test123456789012345",
          owner: "newowner@example.com",
        }),
      ).rejects.toThrow("API error");
    });
  });
});
