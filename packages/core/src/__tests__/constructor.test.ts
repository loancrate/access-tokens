import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { DynamoDBPat, DynamoDBPatConfig } from "../index";

describe("DynamoDBPat constructor", () => {
  describe("Default configuration", () => {
    const tableName = "test-table";

    it("should create instance with default values", () => {
      const pat = new DynamoDBPat({ tableName });

      expect(pat["tableName"]).toBe(tableName);
      expect(pat["tokenPrefix"]).toBe("pat_");
      expect(pat["keyLength"]).toBe(32);
      expect(pat["saltLength"]).toBe(16);
      expect(pat["scryptOptions"]).toStrictEqual({
        cost: 16384,
        blockSize: 8,
        parallelization: 1,
        maxmem: 32 * 1024 * 1024,
      });
    });

    it("should generate default token and secret PHC format", async () => {
      const pat = new DynamoDBPat({ tableName });

      const { token, secretPhc } = await pat.generate();
      expect(token).toMatch(/^pat_[a-zA-Z0-9]{21}\.[a-zA-Z0-9+/]{43}=$/);
      expect(secretPhc).toMatch(
        /^\$scrypt\$ln=14,r=8,p=1\$[a-zA-Z0-9+/]{22}\$[a-zA-Z0-9+/]{43}$/,
      );
    });
  });

  describe("Custom configuration", () => {
    const ddbClient = new DynamoDBClient({
      region: "us-west-2",
    });
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    const tableName = "custom-tokens";
    const tokenPrefix = "custom_";
    const keyLength = 24;
    const saltLength = 12;
    const scryptOptions = {
      cost: 8192,
      blockSize: 4,
      parallelization: 2,
      maxmem: 16 * 1024 * 1024,
    };

    const customConfig: DynamoDBPatConfig = {
      docClient,
      tableName,
      tokenPrefix,
      keyLength,
      saltLength,
      scryptOptions,
    };

    it("should accept custom configuration", () => {
      const pat = new DynamoDBPat(customConfig);

      expect(pat["docClient"]).toBe(docClient);
      expect(pat["tableName"]).toBe(tableName);
      expect(pat["tokenPrefix"]).toBe(tokenPrefix);
      expect(pat["keyLength"]).toBe(keyLength);
      expect(pat["saltLength"]).toBe(saltLength);
      expect(pat["scryptOptions"]).toStrictEqual(scryptOptions);
    });

    it("should generate custom token and secret PHC format", async () => {
      const pat = new DynamoDBPat(customConfig);

      const { token, secretPhc } = await pat.generate();
      expect(token).toMatch(/^custom_[a-zA-Z0-9]{21}\.[a-zA-Z0-9+/]{32}$/);
      expect(secretPhc).toMatch(
        /^\$scrypt\$ln=13,r=4,p=2\$[a-zA-Z0-9+/]{16}\$[a-zA-Z0-9+/]{32}$/,
      );
    });
  });

  describe("Configuration validation", () => {
    it("should handle explicitly undefined optional parameters", () => {
      const pat = new DynamoDBPat({
        tableName: "test-table",
        tokenPrefix: undefined,
        keyLength: undefined,
        saltLength: undefined,
        scryptOptions: undefined,
        bootstrapPhc: undefined,
      });

      expect(pat).toBeInstanceOf(DynamoDBPat);
    });
  });
});
