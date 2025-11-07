import assert from "assert";

import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

import { DynamoDBPat, MAX_TOKEN_LENGTH } from "../index";

describe("Token parsing", () => {
  const docClientMock = mockClient(DynamoDBDocumentClient);

  // Set up default mock for GetCommand to return empty (token not found)
  docClientMock.on(GetCommand).resolves({});

  const pat = new DynamoDBPat({
    tableName: "test-tokens",
  });

  it("should reject token with wrong prefix", async () => {
    const result = await pat.verify("wrong_abc123def456ghi789jkl.c2VjcmV0MTIz");

    assert(!result.valid);
    expect(result.reason).toBe("invalid_prefix");
  });

  it("should reject token with missing dot separator", async () => {
    const result = await pat.verify("pat_abc123def456ghi789jklc2VjcmV0MTIz");

    assert(!result.valid);
    expect(result.reason).toBe("invalid_format");
  });

  it("should reject empty token", async () => {
    const result = await pat.verify("");

    assert(!result.valid);
    expect(result.reason).toBe("invalid_prefix");
  });

  it("should reject token with only prefix", async () => {
    const result = await pat.verify("pat_");

    assert(!result.valid);
    expect(result.reason).toBe("invalid_format");
  });

  it("should reject token with multiple dots", async () => {
    const result = await pat.verify("pat_abc123def456ghi789jkl.part1.part2");

    assert(!result.valid);
    expect(result.reason).toBe("invalid_format");
  });

  describe("Token ID validation", () => {
    it("should accept valid 21-character alphanumeric strings", async () => {
      // Valid id62 format: exactly 21 alphanumeric characters
      const validToken = "pat_ABCdefghijklmnopqr123.dGVzdA";

      const result = await pat.verify(validToken);

      // Should not fail on ID parsing (will fail on not_found)
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should reject tokenId with invalid length", async () => {
      // Too short (20 chars)
      const shortToken = "pat_ABCdefghijklmnopqr12.dGVzdA";

      const result = await pat.verify(shortToken);

      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });

    it("should reject tokenId with invalid length (too long)", async () => {
      // Too long (22 chars)
      const longToken = "pat_ABCdefghijklmnopqr1234.dGVzdA";

      const result = await pat.verify(longToken);

      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });

    it("should reject tokenId with invalid characters", async () => {
      // Contains hyphen (not alphanumeric)
      const invalidToken = "pat_ABCdefghijklmnopqr-23.dGVzdA";

      const result = await pat.verify(invalidToken);

      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });

    it("should accept all numeric tokenId", async () => {
      // All numbers (still valid alphanumeric)
      const validToken = "pat_123456789012345678901.dGVzdA";

      const result = await pat.verify(validToken);

      // Should not fail on ID parsing
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });
  });

  describe("Base64 validation (through token parsing)", () => {
    it("should accept standard base64 characters", async () => {
      // Standard base64: A-Z, a-z, 0-9, +, /, =
      const validToken = "pat_abc123def456ghi789jkl.QWxhZGRpbjpvcGVuIHNlc2FtZQ";

      const result = await pat.verify(validToken);

      // Should not fail on base64 parsing
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should accept URL-safe base64 characters", async () => {
      // URL-safe base64: A-Z, a-z, 0-9, -, _, =
      const validToken =
        "pat_abc123def456ghi789jkl.QWxhZGRpbjpvcGVuIHNlc2FtZQ--";

      const result = await pat.verify(validToken);

      // Should not fail on base64 parsing
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should accept base64 with padding", async () => {
      // With padding (=)
      const validToken = "pat_abc123def456ghi789jkl.dGVzdA==";

      const result = await pat.verify(validToken);

      // Should not fail on base64 parsing
      assert(!result.valid);
      expect(result.reason).toBe("not_found");
    });

    it("should reject invalid base64 characters", async () => {
      // Contains space (invalid)
      const invalidToken = "pat_abc123def456ghi789jkl.dGVz dA";

      const result = await pat.verify(invalidToken);

      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });

    it("should reject empty secret", async () => {
      const invalidToken = "pat_abc123def456ghi789jkl.";

      const result = await pat.verify(invalidToken);

      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });

    it("should reject very long token", async () => {
      const longBase64 = "0".repeat(MAX_TOKEN_LENGTH);
      const validToken = `pat_abc123def456ghi789jkl.${longBase64}`;

      const result = await pat.verify(validToken);

      // Should not fail on base64 parsing
      assert(!result.valid);
      expect(result.reason).toBe("invalid_format");
    });
  });
});
