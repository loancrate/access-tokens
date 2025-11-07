import assert from "assert";

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

import { DynamoDBPat, MAX_OWNER_LENGTH } from "../index";

// Mock timers/promises to avoid actual delays during batchLoad tests
jest.mock("timers/promises", () => ({
  setTimeout: jest.fn(() => Promise.resolve()),
}));

describe("Error handling", () => {
  const docClientMock = mockClient(DynamoDBDocumentClient);

  const tableName = "test-tokens";
  const tokenId = "abcdefghijklmnopqrstu";
  const fakeToken = `pat_${tokenId}.xxx`;

  let pat: DynamoDBPat;

  beforeEach(() => {
    docClientMock.reset();

    pat = new DynamoDBPat({
      tableName,
    });
  });

  it("handles DescribeTableCommand returning undefined", async () => {
    docClientMock.on(DescribeTableCommand).resolves({});
    expect(await pat.getCount()).toBe(0);
  });

  it("handles ScanCommand returning an empty object", async () => {
    docClientMock.on(ScanCommand).resolves({});
    expect(await pat.list().next()).toStrictEqual({
      value: undefined,
      done: true,
    });
  });

  it("skips invalid records when listing tokens", async () => {
    docClientMock.on(ScanCommand).resolves({
      Items: [
        {
          tokenId,
          owner: "test-user",
          isAdmin: false,
          createdAt: Date.now(),
        },
      ],
    });
    expect(await pat.list().next()).toStrictEqual({
      value: undefined,
      done: true,
    });
  });

  it("handles invalid secretPhc attributes", async () => {
    docClientMock.on(GetCommand).resolves({
      Item: {
        tokenId,
        secretPhc: "invalid-secret-phc",
        owner: "test-user",
        isAdmin: false,
        createdAt: Date.now(),
      },
    });
    const result = await pat.verify(fakeToken);
    assert(!result.valid);
    expect(result.reason).toBe("invalid_phc");
    expect(result.cause).toBeInstanceOf(Error);
  });

  it("propagates unknown errors from revoke", async () => {
    const message = "Some unknown error";
    docClientMock.on(UpdateCommand).rejects(new Error(message));
    await expect(pat.revoke("xxx")).rejects.toThrow(message);
  });

  it("propagates unknown errors from restore", async () => {
    const message = "Some unknown error";
    docClientMock.on(UpdateCommand).rejects(new Error(message));
    await expect(pat.restore("xxx")).rejects.toThrow(message);
  });

  it("propagates unknown errors from update", async () => {
    const message = "Some unknown error";
    docClientMock.on(UpdateCommand).rejects(new Error(message));
    await expect(pat.update("xxx", { isAdmin: true })).rejects.toThrow(message);
  });

  it("handles invalid bootstrap token", async () => {
    docClientMock.on(DescribeTableCommand).resolves({
      Table: {
        ItemCount: 0,
      },
    });
    const { secretPhc } = await pat.generate();
    const patWithBootstrap = new DynamoDBPat({
      tableName,
      bootstrapPhc: secretPhc,
    });
    const result = await patWithBootstrap.bootstrap("pat_xxx", {
      owner: "test",
    });
    assert(!result.valid);
    expect(result.reason).toBe("invalid_format");
  });

  it("throws when loading invalid token records", async () => {
    docClientMock.on(GetCommand).resolves({
      Item: {
        tokenId,
      },
    });
    await expect(pat.verify(fakeToken)).rejects.toThrow(
      `Cannot load invalid record for token ${tokenId}`,
    );
  });

  it("throws when storing invalid token records", async () => {
    await expect(
      pat["store"]({
        tokenId,
        secretPhc: "invalid-secret-phc",
        owner: "x".repeat(MAX_OWNER_LENGTH + 1),
        isAdmin: false,
        createdAt: Date.now(),
      }),
    ).rejects.toThrow("Cannot store invalid token record");
  });

  it("propagates unknown errors from store", async () => {
    const message = "Some unknown error";
    docClientMock.on(PutCommand).rejects(new Error(message));
    await expect(
      pat["store"]({
        tokenId,
        secretPhc: "invalid-secret-phc",
        owner: "test",
        isAdmin: false,
        createdAt: Date.now(),
      }),
    ).rejects.toThrow(message);
  });

  describe("batchLoad error handling", () => {
    it("handles BatchGetCommand returning empty response", async () => {
      docClientMock.on(BatchGetCommand).resolves({});
      const result = await pat.batchLoad(new Set([tokenId]));
      expect(result.found).toHaveLength(0);
      expect(result.notFound).toHaveLength(1);
      expect(result.notFound[0]).toBe(tokenId);
    });

    it("skips invalid records when batch loading tokens", async () => {
      const validTokenId = "validToken1234567890a";
      const invalidTokenId = "invalid123456789012a";

      docClientMock.on(BatchGetCommand).resolves({
        Responses: {
          [tableName]: [
            {
              tokenId: validTokenId,
              secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
              owner: "valid-user",
              isAdmin: false,
              createdAt: Math.floor(Date.now() / 1000),
            },
            {
              tokenId: invalidTokenId,
              owner: "invalid-user",
            },
          ],
        },
      });

      const result = await pat.batchLoad(
        new Set([validTokenId, invalidTokenId]),
      );

      expect(result.found).toHaveLength(1);
      expect(result.found[0].tokenId).toBe(validTokenId);
      expect(result.notFound).toHaveLength(1);
      expect(result.notFound[0]).toBe(invalidTokenId);
    });

    it("handles UnprocessedKeys with successful retry", async () => {
      const token1 = "token1234567890123456";
      const token2 = "token2234567890123456";

      docClientMock
        .on(BatchGetCommand)
        .resolvesOnce({
          Responses: {
            [tableName]: [
              {
                tokenId: token1,
                secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
                owner: "user-1",
                isAdmin: false,
                createdAt: Math.floor(Date.now() / 1000),
              },
            ],
          },
          UnprocessedKeys: {
            [tableName]: {
              Keys: [{ tokenId: token2 }],
            },
          },
        })
        .resolvesOnce({
          Responses: {
            [tableName]: [
              {
                tokenId: token2,
                secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
                owner: "user-2",
                isAdmin: true,
                createdAt: Math.floor(Date.now() / 1000),
              },
            ],
          },
        });

      const result = await pat.batchLoad(new Set([token1, token2]));

      expect(result.found).toHaveLength(2);
      expect(result.notFound).toHaveLength(0);
      expect(docClientMock.calls()).toHaveLength(2);
    });

    it("throws when max retries exceeded with UnprocessedKeys", async () => {
      const token1 = "token1234567890123456";

      docClientMock.on(BatchGetCommand).resolves({
        Responses: {
          [tableName]: [],
        },
        UnprocessedKeys: {
          [tableName]: {
            Keys: [{ tokenId: token1 }],
          },
        },
      });

      await expect(pat.batchLoad(new Set([token1]))).rejects.toThrow(
        "Max retries reached with 1 unprocessed items",
      );

      expect(docClientMock.calls().length).toBeGreaterThan(1);
    });

    it("propagates unknown errors from BatchGetCommand", async () => {
      const message = "DynamoDB service error";
      docClientMock.on(BatchGetCommand).rejects(new Error(message));

      await expect(pat.batchLoad(new Set([tokenId]))).rejects.toThrow(message);
    });

    it("retries and succeeds after initial BatchGetCommand error", async () => {
      const message = "Temporary error";
      docClientMock
        .on(BatchGetCommand)
        .rejectsOnce(new Error(message))
        .resolvesOnce({
          Responses: {
            [tableName]: [
              {
                tokenId,
                secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
                owner: "test-user",
                isAdmin: false,
                createdAt: Math.floor(Date.now() / 1000),
              },
            ],
          },
        });

      const result = await pat.batchLoad(new Set([tokenId]));

      expect(result.found).toHaveLength(1);
      expect(result.found[0].tokenId).toBe(tokenId);
      expect(docClientMock.calls()).toHaveLength(2);
    });

    it("throws when max retries exceeded with errors", async () => {
      const message = "Persistent error";
      docClientMock.on(BatchGetCommand).rejects(new Error(message));

      await expect(pat.batchLoad(new Set([tokenId]))).rejects.toThrow(message);

      expect(docClientMock.calls().length).toBeGreaterThan(1);
    });

    it("handles mixed valid and invalid UnprocessedKeys", async () => {
      const token1 = "token1234567890123456";

      docClientMock.on(BatchGetCommand).resolves({
        Responses: {
          [tableName]: [],
        },
        UnprocessedKeys: {
          [tableName]: {
            Keys: [{ tokenId: token1 }, { tokenId: null }],
          },
        },
      });

      await expect(pat.batchLoad(new Set([token1]))).rejects.toThrow(
        "Max retries reached with 1 unprocessed items",
      );
    });
  });
});
