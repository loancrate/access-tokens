/* eslint-disable @typescript-eslint/unbound-method */

jest.mock("../../config/loader");
jest.mock("../../utils/client-factory");
jest.mock("../../utils/diff");
jest.mock("../../utils/duration-parser");
jest.mock("../../utils/logger");
jest.mock("../../utils/permissions");

import { jest } from "@jest/globals";

import {
  createMockClient,
  mockConfig,
  mockTokenRecord,
} from "../../__tests__/test-utils";
import { ConfigLoader } from "../../config/loader";
import * as clientFactory from "../../utils/client-factory";
import * as diff from "../../utils/diff";
import * as durationParser from "../../utils/duration-parser";
import * as permissions from "../../utils/permissions";
import { syncCommand } from "../sync";

const mockCreateClient = jest.mocked(clientFactory.createClient);
const mockLoadUserConfig = jest.spyOn(ConfigLoader.prototype, "loadUserConfig");
const mockLoadSyncConfig = jest.spyOn(ConfigLoader.prototype, "loadSyncConfig");
const mockMergeConfigs = jest.spyOn(ConfigLoader.prototype, "mergeConfigs");
const mockResolveEndpointConfig = jest.spyOn(
  ConfigLoader.prototype,
  "resolveEndpointConfig",
);
const mockResolveDirectEndpointConfig = jest.spyOn(
  ConfigLoader.prototype,
  "resolveDirectEndpointConfig",
);
const mockCheckFilePermissions = jest.mocked(permissions.checkFilePermissions);
const mockCompareTokens = jest.mocked(diff.compareTokens);
const mockAddDurationToNow = jest.mocked(durationParser.addDurationToNow);

beforeEach(() => {
  jest.clearAllMocks();
  // Mock Date.now to December 1, 2025 so expiresAt timestamps in tests are in the future
  jest.spyOn(Date, "now").mockReturnValue(1733011200000);
  // Mock addDurationToNow to return a timestamp 30 days from now
  // December 1, 2025 + 30 days = December 31, 2025 00:00:00 UTC = 1735603200 seconds
  mockAddDurationToNow.mockReturnValue(1735603200);
  mockResolveDirectEndpointConfig.mockReturnValue(mockConfig);
  mockResolveEndpointConfig.mockReturnValue(mockConfig);
  mockCheckFilePermissions.mockResolvedValue(undefined);
});

describe("syncCommand", () => {
  describe("with --url", () => {
    it("should register new token with secretPhc", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.register).toHaveBeenCalledWith({
        tokenId: "test123456789012345",
        secretPhc: "$scrypt$ln=15,r=8,p=1$...",
        owner: "test@example.com",
        isAdmin: false,
        expiresAt: undefined,
      });
    });

    it("should update existing token", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "old@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "new@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "owner",
            oldValue: "old@example.com",
            newValue: "new@example.com",
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        owner: "new@example.com",
      });
    });

    it("should revoke token when revoked in config", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: true,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: true,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.revoke).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: undefined,
      });
    });

    it("should restore token when not revoked in config", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
          revokedAt: 1704067200,
        },
      ]);
      mockClient.restore.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: true,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.restore).toHaveBeenCalledWith("test123456789012345");
    });

    it("should skip registration when no secretPhc provided", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.register).not.toHaveBeenCalled();
    });

    it("should support dry-run mode", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.register).not.toHaveBeenCalled();
    });
  });

  describe("with --endpoint", () => {
    it("should sync to named endpoint", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue({
        endpoints: { prod: { url: "https://prod.example.com" } },
      });
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });
      mockMergeConfigs.mockReturnValue({
        endpoints: { prod: { url: "https://prod.example.com" } },
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        endpoint: "prod",
      });

      expect(mockLoadUserConfig).toHaveBeenCalled();
      expect(mockResolveEndpointConfig).toHaveBeenCalledWith("prod", {
        endpoints: { prod: { url: "https://prod.example.com" } },
      });
      expect(mockClient.register).toHaveBeenCalled();
    });
  });

  describe("multiple endpoints", () => {
    it("should sync to multiple comma-separated endpoints", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue({
        endpoints: {
          dev: { url: "https://dev.example.com" },
          staging: { url: "https://staging.example.com" },
        },
      });
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });
      mockMergeConfigs.mockReturnValue({
        endpoints: {
          dev: { url: "https://dev.example.com" },
          staging: { url: "https://staging.example.com" },
        },
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        endpoint: "dev,staging",
      });

      expect(mockResolveEndpointConfig).toHaveBeenCalledTimes(2);
      expect(mockResolveEndpointConfig).toHaveBeenCalledWith("dev", {
        endpoints: {
          dev: { url: "https://dev.example.com" },
          staging: { url: "https://staging.example.com" },
        },
      });
      expect(mockResolveEndpointConfig).toHaveBeenCalledWith("staging", {
        endpoints: {
          dev: { url: "https://dev.example.com" },
          staging: { url: "https://staging.example.com" },
        },
      });
      expect(mockClient.register).toHaveBeenCalledTimes(2);
    });

    it("should sync to all endpoints in config when no endpoint specified", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        endpoints: {
          prod: { url: "https://prod.example.com" },
          dev: { url: "https://dev.example.com" },
        },
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });
      mockMergeConfigs.mockReturnValue({
        endpoints: {
          prod: { url: "https://prod.example.com" },
          dev: { url: "https://dev.example.com" },
        },
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
      });

      expect(mockResolveEndpointConfig).toHaveBeenCalledTimes(2);
      expect(mockClient.register).toHaveBeenCalledTimes(2);
    });

    it("should throw when no endpoints defined and no --url or --endpoint", async () => {
      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      await expect(
        syncCommand({
          config: "sync.yaml",
        }),
      ).rejects.toThrow("No endpoints specified");
    });

    it("should warn and skip endpoint that fails to resolve", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockClient.register.mockResolvedValue(mockTokenRecord);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        endpoints: {
          prod: { url: "https://prod.example.com" },
          invalid: { url: "https://invalid.example.com" },
        },
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });
      mockMergeConfigs.mockReturnValue({
        endpoints: {
          prod: { url: "https://prod.example.com" },
          invalid: { url: "https://invalid.example.com" },
        },
      });

      mockResolveEndpointConfig
        .mockReturnValueOnce(mockConfig)
        .mockImplementationOnce(() => {
          throw new Error("Invalid endpoint");
        });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
      });

      expect(mockClient.register).toHaveBeenCalledTimes(1);
    });
  });

  describe("expired tokens", () => {
    it("should skip expired tokens", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
            expiresAt: Math.floor(Date.now() / 1000) - 1,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.register).not.toHaveBeenCalled();
    });
  });

  describe("dry run mode", () => {
    it("should show dry run for register", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$ln=15,r=8,p=1$...",
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: false,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.register).not.toHaveBeenCalled();
    });

    it("should show dry run for update", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "old@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "new@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "owner",
            oldValue: "old@example.com",
            newValue: "new@example.com",
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.update).not.toHaveBeenCalled();
    });

    it("should show dry run for revoke", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: true,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: true,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.revoke).not.toHaveBeenCalled();
    });

    it("should show dry run for restore", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
          revokedAt: 1704067200,
        },
      ]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: true,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.restore).not.toHaveBeenCalled();
    });
  });

  describe("update scenarios", () => {
    it("should update isAdmin field", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: true,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "isAdmin",
            oldValue: false,
            newValue: true,
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        isAdmin: true,
      });
    });

    it("should update expiresAt field", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            expiresAt: 1767225600,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "expiresAt",
            oldValue: null,
            newValue: 1767225600,
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        expiresAt: 1767225600,
      });
    });

    it("should update secretPhc field", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
          secretPhc: "$scrypt$old",
        },
      ]);
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
            secretPhc: "$scrypt$new",
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "secretPhc",
            oldValue: "[hidden]",
            newValue: "[updated]",
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        secretPhc: "$scrypt$new",
      });
    });

    it("should update multiple fields at once", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "test123456789012345",
          owner: "old@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.update.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "new@example.com",
            isAdmin: true,
            revoked: false,
            expiresAt: 1767225600,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: true,
        needsRevoke: false,
        needsRestore: false,
        changes: [
          {
            field: "owner",
            oldValue: "old@example.com",
            newValue: "new@example.com",
          },
          {
            field: "isAdmin",
            oldValue: false,
            newValue: true,
          },
          {
            field: "expiresAt",
            oldValue: null,
            newValue: 1767225600,
          },
        ],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.update).toHaveBeenCalledWith("test123456789012345", {
        owner: "new@example.com",
        isAdmin: true,
        expiresAt: 1767225600,
      });
    });
  });

  describe("error handling", () => {
    it("should not error when no tokens defined", async () => {
      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });
    });

    it("should throw on client errors", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockRejectedValue(new Error("API error"));
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      await expect(
        syncCommand({
          config: "sync.yaml",
          url: "https://test-api.example.com",
          adminToken: "test-token",
        }),
      ).rejects.toThrow("API error");
    });
  });

  describe("orphaned tokens", () => {
    it("should revoke tokens that exist remotely but not in config", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "orphan123456789012",
          owner: "orphan@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.revoke).toHaveBeenCalledWith("orphan123456789012", {
        expiresAt: 1735603200,
      });
      expect(mockAddDurationToNow).toHaveBeenCalledWith("P30D");
    });

    it("should not revoke already-revoked orphaned tokens", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "orphan123456789012",
          owner: "orphan@example.com",
          isAdmin: false,
          createdAt: 1704067200,
          revokedAt: 1704067200,
        },
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
      });

      expect(mockClient.revoke).not.toHaveBeenCalled();
    });

    it("should show dry run for orphaned token revocation", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "orphan123456789012",
          owner: "orphan@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        dryRun: true,
      });

      expect(mockClient.revoke).not.toHaveBeenCalled();
      expect(mockAddDurationToNow).toHaveBeenCalledWith("P30D");
    });

    it("should revoke orphaned tokens with custom expiration", async () => {
      const mockClient = createMockClient();
      mockClient.list.mockResolvedValue([
        {
          tokenId: "orphan123456789012",
          owner: "orphan@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
        {
          tokenId: "test123456789012345",
          owner: "test@example.com",
          isAdmin: false,
          createdAt: 1704067200,
        },
      ]);
      mockClient.revoke.mockResolvedValue(undefined);
      mockCreateClient.mockReturnValue(mockClient);

      mockLoadUserConfig.mockResolvedValue(null);
      mockLoadSyncConfig.mockResolvedValue({
        tokens: [
          {
            tokenId: "test123456789012345",
            owner: "test@example.com",
            isAdmin: false,
            revoked: false,
          },
        ],
      });

      mockCompareTokens.mockReturnValue({
        tokenId: "test123456789012345",
        exists: true,
        needsUpdate: false,
        needsRevoke: false,
        needsRestore: false,
        changes: [],
      });

      await syncCommand({
        config: "sync.yaml",
        url: "https://test-api.example.com",
        adminToken: "test-token",
        orphanExpiresIn: "P7D",
      });

      expect(mockClient.revoke).toHaveBeenCalledWith("orphan123456789012", {
        expiresAt: 1735603200,
      });
      expect(mockAddDurationToNow).toHaveBeenCalledWith("P7D");
    });
  });
});
