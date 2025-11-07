/* eslint-disable @typescript-eslint/consistent-type-assertions */

import assert from "assert";

import { jest } from "@jest/globals";

import { AccessTokensClient, isApiError } from "../index";

import { createMockFetch } from "./createMockFetch";
import { MockResponse } from "./MockResponse";

jest.useFakeTimers();

describe("AccessTokensClient", () => {
  const { mockFetch, addResponse, getCalls, reset } = createMockFetch();
  let client: AccessTokensClient;

  beforeEach(() => {
    reset();
    jest.clearAllTimers();
    client = new AccessTokensClient({
      fetch: mockFetch,
      endpoint: "https://api.example.com",
      apiKey: "test-api-key",
    });
  });

  const testJwtToken = "test-jwt-token";
  const mockAuthResponse = new MockResponse({
    json: {
      access_token: testJwtToken,
      token_type: "Bearer",
      expires_in: 3600,
    },
  });

  it("should use global fetch with retry by default", () => {
    const client = new AccessTokensClient({
      endpoint: "https://api.example.com",
      apiKey: "test-api-key",
    });
    expect(client["fetch"].name).toBe("fetchRetry");
  });

  it("should use custom auth and admin paths", () => {
    const client = new AccessTokensClient({
      fetch: mockFetch,
      endpoint: "https://api.example.com",
      apiKey: "test-api-key",
      authPath: "/custom-auth",
      adminPath: "/custom-admin",
    });
    expect(client["authPath"]).toBe("/custom-auth");
    expect(client["adminPath"]).toBe("/custom-admin");
  });

  describe("authentication", () => {
    it("should authenticate and cache JWT token", async () => {
      addResponse(mockAuthResponse);

      const token = await client["authenticate"]();

      expect(token).toBe(testJwtToken);
      expect(getCalls()).toHaveLength(1);
      expect(getCalls()[0]).toMatchObject({
        url: "https://api.example.com/auth/token",
        options: {
          method: "POST",
          headers: {
            Authorization: "Bearer test-api-key",
          },
        },
      });
    });

    it("should reuse cached token when not expired", async () => {
      addResponse(mockAuthResponse);

      await client["authenticate"]();
      const token = await client["authenticate"]();

      expect(token).toBe(testJwtToken);
      expect(getCalls()).toHaveLength(1);
    });

    it("should renew token when close to expiry", async () => {
      const authResponse1 = new MockResponse({
        json: {
          access_token: "token-1",
          token_type: "Bearer",
          expires_in: 60,
        },
      });

      const authResponse2 = new MockResponse({
        json: {
          access_token: "token-2",
          token_type: "Bearer",
          expires_in: 3600,
        },
      });

      addResponse(authResponse1);
      addResponse(authResponse2);

      const token1 = await client["authenticate"]();
      expect(token1).toBe("token-1");

      jest.advanceTimersByTime(35 * 1000);

      const token2 = await client["authenticate"]();
      expect(token2).toBe("token-2");
      expect(getCalls()).toHaveLength(2);
    });

    it("should handle authentication failure with string cause", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      addResponse(errorResponse);

      try {
        await client["authenticate"]();
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe("Failed to authenticate");
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Unauthorized");
      }
    });

    it("should handle authentication failure with ApiError cause", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "content-type": "application/json",
        },
        json: {
          error: {
            message: "Invalid request body",
            details: "Missing required field",
          },
        },
      });

      addResponse(errorResponse);

      try {
        await client["authenticate"]();
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe("Failed to authenticate");
        assert(isApiError(err.cause));
        expect(err.cause.error.message).toBe("Invalid request body");
        expect(err.cause.error.details).toBe("Missing required field");
      }
    });

    it("should handle invalid auth response schema", async () => {
      const invalidResponse = new MockResponse({
        json: { invalid: "response" },
      });

      addResponse(invalidResponse);

      await expect(client["authenticate"]()).rejects.toThrow(
        "Invalid auth token response",
      );
    });
  });

  describe("list", () => {
    const mockTokenRecord = {
      tokenId: "abc123def456ghi789jkl",
      owner: "test-owner",
      isAdmin: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      expiresAt: null,
    };

    it("should list tokens successfully", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      const result = await client.list();

      expect(result).toEqual([mockTokenRecord]);
      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens",
        options: {
          method: "GET",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        },
      });
    });

    it("should support pagination options", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      await client.list({ afterTokenId: "prev-token", limit: 50 });

      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens?afterTokenId=prev-token&limit=50",
      });
    });

    it("should handle list tokens failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.list();
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe("Failed to list tokens");
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Forbidden");
      }
    });

    it("should support includeRevoked option", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      await client.list({ includeRevoked: true });

      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens?includeRevoked=true",
      });
    });

    it("should support includeExpired option", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      await client.list({ includeExpired: true });

      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens?includeExpired=true",
      });
    });

    it("should support includeSecretPhc option", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      await client.list({ includeSecretPhc: true });

      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens?includeSecretPhc=true",
      });
    });

    it("should support all list options combined", async () => {
      const listResponse = new MockResponse({
        json: {
          records: [mockTokenRecord],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(listResponse);

      await client.list({
        afterTokenId: "token-123",
        limit: 25,
        includeRevoked: true,
        includeExpired: true,
        includeSecretPhc: true,
      });

      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens?afterTokenId=token-123&limit=25&includeRevoked=true&includeExpired=true&includeSecretPhc=true",
      });
    });

    it("should handle invalid list response schema", async () => {
      const invalidResponse = new MockResponse({
        json: { invalid: "response" },
      });

      addResponse(mockAuthResponse);
      addResponse(invalidResponse);

      await expect(client.list()).rejects.toThrow(
        "Invalid list tokens response",
      );
    });
  });

  describe("batchLoad", () => {
    const mockTokenRecord1 = {
      tokenId: "token1234567890123456",
      owner: "test-owner-1",
      isAdmin: false,
      createdAt: Date.now(),
    };

    const mockTokenRecord2 = {
      tokenId: "token2234567890123456",
      owner: "test-owner-2",
      isAdmin: true,
      createdAt: Date.now(),
    };

    it("should batch load tokens successfully", async () => {
      const batchResponse = new MockResponse({
        json: {
          found: [mockTokenRecord1, mockTokenRecord2],
          notFound: [],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(batchResponse);

      const tokenIds = new Set([
        "token1234567890123456",
        "token2234567890123456",
      ]);
      const result = await client.batchLoad(tokenIds);

      expect(result).toEqual({
        found: [mockTokenRecord1, mockTokenRecord2],
        notFound: [],
      });
      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens/batch",
        options: {
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt-token",
            "Content-Type": "application/json",
          },
        },
      });
    });

    it("should handle empty token ID set", async () => {
      const batchResponse = new MockResponse({
        json: {
          found: [],
          notFound: [],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(batchResponse);

      const result = await client.batchLoad(new Set());

      expect(result).toEqual({
        found: [],
        notFound: [],
      });
      // RequestInit.body is typed as BodyInit | null | undefined which
      // includes string. In tests, we control the mock and know the body is a
      // JSON string that can be safely parsed.
      expect(
        JSON.parse((getCalls()[1]?.options?.body as string) || "{}"),
      ).toEqual({
        tokenIds: [],
        includeSecretPhc: undefined,
      });
    });

    it("should convert Set to array in request body", async () => {
      const batchResponse = new MockResponse({
        json: {
          found: [mockTokenRecord1],
          notFound: [],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(batchResponse);

      const tokenIds = new Set(["token1234567890123456"]);
      await client.batchLoad(tokenIds);

      const requestBody = JSON.parse(
        (getCalls()[1]?.options?.body as string) || "{}",
      ) as Record<string, unknown>;
      expect(Array.isArray(requestBody.tokenIds)).toBe(true);
      expect(requestBody.tokenIds).toEqual(["token1234567890123456"]);
    });

    it("should support includeSecretPhc option", async () => {
      const tokenWithSecret = {
        ...mockTokenRecord1,
        secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
      };
      const batchResponse = new MockResponse({
        json: {
          found: [tokenWithSecret],
          notFound: [],
        },
      });

      addResponse(mockAuthResponse);
      addResponse(batchResponse);

      const tokenIds = new Set(["token1234567890123456"]);
      const result = await client.batchLoad(tokenIds, {
        includeSecretPhc: true,
      });

      expect(result.found[0].secretPhc).toBeDefined();
      const requestBody = JSON.parse(
        (getCalls()[1]?.options?.body as string) || "{}",
      ) as Record<string, unknown>;
      expect(requestBody.includeSecretPhc).toBe(true);
    });

    it("should handle batch load failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      const tokenIds = new Set(["token1234567890123456"]);
      try {
        await client.batchLoad(tokenIds);
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe("Failed to batch load tokens");
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Bad Request");
      }
    });

    it("should handle invalid batch load response schema", async () => {
      const invalidResponse = new MockResponse({
        json: { invalid: "response" },
      });

      addResponse(mockAuthResponse);
      addResponse(invalidResponse);

      const tokenIds = new Set(["token1234567890123456"]);
      await expect(client.batchLoad(tokenIds)).rejects.toThrow(
        "Invalid batch load response",
      );
    });
  });

  describe("issue", () => {
    const mockTokenRecord = {
      tokenId: "abc123def456ghi789jkl",
      owner: "test-owner",
      isAdmin: false,
      createdAt: Date.now(),
      lastUsedAt: null,
      expiresAt: null,
    };

    it("should issue token successfully", async () => {
      const issueResponse = new MockResponse({
        json: {
          token: "test-token-value",
          record: mockTokenRecord,
        },
      });

      addResponse(mockAuthResponse);
      addResponse(issueResponse);

      const result = await client.issue({
        owner: "test-owner",
      });

      expect(result).toEqual({
        token: "test-token-value",
        record: mockTokenRecord,
      });
      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens",
        options: {
          method: "POST",
          headers: {
            Authorization: "Bearer test-jwt-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ owner: "test-owner" }),
        },
      });
    });

    it("should support optional isAdmin flag", async () => {
      const issueResponse = new MockResponse({
        json: {
          token: "test-token-value",
          record: { ...mockTokenRecord, isAdmin: true },
        },
      });

      addResponse(mockAuthResponse);
      addResponse(issueResponse);

      await client.issue({
        owner: "admin-owner",
        isAdmin: true,
      });

      expect(getCalls()[1]?.options?.body).toBe(
        JSON.stringify({ owner: "admin-owner", isAdmin: true }),
      );
    });

    it("should handle issue token failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.issue({ owner: "test-owner" });
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe("Failed to issue token");
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Bad Request");
      }
    });

    it("should support tokenId option", async () => {
      const issueResponse = new MockResponse({
        json: {
          token: "test-token-value",
          record: {
            ...mockTokenRecord,
            tokenId: "customTokenId12345678",
          },
        },
      });

      addResponse(mockAuthResponse);
      addResponse(issueResponse);

      await client.issue({
        tokenId: "customTokenId12345678",
        owner: "test-owner",
      });

      expect(getCalls()[1]?.options?.body).toBe(
        JSON.stringify({
          tokenId: "customTokenId12345678",
          owner: "test-owner",
        }),
      );
    });

    it("should support expiresAt option", async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const issueResponse = new MockResponse({
        json: {
          token: "test-token-value",
          record: {
            ...mockTokenRecord,
            expiresAt,
          },
        },
      });

      addResponse(mockAuthResponse);
      addResponse(issueResponse);

      await client.issue({
        owner: "test-owner",
        expiresAt,
      });

      expect(getCalls()[1]?.options?.body).toBe(
        JSON.stringify({ owner: "test-owner", expiresAt }),
      );
    });

    it("should handle invalid issue response schema", async () => {
      const invalidResponse = new MockResponse({
        json: { invalid: "response" },
      });

      addResponse(mockAuthResponse);
      addResponse(invalidResponse);

      await expect(client.issue({ owner: "test-owner" })).rejects.toThrow(
        "Invalid issue token response",
      );
    });
  });

  describe("register", () => {
    const mockTokenRecord = {
      tokenId: "abc123def456ghi789jkl",
      owner: "test-owner",
      isAdmin: false,
      createdAt: Date.now(),
      lastUsedAt: null,
      expiresAt: null,
    };

    it("should register token successfully", async () => {
      const registerResponse = new MockResponse({
        json: {
          record: mockTokenRecord,
        },
      });

      addResponse(mockAuthResponse);
      addResponse(registerResponse);

      const result = await client.register({
        tokenId: "abc123def456ghi789jkl",
        secretPhc: "test-secret-phc",
        owner: "test-owner",
      });

      expect(result).toEqual(mockTokenRecord);
      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens/abc123def456ghi789jkl",
        options: {
          method: "PUT",
          headers: {
            Authorization: "Bearer test-jwt-token",
            "Content-Type": "application/json",
          },
        },
      });
    });

    it("should handle register token failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.register({
          tokenId: "abc123def456ghi789jkl",
          secretPhc: "test-secret-phc",
          owner: "test-owner",
        });
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe(
          "Failed to register token abc123def456ghi789jkl",
        );
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Bad Request");
      }
    });

    it("should support all optional fields (isAdmin, expiresAt)", async () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 7200;
      const registerResponse = new MockResponse({
        json: {
          record: {
            ...mockTokenRecord,
            isAdmin: true,
            expiresAt,
          },
        },
      });

      addResponse(mockAuthResponse);
      addResponse(registerResponse);

      const result = await client.register({
        tokenId: "abc123def456ghi789jkl",
        secretPhc: "test-secret-phc",
        owner: "test-owner",
        isAdmin: true,
        expiresAt,
      });

      expect(result.isAdmin).toBe(true);
      expect(result.expiresAt).toBe(expiresAt);
      const requestBody = JSON.parse(
        (getCalls()[1]?.options?.body as string) || "{}",
      ) as Record<string, unknown>;
      expect(requestBody).toEqual({
        secretPhc: "test-secret-phc",
        owner: "test-owner",
        isAdmin: true,
        expiresAt,
      });
    });

    it("should handle invalid register response schema", async () => {
      const invalidResponse = new MockResponse({
        json: { invalid: "response" },
      });

      addResponse(mockAuthResponse);
      addResponse(invalidResponse);

      await expect(
        client.register({
          tokenId: "abc123def456ghi789jkl",
          secretPhc: "test-secret-phc",
          owner: "test-owner",
        }),
      ).rejects.toThrow("Invalid register token response");
    });
  });

  describe("update", () => {
    it("should update token successfully", async () => {
      const updateResponse = new MockResponse({
        status: 204,
        statusText: "No Content",
      });

      addResponse(mockAuthResponse);
      addResponse(updateResponse);

      await client.update("abc123def456ghi789jkl", {
        owner: "new-owner",
      });

      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens/abc123def456ghi789jkl",
        options: {
          method: "PATCH",
          headers: {
            Authorization: "Bearer test-jwt-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ owner: "new-owner" }),
        },
      });
    });

    it("should handle update token failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.update("abc123def456ghi789jkl", { owner: "new-owner" });
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe(
          "Failed to update token abc123def456ghi789jkl",
        );
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Not Found");
      }
    });
  });

  describe("revoke", () => {
    it("should revoke token successfully", async () => {
      const revokeResponse = new MockResponse({
        status: 204,
        statusText: "No Content",
      });

      addResponse(mockAuthResponse);
      addResponse(revokeResponse);

      await client.revoke("abc123def456ghi789jkl");

      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens/abc123def456ghi789jkl/revoke",
        options: {
          method: "PUT",
          headers: {
            Authorization: "Bearer test-jwt-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      });
    });

    it("should support optional expiresAt", async () => {
      const revokeResponse = new MockResponse({
        status: 204,
        statusText: "No Content",
      });

      addResponse(mockAuthResponse);
      addResponse(revokeResponse);

      const expiresAt = Date.now() + 3600000;
      await client.revoke("abc123def456ghi789jkl", { expiresAt });

      expect(getCalls()[1]?.options?.body).toBe(JSON.stringify({ expiresAt }));
    });

    it("should handle revoke token failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.revoke("abc123def456ghi789jkl");
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe(
          "Failed to revoke token abc123def456ghi789jkl",
        );
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Not Found");
      }
    });
  });

  describe("restore", () => {
    it("should restore token successfully", async () => {
      const restoreResponse = new MockResponse({
        status: 204,
        statusText: "No Content",
      });

      addResponse(mockAuthResponse);
      addResponse(restoreResponse);

      await client.restore("abc123def456ghi789jkl");

      expect(getCalls()).toHaveLength(2);
      expect(getCalls()[1]).toMatchObject({
        url: "https://api.example.com/admin/tokens/abc123def456ghi789jkl/restore",
        options: {
          method: "PUT",
          headers: {
            Authorization: "Bearer test-jwt-token",
          },
        },
      });
    });

    it("should handle restore token failure", async () => {
      const errorResponse = new MockResponse({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      addResponse(mockAuthResponse);
      addResponse(errorResponse);

      try {
        await client.restore("abc123def456ghi789jkl");
        throw new Error("Expected error to be thrown");
      } catch (err) {
        assert(err instanceof Error);
        expect(err.message).toBe(
          "Failed to restore token abc123def456ghi789jkl",
        );
        expect(typeof err.cause).toBe("string");
        expect(err.cause).toBe("Not Found");
      }
    });
  });
});
