import assert from "assert";

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

import { DynamoDBPat } from "../index";

describe("Secret creation and verification", () => {
  const docClientMock = mockClient(DynamoDBDocumentClient);

  const tableName = "test-tokens";

  let pat: DynamoDBPat;

  beforeEach(() => {
    docClientMock.reset();

    docClientMock.on(DescribeTableCommand).resolves({
      Table: {
        ItemCount: 0,
      },
    });
    docClientMock.on(GetCommand).resolves({});
    docClientMock.on(PutCommand).resolves({});

    pat = new DynamoDBPat({
      tableName,
    });
  });

  describe("Secret creation", () => {
    it("should generate secrets with correct length", async () => {
      const result = await pat.generate();

      // Extract secret from token: prefix + tokenId + "." + secret
      const secretBase64 = result.token.split(".")[1];
      const secret = Buffer.from(secretBase64, "base64");

      // Default key length is 32 bytes
      expect(secret).toHaveLength(32);
    });

    it("should generate unique secrets", async () => {
      const result1 = await pat.generate();
      const result2 = await pat.generate();

      expect(result1.token).not.toBe(result2.token);
      expect(result1.secretPhc).not.toBe(result2.secretPhc);
    });

    it("should generate different salts", async () => {
      const result1 = await pat.generate();
      const result2 = await pat.generate();

      // Extract salt from PHC strings
      const salt1 = result1.secretPhc.split("$")[4];
      const salt2 = result2.secretPhc.split("$")[4];

      expect(salt1).not.toBe(salt2);
    });
  });

  describe("Secret verification", () => {
    it("should verify correct secret", async () => {
      const bootstrap = await pat.generate();

      const patWithBootstrap = new DynamoDBPat({
        tableName,
        bootstrapPhc: bootstrap.secretPhc,
      });

      const result = await patWithBootstrap.bootstrap(bootstrap.token, {
        owner: "test@example.com",
      });

      expect(result.valid).toBe(true);
    });

    it("should reject wrong secret", async () => {
      const bootstrap = await pat.generate();

      const patWithBootstrap = new DynamoDBPat({
        tableName,
        bootstrapPhc: bootstrap.secretPhc,
      });

      const result = await patWithBootstrap.bootstrap(
        // Delete the first character of the secret to invalidate it
        bootstrap.token.replace(/\../, "."),
        {
          owner: "test@example.com",
        },
      );

      assert(!result.valid);
      expect(result.reason).toBe("invalid_secret");
    });
  });

  describe("PHC string validation", () => {
    it("should reject malformed PHC strings", () => {
      expect(
        () =>
          new DynamoDBPat({
            tableName,
            bootstrapPhc: "scrypt$ln=14,r=8,p=1$c2FsdDE$aGFzaDE",
          }),
      ).toThrow("Invalid bootstrap PHC string: invalid_phc");
    });

    it("should reject unsupported algorithms", () => {
      expect(
        () =>
          new DynamoDBPat({
            tableName,
            bootstrapPhc: "$bcrypt$cost=12$c2FsdDE$aGFzaDE",
          }),
      ).toThrow("Invalid bootstrap PHC string: unsupported_algorithm");
    });

    it("should reject PHC with missing parameters", () => {
      expect(
        () =>
          new DynamoDBPat({
            tableName,
            bootstrapPhc: "$scrypt$ln=14,r=8$c2FsdDE$aGFzaDE",
          }),
      ).toThrow("Invalid bootstrap PHC string: invalid_parameters");
    });
  });
});
