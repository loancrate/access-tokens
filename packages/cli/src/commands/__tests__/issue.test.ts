/* eslint-disable @typescript-eslint/unbound-method */

import { vi } from "vitest";

vi.mock("../../config/loader");
vi.mock("../../utils/client-factory");
vi.mock("../../utils/logger");

import {
  createMockClient,
  mockConfig,
  mockTokenRecord,
} from "../../__tests__/test-utils";
import { ConfigLoader } from "../../config/loader";
import * as clientFactory from "../../utils/client-factory";
import { issueCommand } from "../issue";

const mockCreateClient = vi.spyOn(clientFactory, "createClient");
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

export const mockIssueResult = {
  token: "test123456789012345.secret123456789012345678901234567890",
  record: mockTokenRecord,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveDirectEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointFromOptions.mockResolvedValue(mockConfig);
});

describe("issueCommand", () => {
  describe("with --url", () => {
    it("should issue token successfully", async () => {
      const mockClient = createMockClient();
      mockClient.issue.mockResolvedValue(mockIssueResult);
      mockCreateClient.mockReturnValue(mockClient);
      mockLoadUserConfig.mockResolvedValue(null);

      await issueCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        owner: "test@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        owner: "test@example.com",
      });
      expect(mockClient.issue).toHaveBeenCalledWith({
        owner: "test@example.com",
        isAdmin: undefined,
        expiresAt: undefined,
      });
    });

    it("should issue admin token", async () => {
      const mockClient = createMockClient();
      mockClient.issue.mockResolvedValue(mockIssueResult);
      mockCreateClient.mockReturnValue(mockClient);

      await issueCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        owner: "admin@example.com",
        admin: true,
      });

      expect(mockClient.issue).toHaveBeenCalledWith({
        owner: "admin@example.com",
        isAdmin: true,
        expiresAt: undefined,
      });
    });

    it("should issue token with expiration", async () => {
      const mockClient = createMockClient();
      mockClient.issue.mockResolvedValue(mockIssueResult);
      mockCreateClient.mockReturnValue(mockClient);

      await issueCommand({
        url: "https://test-api.example.com",
        adminToken: "test-token",
        owner: "test@example.com",
        expiresAt: "2024-01-01T00:00:00.000Z",
      });

      expect(mockClient.issue).toHaveBeenCalledWith({
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
        issueCommand({
          url: "https://test-api.example.com",
          owner: "test@example.com",
        }),
      ).rejects.toThrow("--admin-token is required when using --url");
    });
  });

  describe("with --endpoint", () => {
    it("should issue token from named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.issue.mockResolvedValue(mockIssueResult);
      mockCreateClient.mockReturnValue(mockClient);

      await issueCommand({
        endpoint: "prod",
        owner: "test@example.com",
      });

      expect(mockResolveEndpointFromOptions).toHaveBeenCalledWith({
        endpoint: "prod",
        owner: "test@example.com",
      });
      expect(mockClient.issue).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should throw when neither --url nor --endpoint provided", async () => {
      mockResolveEndpointFromOptions.mockRejectedValue(
        new Error("Either --endpoint or --url must be specified"),
      );

      await expect(
        issueCommand({
          owner: "test@example.com",
        }),
      ).rejects.toThrow("Either --endpoint or --url must be specified");
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.issue.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      await expect(
        issueCommand({
          url: "https://test-api.example.com",
          adminToken: "test-token",
          owner: "test@example.com",
        }),
      ).rejects.toThrow("API error");
    });
  });
});
