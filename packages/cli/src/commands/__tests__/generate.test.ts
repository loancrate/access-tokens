import { type MockedObject, vi } from "vitest";

vi.mock("@access-tokens/core");
vi.mock("../../utils/logger");

import { DynamoDBPat, type GenerateResult } from "@access-tokens/core";

import { generateCommand } from "../generate";

const mockGenerate = vi.fn<() => Promise<GenerateResult>>();
const MockedDynamoDBPat = vi.mocked(DynamoDBPat);

beforeEach(() => {
  vi.clearAllMocks();
  MockedDynamoDBPat.mockImplementation(function () {
    const partial: Partial<DynamoDBPat> = {
      generate: mockGenerate,
    };
    // Only the 'generate' method is needed for these tests
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return partial as MockedObject<DynamoDBPat>;
  });
});

describe("generateCommand", () => {
  const mockGenerateResult = {
    token: "pat_test123.secret456789",
    tokenId: "test123",
    secretPhc: "$scrypt$ln=15,r=8,p=1$test$hash",
  };

  it("should generate token successfully", async () => {
    mockGenerate.mockResolvedValue(mockGenerateResult);

    await generateCommand({});

    expect(DynamoDBPat).toHaveBeenCalledWith({
      tableName: "unused-table-name",
      tokenPrefix: undefined,
    });
    expect(mockGenerate).toHaveBeenCalledWith({
      tokenId: undefined,
    });
  });

  it("should generate token with custom prefix", async () => {
    mockGenerate.mockResolvedValue(mockGenerateResult);

    await generateCommand({
      tokenPrefix: "custom_",
    });

    expect(DynamoDBPat).toHaveBeenCalledWith({
      tableName: "unused-table-name",
      tokenPrefix: "custom_",
    });
    expect(mockGenerate).toHaveBeenCalledWith({
      tokenId: undefined,
    });
  });

  it("should generate token with custom token ID", async () => {
    mockGenerate.mockResolvedValue({
      ...mockGenerateResult,
      tokenId: "customId123",
    });

    await generateCommand({
      tokenId: "customId123",
    });

    expect(DynamoDBPat).toHaveBeenCalledWith({
      tableName: "unused-table-name",
      tokenPrefix: undefined,
    });
    expect(mockGenerate).toHaveBeenCalledWith({
      tokenId: "customId123",
    });
  });

  it("should output JSON when --json flag is set", async () => {
    mockGenerate.mockResolvedValue(mockGenerateResult);

    await generateCommand({
      json: true,
    });

    expect(mockGenerate).toHaveBeenCalled();
  });

  it("should handle verbose output", async () => {
    mockGenerate.mockResolvedValue(mockGenerateResult);

    await generateCommand({
      verbose: true,
    });

    expect(mockGenerate).toHaveBeenCalled();
  });

  it("should handle generation errors", async () => {
    const error = new Error("Generation failed");
    mockGenerate.mockRejectedValue(error);

    await expect(generateCommand({})).rejects.toThrow("Generation failed");
  });
});
