import assert from "assert";
import { randomUUID } from "crypto";
import { setTimeout as sleep } from "timers/promises";

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { id62 } from "id62";

import { DynamoDBPat } from "../DynamoDBPat";

const tableWaitCreateTimeMs = 30_000;

async function createTokenTable(
  ddbClient: DynamoDBClient,
  tableName: string,
): Promise<void> {
  await ddbClient.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [
        {
          AttributeName: "tokenId",
          KeyType: "HASH",
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: "tokenId",
          AttributeType: "S",
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  await waitUntilTableExists(
    {
      client: ddbClient,
      maxWaitTime: tableWaitCreateTimeMs / 1000,
    },
    {
      TableName: tableName,
    },
  );

  await ddbClient.send(
    new UpdateTimeToLiveCommand({
      TableName: tableName,
      TimeToLiveSpecification: {
        AttributeName: "expiresAt",
        Enabled: true,
      },
    }),
  );
}

describe("DynamoDBPat integration", () => {
  let ddbClient: DynamoDBClient;
  let pat: DynamoDBPat;

  const runId = randomUUID();
  const tableName = `test-pat-${runId}`;
  const tokenPrefix = "test_pat_";

  beforeAll(async () => {
    // Configure AWS clients to use localstack and ensure no env vars interfere
    const clientConfig = {
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      credentials: { accessKeyId: "test", secretAccessKey: "test" },
    };

    ddbClient = new DynamoDBClient(clientConfig);

    await createTokenTable(ddbClient, tableName);

    pat = new DynamoDBPat({
      ddbClient,
      tableName,
      tokenPrefix,
    });
  }, tableWaitCreateTimeMs);

  afterAll(async () => {
    await ddbClient.send(
      new DeleteTableCommand({
        TableName: tableName,
      }),
    );
  });

  describe("setup", () => {
    it("should have created test table with proper schema", async () => {
      const tableDesc = await ddbClient.send(
        new DescribeTableCommand({ TableName: tableName }),
      );

      expect(tableDesc.Table?.TableName).toBe(tableName);
      expect(tableDesc.Table?.TableStatus).toBe("ACTIVE");
      expect(tableDesc.Table?.KeySchema).toEqual([
        {
          AttributeName: "tokenId",
          KeyType: "HASH",
        },
      ]);

      const count = await pat.getCount();
      expect(count).toBe(0);
    });
  });

  describe("issue", () => {
    it("should generate token with random ID", async () => {
      const owner = "test-user-1";
      const config = {
        owner,
        isAdmin: false,
      };

      const { token } = await pat.issue(config);
      expect(token).toMatch(
        new RegExp(`^${tokenPrefix}[a-zA-Z0-9]{21}\\.[a-zA-Z0-9+/_=-]+$`),
      );

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.owner).toBe(owner);
      expect(verifyResult.record.isAdmin).toBe(false);
    });

    it("should generate token with specific ID", async () => {
      const tokenId = "specificTokenId123456";
      const owner = "test-user-2";
      const config = {
        tokenId,
        owner,
        isAdmin: true,
      };

      const { token } = await pat.issue(config);
      expect(token).toBe(`${tokenPrefix}${tokenId}.` + token.split(".")[1]);

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.tokenId).toBe(tokenId);
      expect(verifyResult.record.owner).toBe(owner);
      expect(verifyResult.record.isAdmin).toBe(true);
    });

    it("should create admin user token", async () => {
      const owner = "admin-user";
      const config = {
        owner,
        isAdmin: true,
      };

      const { token } = await pat.issue(config);

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.owner).toBe(owner);
      expect(verifyResult.record.isAdmin).toBe(true);
    });

    it("should create non-admin user token by default", async () => {
      const owner = "regular-user";
      const config = {
        owner,
      };

      const { token } = await pat.issue(config);

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.owner).toBe(owner);
      expect(verifyResult.record.isAdmin).toBe(false);
    });

    it("should fail with duplicate token ID", async () => {
      const tokenId = "duplicateToken1234567";

      await pat.issue({
        tokenId,
        owner: "user1",
      });

      await expect(
        pat.issue({
          tokenId,
          owner: "user2",
        }),
      ).rejects.toThrow(`Token ID already exists: ${tokenId}`);
    });

    it("should create token with expiresAt", async () => {
      const owner = "expiry-test-user";
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      const config = {
        owner,
        isAdmin: false,
        expiresAt: futureTimestamp,
      };

      const { token, record } = await pat.issue(config);

      expect(record.expiresAt).toBe(futureTimestamp);

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.expiresAt).toBe(futureTimestamp);
    });

    it("should create token with roles", async () => {
      const owner = "roles-test-user";
      const roles = ["reader", "writer"];
      const { token, record } = await pat.issue({
        owner,
        roles,
      });

      expect(record.roles).toEqual(roles);

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(expect.arrayContaining(roles));
      expect(verifyResult.record.roles).toHaveLength(roles.length);
    });
  });

  describe("register", () => {
    it("should register token with expiresAt", async () => {
      const tokenId = "registerExpiry1234567";
      const secretPhc = "$fake";
      const owner = "register-expiry-user";
      const futureTimestamp = Math.floor(Date.now() / 1000) + 7200;

      const record = await pat.register({
        tokenId,
        secretPhc,
        owner,
        isAdmin: true,
        expiresAt: futureTimestamp,
      });

      expect(record.tokenId).toBe(tokenId);
      expect(record.secretPhc).toBe(secretPhc);
      expect(record.owner).toBe(owner);
      expect(record.isAdmin).toBe(true);
      expect(record.expiresAt).toBe(futureTimestamp);
    });

    it("should register token with roles", async () => {
      const tokenId = "registerRoles12345678";
      const secretPhc = "$fake";
      const owner = "register-roles-user";
      const roles = ["admin", "moderator"];

      const record = await pat.register({
        tokenId,
        secretPhc,
        owner,
        roles,
      });

      expect(record.tokenId).toBe(tokenId);
      expect(record.roles).toEqual(expect.arrayContaining(roles));
      expect(record.roles).toHaveLength(roles.length);
    });
  });

  describe("verify", () => {
    it("should verify valid token and update lastUsedAt", async () => {
      const beforeCreation = Math.floor(Date.now() / 1000);

      const owner = "verify-test-user";
      const { token } = await pat.issue({
        owner,
        isAdmin: false,
      });

      // First verification should update lastUsedAt
      const result1 = await pat.verify(token);
      assert(result1.valid);
      expect(result1.record.owner).toBe(owner);
      expect(result1.record.isAdmin).toBe(false);
      expect(result1.record.createdAt).toBeGreaterThanOrEqual(beforeCreation);
      expect(result1.record.lastUsedAt).toBeGreaterThanOrEqual(beforeCreation);

      // Wait to ensure different timestamp
      await sleep(2000);

      // Second verification should show updated lastUsedAt
      const result2 = await pat.verify(token);
      assert(result2.valid);
      assert(result1.record.lastUsedAt);
      assert(result2.record.lastUsedAt);
      expect(result2.record.lastUsedAt).toBeGreaterThan(
        result1.record.lastUsedAt,
      );
    });

    it("should fail verification of revoked token", async () => {
      const { token } = await pat.issue({
        owner: "revoked-test-user",
      });

      // Verify it works initially
      const result1 = await pat.verify(token);
      assert(result1.valid);

      // Revoke the token
      await pat.revoke(result1.record.tokenId);

      // Verification should now fail
      const result2 = await pat.verify(token);
      assert(!result2.valid);
      expect(result2.reason).toBe("revoked");
    });

    it("should fail verification of expired token", async () => {
      const { token } = await pat.issue({
        owner: "expired-test-user",
      });

      // Get token ID and set expiration in the past
      const result1 = await pat.verify(token);
      assert(result1.valid);

      // Set expiration in the past (1 hour ago)
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
      await pat.update(result1.record.tokenId, { expiresAt: pastTimestamp });

      // Verification should now fail
      const result2 = await pat.verify(token);
      assert(!result2.valid);
      expect(result2.reason).toBe("expired");
    });

    it("should fail verification of non-existent token", async () => {
      const fakeToken = "test_pat_nonExistentToken12345.dGVzdCBzZWNyZXQ=";

      const result = await pat.verify(fakeToken);
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should fail verification with malformed tokens", async () => {
      const validTokenId = id62();

      // Wrong prefix
      const wrongPrefix = `wrong_pat_${validTokenId}.dGVzdCBzZWNyZXQ=`;
      const result1 = await pat.verify(wrongPrefix);
      assert(!result1.valid);
      expect(result1.reason).toBe("invalid_prefix");

      // Invalid format (no dot separator)
      const noDot = `${tokenPrefix}${validTokenId}`;
      const result2 = await pat.verify(noDot);
      assert(!result2.valid);
      expect(result2.reason).toBe("invalid_format");

      // Invalid token ID format
      const invalidId = `${tokenPrefix}invalidTokenId123.dGVzdCBzZWNyZXQ=`;
      const result3 = await pat.verify(invalidId);
      assert(!result3.valid);
      expect(result3.reason).toBe("invalid_format");

      // Invalid base64 secret
      const invalidSecret = `${tokenPrefix}${validTokenId}.!base64!`;
      const result4 = await pat.verify(invalidSecret);
      assert(!result4.valid);
      expect(result4.reason).toBe("invalid_format");
    });

    it("should fail verification with wrong secret", async () => {
      const { token } = await pat.issue({
        owner: "wrong-secret-user",
      });

      // Create a new token with same ID but different secret
      const tokenParts = token.split(".");
      // "wrongSecret" in base64
      const wrongToken = `${tokenParts[0]}.d3JvbmdTZWNyZXQ=`;

      const result = await pat.verify(wrongToken);
      assert(!result.valid);
      expect(result.reason).toBe("invalid_secret");
    });
  });

  describe("revoke", () => {
    it("should revoke token and set revokedAt timestamp", async () => {
      const { token } = await pat.issue({
        owner: "revoke-test-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);

      await pat.revoke(verifyResult.record.tokenId);

      const revokedResult = await pat.verify(token);
      assert(!revokedResult.valid);
      expect(revokedResult.reason).toBe("revoked");
      expect(revokedResult.record).toBeDefined();
    });

    it("should revoke token with expiration time", async () => {
      const { token } = await pat.issue({
        owner: "revoke-with-expiry-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await pat.revoke(verifyResult.record.tokenId, {
        expiresAt: futureTimestamp,
      });

      // Token should be revoked immediately regardless of expiration
      const revokedResult = await pat.verify(token);
      assert(!revokedResult.valid);
      expect(revokedResult.reason).toBe("revoked");
      expect(revokedResult.record).toBeDefined();
    });

    it("should be idempotent when revoking already revoked token", async () => {
      const { token } = await pat.issue({
        owner: "double-revoke-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      // First revocation
      await pat.revoke(tokenId);

      // Second revocation should silently succeed (idempotent behavior)
      await pat.revoke(tokenId);

      // Token should still be revoked
      const revokedResult = await pat.verify(token);
      assert(!revokedResult.valid);
      expect(revokedResult.reason).toBe("revoked");
      expect(revokedResult.record).toBeDefined();
    });

    it("should throw on non-existent token", async () => {
      const tokenId = "nonExistentToken12345";
      await expect(pat.revoke(tokenId)).rejects.toThrow(
        `Token not found: ${tokenId}`,
      );
    });
  });

  describe("restore", () => {
    it("should restore revoked token", async () => {
      const { token } = await pat.issue({
        owner: "restore-test-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);

      await pat.revoke(verifyResult.record.tokenId);

      const revokedResult = await pat.verify(token);
      assert(!revokedResult.valid);
      expect(revokedResult.reason).toBe("revoked");

      await pat.restore(verifyResult.record.tokenId);

      const restoredResult = await pat.verify(token);
      assert(restoredResult.valid);
    });

    it("should be idempotent when restoring non-revoked token", async () => {
      const { token } = await pat.issue({
        owner: "idempotent-restore-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      // First restore (should be no-op since not revoked)
      await pat.restore(tokenId);

      // Second restore should also be no-op
      await pat.restore(tokenId);

      const finalResult = await pat.verify(token);
      assert(finalResult.valid);
    });

    it("should throw on non-existent token", async () => {
      const tokenId = "nonExistentToken12345";
      await expect(pat.restore(tokenId)).rejects.toThrow(
        `Token not found: ${tokenId}`,
      );
    });
  });

  describe("update", () => {
    it("should update secret hash", async () => {
      const { token } = await pat.issue({
        owner: "update-secret-hash-user",
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      const { token: newToken, secretPhc } = await pat.generate({ tokenId });
      await pat.update(tokenId, { secretPhc });

      const verifyResult2 = await pat.verify(newToken);
      assert(verifyResult2.valid);
    });

    it("should throw on invalid secret hash", async () => {
      const { token } = await pat.issue({
        owner: "invalid-secret-hash-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      await expect(
        pat.update(tokenId, { secretPhc: "invalid-phc" }),
      ).rejects.toThrow("Invalid secret PHC string");
    });

    it("should update token owner", async () => {
      const { token } = await pat.issue({
        owner: "original-owner",
        isAdmin: false,
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      const owner = "updated-owner";
      await pat.update(tokenId, { owner });

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.owner).toBe(owner);
      expect(verifyResult2.record.isAdmin).toBe(false);
    });

    it("should update token admin status", async () => {
      const owner = "admin-update-user";
      const { token } = await pat.issue({
        owner,
        isAdmin: false,
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      await pat.update(tokenId, { isAdmin: true });

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.owner).toBe(owner);
      expect(verifyResult2.record.isAdmin).toBe(true);
    });

    it("should update token expiration", async () => {
      const { token } = await pat.issue({
        owner: "expiry-update-user",
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      // Set expiration to future
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await pat.update(tokenId, { expiresAt: futureTimestamp });

      // Token should still be valid
      const verifyResult2 = await pat.verify(token);
      expect(verifyResult2.valid).toBe(true);

      // Set expiration to past
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
      await pat.update(tokenId, { expiresAt: pastTimestamp });

      // Token should now be expired
      const verifyResult3 = await pat.verify(token);
      assert(!verifyResult3.valid);
      expect(verifyResult3.reason).toBe("expired");
      expect(verifyResult3.record).toBeDefined();
    });

    it("should clear token expiration", async () => {
      const {
        token,
        record: { tokenId },
      } = await pat.issue({
        owner: "expiry-clear-user",
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await pat.update(tokenId, { expiresAt: futureTimestamp });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      expect(verifyResult1.record.expiresAt).toBe(futureTimestamp);

      await pat.update(tokenId, { expiresAt: null });

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.expiresAt).toBeNull();
    });

    it("should handle partial updates with undefined values", async () => {
      const { token } = await pat.issue({
        owner: "partial-update-user",
        isAdmin: false,
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      const owner = "new-owner";
      await pat.update(tokenId, {
        owner,
        isAdmin: undefined,
        expiresAt: undefined,
      });

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.owner).toBe(owner);
      expect(verifyResult2.record.isAdmin).toBe(false);
    });

    it("should handle empty update object", async () => {
      const owner = "empty-update-user";
      const { token } = await pat.issue({ owner });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      await pat.update(tokenId, {});

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.owner).toBe(owner);
    });

    it("should handle update with all undefined values", async () => {
      const owner = "undefined-update-user";
      const { token } = await pat.issue({
        owner,
        isAdmin: true,
      });

      const verifyResult1 = await pat.verify(token);
      assert(verifyResult1.valid);
      const { tokenId } = verifyResult1.record;

      await pat.update(tokenId, {
        owner: undefined,
        isAdmin: undefined,
        expiresAt: undefined,
      });

      const verifyResult2 = await pat.verify(token);
      assert(verifyResult2.valid);
      expect(verifyResult2.record.owner).toBe(owner);
      expect(verifyResult2.record.isAdmin).toBe(true);
    });

    it("should throw updating non-existent token", async () => {
      const tokenId = "nonExistentToken12345";
      await expect(pat.update(tokenId, { isAdmin: true })).rejects.toThrow(
        `Token not found: ${tokenId}`,
      );
    });

    it("should not throw on empty update of non-existent token", async () => {
      const tokenId = "nonExistentToken12345";
      await expect(pat.update(tokenId, {})).resolves.not.toThrow();
    });
  });

  describe("roles", () => {
    it("should replace all roles with array", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-replace-user",
        roles: ["reader", "writer"],
      });

      expect(record.roles).toEqual(
        expect.arrayContaining(["reader", "writer"]),
      );

      await pat.update(record.tokenId, { roles: ["admin", "superuser"] });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["admin", "superuser"]),
      );
      expect(verifyResult.record.roles).toHaveLength(2);
    });

    it("should clear all roles with empty array", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-clear-user",
        roles: ["reader", "writer"],
      });

      expect(record.roles).toHaveLength(2);

      await pat.update(record.tokenId, { roles: [] });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toBeUndefined();
    });

    it("should add roles atomically", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-add-user",
        roles: ["reader"],
      });

      await pat.update(record.tokenId, { roles: { add: ["writer", "admin"] } });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["reader", "writer", "admin"]),
      );
      expect(verifyResult.record.roles).toHaveLength(3);
    });

    it("should add roles to token with no existing roles", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-add-empty-user",
      });

      expect(record.roles).toBeUndefined();

      await pat.update(record.tokenId, {
        roles: { add: ["reader", "writer"] },
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["reader", "writer"]),
      );
      expect(verifyResult.record.roles).toHaveLength(2);
    });

    it("should remove roles atomically", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-remove-user",
        roles: ["reader", "writer", "admin"],
      });

      await pat.update(record.tokenId, { roles: { remove: ["writer"] } });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["reader", "admin"]),
      );
      expect(verifyResult.record.roles).toHaveLength(2);
    });

    it("should handle removing non-existent roles", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-remove-nonexistent-user",
        roles: ["reader"],
      });

      await pat.update(record.tokenId, {
        roles: { remove: ["nonexistent-role"] },
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(["reader"]);
    });

    it("should add then remove roles in separate calls", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-add-remove-user",
        roles: ["reader", "writer"],
      });

      // Add first
      await pat.update(record.tokenId, { roles: { add: ["admin"] } });

      // Then remove
      await pat.update(record.tokenId, { roles: { remove: ["writer"] } });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["reader", "admin"]),
      );
      expect(verifyResult.record.roles).toHaveLength(2);
      expect(verifyResult.record.roles).not.toContain("writer");
    });

    it("should update roles and other fields atomically", async () => {
      const { token, record } = await pat.issue({
        owner: "atomic-update-user",
        isAdmin: false,
        roles: ["reader"],
      });

      await pat.update(record.tokenId, {
        owner: "new-atomic-update-user",
        isAdmin: true,
        roles: { add: ["admin"] },
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.owner).toBe("new-atomic-update-user");
      expect(verifyResult.record.isAdmin).toBe(true);
      expect(verifyResult.record.roles).toEqual(
        expect.arrayContaining(["reader", "admin"]),
      );
    });

    it("should replace roles and update other fields atomically", async () => {
      const { token, record } = await pat.issue({
        owner: "atomic-replace-user",
        isAdmin: false,
        roles: ["reader", "writer"],
      });

      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
      await pat.update(record.tokenId, {
        isAdmin: true,
        expiresAt: futureTimestamp,
        roles: ["superadmin"],
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.isAdmin).toBe(true);
      expect(verifyResult.record.expiresAt).toBe(futureTimestamp);
      expect(verifyResult.record.roles).toEqual(["superadmin"]);
    });

    it("should handle empty add array as no-op", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-empty-add-user",
        roles: ["reader"],
      });

      await pat.update(record.tokenId, { roles: { add: [] } });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(["reader"]);
    });

    it("should handle empty remove array as no-op", async () => {
      const { token, record } = await pat.issue({
        owner: "roles-empty-remove-user",
        roles: ["reader"],
      });

      await pat.update(record.tokenId, { roles: { remove: [] } });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      expect(verifyResult.record.roles).toEqual(["reader"]);
    });
  });

  describe("getCount", () => {
    it("should eventually return correct count after issuing tokens", async () => {
      const initialCount = await pat.getCount();

      // Issue multiple tokens
      await pat.issue({ owner: "count-user-1" });
      await pat.issue({ owner: "count-user-2" });
      await pat.issue({ owner: "count-user-3" });

      // DynamoDB count is eventually consistent, so we might need to wait
      let finalCount = await pat.getCount();
      let attempts = 0;
      while (finalCount !== initialCount + 3 && attempts < 10) {
        await sleep(500);
        finalCount = await pat.getCount();
        ++attempts;
      }

      expect(finalCount).toBe(initialCount + 3);
    });
  });

  describe("list", () => {
    it("should list all tokens excluding secretPhc field", async () => {
      // Create a separate table for listing tests to avoid interference
      const listTableName = `${tableName}-list`;
      const patForList = new DynamoDBPat({
        ddbClient,
        tableName: listTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, listTableName);

      try {
        // Issue several tokens with different properties
        const tokenId1 = id62();
        await patForList.issue({
          tokenId: tokenId1,
          owner: "user-1",
          isAdmin: false,
        });

        const tokenId2 = id62();
        await patForList.issue({
          tokenId: tokenId2,
          owner: "user-2",
          isAdmin: true,
        });

        const tokenId3 = id62();
        await patForList.issue({
          tokenId: tokenId3,
          owner: "user-3",
          isAdmin: false,
        });

        // Revoke one token
        await patForList.revoke(tokenId2);

        // Set expiration on another
        const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
        await patForList.update(tokenId3, {
          expiresAt: futureExpiry,
        });

        // Collect all tokens from the generator
        const tokens = [];
        for await (const token of patForList.list({ batchLimit: 100 })) {
          tokens.push(token);
        }

        // Should have 3 tokens
        expect(tokens).toHaveLength(3);

        // Find tokens by ID for easier testing
        const tokenMap = new Map(tokens.map((t) => [t.tokenId, t]));

        // Verify token 1 properties
        const listedToken1 = tokenMap.get(tokenId1);
        expect(listedToken1).toBeDefined();
        expect(listedToken1?.owner).toBe("user-1");
        expect(listedToken1?.isAdmin).toBe(false);
        expect(listedToken1?.createdAt).toBeGreaterThan(0);
        expect(listedToken1?.revokedAt).toBeUndefined();
        expect(listedToken1?.expiresAt).toBeUndefined();
        expect(listedToken1).not.toHaveProperty("secretPhc");

        // Verify token 2 properties (revoked)
        const listedToken2 = tokenMap.get(tokenId2);
        expect(listedToken2).toBeDefined();
        expect(listedToken2?.owner).toBe("user-2");
        expect(listedToken2?.isAdmin).toBe(true);
        expect(listedToken2?.revokedAt).toBeGreaterThan(0);
        expect(listedToken2).not.toHaveProperty("secretPhc");

        // Verify token 3 properties (with expiration)
        const listedToken3 = tokenMap.get(tokenId3);
        expect(listedToken3).toBeDefined();
        expect(listedToken3?.owner).toBe("user-3");
        expect(listedToken3?.isAdmin).toBe(false);
        expect(listedToken3?.expiresAt).toBe(futureExpiry);
        expect(listedToken3).not.toHaveProperty("secretPhc");
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: listTableName,
          }),
        );
      }
    });

    it("should filter tokens by role using hasRole option", async () => {
      const rolesTableName = `${tableName}-roles-filter`;
      const patForRoles = new DynamoDBPat({
        ddbClient,
        tableName: rolesTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, rolesTableName);

      try {
        // Create tokens with different roles
        const tokenId1 = id62();
        await patForRoles.issue({
          tokenId: tokenId1,
          owner: "user-1",
          roles: ["reader", "writer"],
        });

        const tokenId2 = id62();
        await patForRoles.issue({
          tokenId: tokenId2,
          owner: "user-2",
          roles: ["admin"],
        });

        const tokenId3 = id62();
        await patForRoles.issue({
          tokenId: tokenId3,
          owner: "user-3",
          roles: ["reader"],
        });

        const tokenId4 = id62();
        await patForRoles.issue({
          tokenId: tokenId4,
          owner: "user-4",
          // No roles
        });

        // Filter by "reader" role - should get 2 tokens
        const readerTokens = [];
        for await (const token of patForRoles.list({ hasRole: "reader" })) {
          readerTokens.push(token);
        }
        expect(readerTokens).toHaveLength(2);
        const readerIds = new Set(readerTokens.map((t) => t.tokenId));
        expect(readerIds.has(tokenId1)).toBe(true);
        expect(readerIds.has(tokenId3)).toBe(true);

        // Filter by "admin" role - should get 1 token
        const adminTokens = [];
        for await (const token of patForRoles.list({ hasRole: "admin" })) {
          adminTokens.push(token);
        }
        expect(adminTokens).toHaveLength(1);
        expect(adminTokens[0].tokenId).toBe(tokenId2);

        // Filter by "writer" role - should get 1 token
        const writerTokens = [];
        for await (const token of patForRoles.list({ hasRole: "writer" })) {
          writerTokens.push(token);
        }
        expect(writerTokens).toHaveLength(1);
        expect(writerTokens[0].tokenId).toBe(tokenId1);

        // Filter by non-existent role - should get 0 tokens
        const noTokens = [];
        for await (const token of patForRoles.list({
          hasRole: "nonexistent",
        })) {
          noTokens.push(token);
        }
        expect(noTokens).toHaveLength(0);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: rolesTableName,
          }),
        );
      }
    });

    it("should support pagination and including secret PHC", async () => {
      // Create a separate table for pagination tests
      const paginationTableName = `${tableName}-pagination`;
      const patForPagination = new DynamoDBPat({
        ddbClient,
        tableName: paginationTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, paginationTableName);

      try {
        // Issue 10 tokens to have enough data for pagination
        const tokenIds: string[] = [];
        for (let i = 0; i < 10; i++) {
          const tokenId = i.toString().padStart(21, "0");
          await patForPagination.register({
            tokenId,
            secretPhc: "$fake",
            owner: `user-${i}`,
            // Use undefined instead of false for coverage
            isAdmin: i === 0 || undefined,
          });
          tokenIds.push(tokenId);
        }

        // Get first 3 tokens to establish a starting point
        const firstPage = [];
        const firstPageGen = patForPagination.list({
          limit: 3,
          includeSecretPhc: true,
        });
        for await (const token of firstPageGen) {
          firstPage.push(token);
        }

        expect(firstPage).toHaveLength(3);

        // Fetch a page in the middle using both pagination options
        const middlePage = [];
        const middlePageGen = patForPagination.list({
          limit: 2,
          afterTokenId: firstPage[2].tokenId,
          includeSecretPhc: true,
        });
        for await (const token of middlePageGen) {
          middlePage.push(token);
        }

        expect(middlePage).toHaveLength(2);

        // Fetch the remaining tokens using afterTokenId only
        const lastPageGen = patForPagination.list({
          afterTokenId: middlePage[1].tokenId,
          includeSecretPhc: true,
        });
        const lastPage = [];
        for await (const token of lastPageGen) {
          lastPage.push(token);
        }

        expect(lastPage).toHaveLength(5);

        const allPages = firstPage.concat(middlePage, lastPage);

        // Verify all tokens are different
        const allIds = new Set(allPages.map((t) => t.tokenId));
        expect(allIds.size).toBe(10);

        // Verify secretPhc presence based on request
        expect(allPages.every((t) => t.secretPhc)).toBe(true);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: paginationTableName,
          }),
        );
      }
    });

    it("should handle empty table", async () => {
      // Create a separate empty table
      const emptyTableName = `${tableName}-empty`;
      const patForEmpty = new DynamoDBPat({
        ddbClient,
        tableName: emptyTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, emptyTableName);

      try {
        const tokens = [];
        for await (const token of patForEmpty.list()) {
          tokens.push(token);
        }

        expect(tokens).toHaveLength(0);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: emptyTableName,
          }),
        );
      }
    });

    it("should handle large table with multiple scans", async () => {
      // Create a separate large table
      const largeTableName = `${tableName}-large`;
      const patForLarge = new DynamoDBPat({
        ddbClient,
        tableName: largeTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, largeTableName);

      try {
        // Create all token records
        const tokenCount = 500;
        const unixNow = Math.floor(Date.now() / 1000);
        const records = [];
        for (let i = 0; i < tokenCount; i++) {
          const tokenId = i.toString().padStart(21, "0");
          records.push({
            tokenId,
            secretPhc: "$fake",
            owner: `user-${i}`,
            isAdmin: false,
            createdAt: unixNow + i,
          });
        }

        // Use DynamoDB's BatchWriteCommand for efficient bulk inserts
        const docClient = DynamoDBDocumentClient.from(ddbClient);
        // DynamoDB limit per batch request
        const BATCH_SIZE = 25;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE);
          const putRequests = batch.map((record) => ({
            PutRequest: {
              Item: record,
            },
          }));
          await docClient.send(
            new BatchWriteCommand({
              RequestItems: {
                [largeTableName]: putRequests,
              },
            }),
          );
        }

        const tokens = [];
        for await (const token of patForLarge.list({
          batchLimit: 100,
          limit: 1000,
        })) {
          tokens.push(token);
        }

        expect(tokens).toHaveLength(tokenCount);

        // Verify all tokens are different
        const allIds = new Set(tokens.map((t) => t.tokenId));
        expect(allIds.size).toBe(tokenCount);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: largeTableName,
          }),
        );
      }
    });
  });

  describe("batchLoad", () => {
    it("should batch load existing tokens without secretPhc", async () => {
      const batchTableName = `${tableName}-batch`;
      const patForBatch = new DynamoDBPat({
        ddbClient,
        tableName: batchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, batchTableName);

      try {
        const tokenIds = new Set<string>();
        for (let i = 0; i < 5; i++) {
          const tokenId = i.toString().padStart(21, "0");
          await patForBatch.register({
            tokenId,
            secretPhc: "$fake",
            owner: `batch-user-${i}`,
            isAdmin: i % 2 === 0,
          });
          tokenIds.add(tokenId);
        }

        const result = await patForBatch.batchLoad(tokenIds);

        expect(result.found).toHaveLength(5);
        expect(result.notFound).toHaveLength(0);

        result.found.forEach((token) => {
          expect(token).not.toHaveProperty("secretPhc");
          expect(token.tokenId).toBeDefined();
          expect(token.owner).toBeDefined();
          expect(token.isAdmin).toBeDefined();
          expect(token.createdAt).toBeGreaterThan(0);
        });
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: batchTableName,
          }),
        );
      }
    });

    it("should batch load tokens with secretPhc when requested", async () => {
      const batchTableName = `${tableName}-batch-secret`;
      const patForBatch = new DynamoDBPat({
        ddbClient,
        tableName: batchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, batchTableName);

      try {
        const tokenIds = new Set<string>();
        const secretPhc = "$scrypt$ln=15,r=8,p=1$abcd$efgh";
        for (let i = 0; i < 3; i++) {
          const tokenId = i.toString().padStart(21, "0");
          await patForBatch.register({
            tokenId,
            secretPhc,
            owner: `secret-user-${i}`,
          });
          tokenIds.add(tokenId);
        }

        const result = await patForBatch.batchLoad(tokenIds, {
          includeSecretPhc: true,
        });

        expect(result.found).toHaveLength(3);
        expect(result.notFound).toHaveLength(0);
        expect(result.found.every((t) => t.secretPhc)).toBe(true);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: batchTableName,
          }),
        );
      }
    });

    it("should identify tokens that do not exist", async () => {
      const batchTableName = `${tableName}-batch-notfound`;
      const patForBatch = new DynamoDBPat({
        ddbClient,
        tableName: batchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, batchTableName);

      try {
        const existingTokenId = "0".repeat(21);
        await patForBatch.register({
          tokenId: existingTokenId,
          secretPhc: "$fake",
          owner: "existing-user",
        });

        const nonExistentIds = [id62(), id62(), id62()];

        const result = await patForBatch.batchLoad(
          new Set([existingTokenId, ...nonExistentIds]),
        );

        expect(result.found).toHaveLength(1);
        expect(result.found[0].tokenId).toBe(existingTokenId);
        expect(result.notFound).toHaveLength(3);
        expect(result.notFound).toEqual(expect.arrayContaining(nonExistentIds));
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: batchTableName,
          }),
        );
      }
    });

    it("should handle empty token ID set", async () => {
      const result = await pat.batchLoad(new Set());

      expect(result.found).toHaveLength(0);
      expect(result.notFound).toHaveLength(0);
    });

    it("should load tokens with various states", async () => {
      const batchTableName = `${tableName}-batch-states`;
      const patForBatch = new DynamoDBPat({
        ddbClient,
        tableName: batchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, batchTableName);

      try {
        const activeTokenId = "active000000000000000";
        await patForBatch.register({
          tokenId: activeTokenId,
          secretPhc: "$fake",
          owner: "active-user",
        });

        const revokedTokenId = "revoked00000000000000";
        await patForBatch.register({
          tokenId: revokedTokenId,
          secretPhc: "$fake",
          owner: "revoked-user",
        });
        await patForBatch.revoke(revokedTokenId);

        const expiredTokenId = "expired00000000000000";
        await patForBatch.register({
          tokenId: expiredTokenId,
          secretPhc: "$fake",
          owner: "expired-user",
        });
        const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;
        await patForBatch.update(expiredTokenId, {
          expiresAt: pastTimestamp,
        });

        const futureExpiryTokenId = "future000000000000000";
        await patForBatch.register({
          tokenId: futureExpiryTokenId,
          secretPhc: "$fake",
          owner: "future-expiry-user",
        });
        const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
        await patForBatch.update(futureExpiryTokenId, {
          expiresAt: futureTimestamp,
        });

        const tokenIds = new Set([
          activeTokenId,
          revokedTokenId,
          expiredTokenId,
          futureExpiryTokenId,
        ]);

        const result = await patForBatch.batchLoad(tokenIds);

        expect(result.found).toHaveLength(4);
        expect(result.notFound).toHaveLength(0);

        const tokenMap = new Map(result.found.map((t) => [t.tokenId, t]));

        const active = tokenMap.get(activeTokenId);
        expect(active?.revokedAt).toBeUndefined();
        expect(active?.expiresAt).toBeUndefined();

        const revoked = tokenMap.get(revokedTokenId);
        expect(revoked?.revokedAt).toBeGreaterThan(0);

        const expired = tokenMap.get(expiredTokenId);
        expect(expired?.expiresAt).toBe(pastTimestamp);

        const futureExpiry = tokenMap.get(futureExpiryTokenId);
        expect(futureExpiry?.expiresAt).toBe(futureTimestamp);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: batchTableName,
          }),
        );
      }
    });

    it("should handle batch sizes larger than 100 items", async () => {
      const largeBatchTableName = `${tableName}-batch-large`;
      const patForLargeBatch = new DynamoDBPat({
        ddbClient,
        tableName: largeBatchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, largeBatchTableName);

      try {
        const tokenCount = 250;
        const unixNow = Math.floor(Date.now() / 1000);
        const records = [];
        const tokenIds = new Set<string>();

        for (let i = 0; i < tokenCount; i++) {
          const tokenId = i.toString().padStart(21, "0");
          records.push({
            tokenId,
            secretPhc: "$fake",
            owner: `large-batch-user-${i}`,
            isAdmin: i % 10 === 0,
            createdAt: unixNow + i,
          });
          tokenIds.add(tokenId);
        }

        const docClient = DynamoDBDocumentClient.from(ddbClient);
        const BATCH_SIZE = 25;
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          const batch = records.slice(i, i + BATCH_SIZE);
          const putRequests = batch.map((record) => ({
            PutRequest: {
              Item: record,
            },
          }));
          await docClient.send(
            new BatchWriteCommand({
              RequestItems: {
                [largeBatchTableName]: putRequests,
              },
            }),
          );
        }

        const result = await patForLargeBatch.batchLoad(tokenIds, {
          includeSecretPhc: true,
        });

        expect(result.found).toHaveLength(tokenCount);
        expect(result.notFound).toHaveLength(0);

        const allIds = new Set(result.found.map((t) => t.tokenId));
        expect(allIds.size).toBe(tokenCount);

        expect(result.found.every((t) => t.secretPhc)).toBe(true);
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: largeBatchTableName,
          }),
        );
      }
    });

    it("should handle mixed found and not found in large batch", async () => {
      const mixedBatchTableName = `${tableName}-batch-mixed`;
      const patForMixedBatch = new DynamoDBPat({
        ddbClient,
        tableName: mixedBatchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, mixedBatchTableName);

      try {
        const existingTokenIds = [];
        for (let i = 0; i < 50; i++) {
          const tokenId = `exist${i.toString().padStart(16, "0")}`;
          await patForMixedBatch.register({
            tokenId,
            secretPhc: "$fake",
            owner: `mixed-user-${i}`,
          });
          existingTokenIds.push(tokenId);
        }

        const nonExistentIds = [];
        for (let i = 0; i < 50; i++) {
          nonExistentIds.push(id62());
        }

        const allIds = new Set([...existingTokenIds, ...nonExistentIds]);

        const result = await patForMixedBatch.batchLoad(allIds);

        expect(result.found).toHaveLength(50);
        expect(result.notFound).toHaveLength(50);

        const foundIds = new Set(result.found.map((t) => t.tokenId));
        existingTokenIds.forEach((id) => {
          expect(foundIds.has(id)).toBe(true);
        });

        const notFoundSet = new Set(result.notFound);
        nonExistentIds.forEach((id) => {
          expect(notFoundSet.has(id)).toBe(true);
        });
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: mixedBatchTableName,
          }),
        );
      }
    });

    it("should preserve lastUsedAt field when present", async () => {
      const batchTableName = `${tableName}-batch-lastused`;
      const patForBatch = new DynamoDBPat({
        ddbClient,
        tableName: batchTableName,
        tokenPrefix,
      });

      await createTokenTable(ddbClient, batchTableName);

      try {
        const { token, record } = await patForBatch.issue({
          owner: "last-used-user",
        });

        await patForBatch.verify(token);

        await sleep(1000);

        const result = await patForBatch.batchLoad(new Set([record.tokenId]));

        expect(result.found).toHaveLength(1);
        expect(result.found[0].lastUsedAt).toBeGreaterThan(0);
        expect(result.found[0].lastUsedAt).toBeGreaterThanOrEqual(
          result.found[0].createdAt,
        );
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: batchTableName,
          }),
        );
      }
    });
  });

  describe("bootstrap", () => {
    const bootstrapTableName = `${tableName}-bootstrap`;
    let patWithBootstrap: DynamoDBPat;
    let bootstrapToken: string;
    let bootstrapPhc: string;

    beforeAll(async () => {
      // Generate bootstrap credentials
      const bootstrap = await pat.generate();
      bootstrapToken = bootstrap.token;
      bootstrapPhc = bootstrap.secretPhc;

      // Create new PAT instance with bootstrap PHC
      patWithBootstrap = new DynamoDBPat({
        ddbClient,
        tableName: bootstrapTableName,
        tokenPrefix,
        bootstrapPhc,
      });

      // Create separate table for bootstrap tests
      await createTokenTable(ddbClient, bootstrapTableName);
    });

    afterAll(async () => {
      await ddbClient.send(
        new DeleteTableCommand({
          TableName: bootstrapTableName,
        }),
      );
    });

    it("should fail when no bootstrap PHC is configured", async () => {
      const patWithoutBootstrap = new DynamoDBPat({
        ddbClient,
        tableName: bootstrapTableName,
        tokenPrefix,
      });

      const result = await patWithoutBootstrap.bootstrap(bootstrapToken, {
        owner: "should-fail",
      });

      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should fail with wrong bootstrap secret", async () => {
      // Delete the first character of the secret to invalidate it
      const wrongToken = bootstrapToken.replace(/\../, ".");

      const result = await patWithBootstrap.bootstrap(wrongToken, {
        owner: "should-fail",
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBe("invalid_secret");
      }
    });

    it("should authenticate with empty table and valid bootstrap PHC", async () => {
      const owner = "bootstrap-admin";
      const result = await patWithBootstrap.bootstrap(bootstrapToken, {
        owner,
      });

      assert(result.valid);
      expect(result.record.owner).toBe(owner);
      expect(result.record.isAdmin).toBe(true);
      expect(result.record.tokenId).toBe(
        bootstrapToken.split(".")[0].replace(tokenPrefix, ""),
      );
    });

    it("should fail with non-empty table", async () => {
      const newBootstrap = await patWithBootstrap.generate();

      const result = await patWithBootstrap.bootstrap(newBootstrap.token, {
        owner: "second-bootstrap-admin",
      });

      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });
  });

  describe("Concurrent access tests", () => {
    it("should handle concurrent revoke", async () => {
      const { token } = await pat.issue({
        owner: "concurrent-revoke-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      // Attempt concurrent revocations
      const revokePromises = [
        pat.revoke(tokenId),
        pat.revoke(tokenId),
        pat.revoke(tokenId),
      ];

      // All should succeed
      await Promise.all(revokePromises);

      // Token should be revoked
      const finalResult = await pat.verify(token);
      assert(!finalResult.valid);
      expect(finalResult.reason).toBe("revoked");
    });

    it("should handle concurrent revoke and restore", async () => {
      const { token } = await pat.issue({
        owner: "concurrent-verify-revoke-user",
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      // Start concurrent operations
      const operations = [
        pat.revoke(tokenId),
        pat.restore(tokenId),
        pat.restore(tokenId),
        pat.revoke(tokenId),
        pat.revoke(tokenId),
        pat.restore(tokenId),
      ];

      // All should succeed
      await Promise.all(operations);

      // Status of token is indeterminate
    });

    it("should handle bootstrap race conditions", async () => {
      const bootstrap = await pat.generate();
      const tokenId = bootstrap.token.split(".")[0].replace(tokenPrefix, "");

      const raceTableName = `${tableName}-race`;
      const patForRace = new DynamoDBPat({
        ddbClient,
        tableName: raceTableName,
        tokenPrefix,
        bootstrapPhc: bootstrap.secretPhc,
      });

      await createTokenTable(ddbClient, raceTableName);
      try {
        // Attempt concurrent bootstrap operations with same token.
        // This will result in race condition where only one succeeds.
        const bootstrapPromises = [
          patForRace.bootstrap(bootstrap.token, { owner: "race-admin-1" }),
          patForRace.bootstrap(bootstrap.token, { owner: "race-admin-2" }),
          patForRace.bootstrap(bootstrap.token, { owner: "race-admin-3" }),
          patForRace.bootstrap(bootstrap.token, { owner: "race-admin-4" }),
        ];

        // Only one should succeed, others should reject with token ID conflict
        // or return a failure reason of `not-found`.
        const bootstrapResults = await Promise.allSettled(bootstrapPromises);
        const fulfilled = bootstrapResults
          .filter((r) => r.status === "fulfilled")
          .map((r) => r.value);
        const rejected = bootstrapResults
          .filter((r) => r.status === "rejected")
          .map((r): unknown => r.reason);
        const valid = fulfilled.filter((r) => r.valid);
        const invalid = fulfilled.filter((r) => !r.valid);
        expect(valid).toHaveLength(1);

        // Check that failures are due to duplicate token ID or `not-found.
        rejected.forEach((result) => {
          assert(result instanceof Error);
          expect(result.message).toBe(`Token ID already exists: ${tokenId}`);
        });
        invalid.forEach((result) => {
          expect(result.reason).toBe("not_found");
        });
      } finally {
        await ddbClient.send(
          new DeleteTableCommand({
            TableName: raceTableName,
          }),
        );
      }
    });

    it("should handle concurrent token creation with same ID", async () => {
      const duplicateId = id62();

      // Attempt concurrent token creation with same ID.
      const createPromises = [
        pat.issue({ tokenId: duplicateId, owner: "race-user-1" }),
        pat.issue({ tokenId: duplicateId, owner: "race-user-2" }),
        pat.issue({ tokenId: duplicateId, owner: "race-user-3" }),
      ];

      // Only one should succeed, others should fail.
      const results = await Promise.allSettled(createPromises);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);

      // Check that rejections are due to duplicate token ID.
      rejected.forEach((result) => {
        assert(result.reason instanceof Error);
        expect(result.reason.message).toContain("Token ID already exists");
      });

      // Verify the successful token works.
      const { token } = fulfilled[0].value;
      const verifyResult = await pat.verify(token);
      expect(verifyResult.valid).toBe(true);
    });

    it("should handle concurrent updates to same token", async () => {
      const owner = "concurrent-update-user";
      const { token } = await pat.issue({
        owner,
        isAdmin: false,
      });

      const verifyResult = await pat.verify(token);
      assert(verifyResult.valid);
      const { tokenId } = verifyResult.record;

      // Concurrent updates (avoiding owner field due to DDB reserved keyword)
      const updatePromises = [
        pat.update(tokenId, { isAdmin: true }),
        pat.update(tokenId, {
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        }),
        pat.update(tokenId, { isAdmin: false }),
        pat.update(tokenId, {
          expiresAt: Math.floor(Date.now() / 1000) + 7200,
        }),
      ];

      // All should complete without throwing
      await Promise.all(updatePromises);

      // Final verification should reflect some combination of updates
      const finalResult = await pat.verify(token);
      assert(finalResult.valid);
      expect(finalResult.record.owner).toBe(owner);
      expect(finalResult.record.expiresAt).toBeDefined();
    });
  });
});
