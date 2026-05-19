import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

import { DynamoDBPat } from "../index";

describe("DynamoDBPat.get", () => {
  const docClientMock = mockClient(DynamoDBDocumentClient);
  const tableName = "test-tokens";
  const tokenId = "abcdefghijklmnopqrstu";
  let pat: DynamoDBPat;

  beforeEach(() => {
    docClientMock.reset();
    pat = new DynamoDBPat({ tableName });
  });

  it("should load a public token record without secretPhc", async () => {
    docClientMock.on(GetCommand).resolves({
      Item: {
        tokenId,
        secretPhc: "$scrypt$ln=15,r=8,p=1$abcd$efgh",
        owner: "admin@example.com",
        isAdmin: true,
        roles: new Set(["admin"]),
        createdAt: 1704067200,
      },
    });

    const record = await pat.get(tokenId);

    expect(record).toStrictEqual({
      tokenId,
      owner: "admin@example.com",
      isAdmin: true,
      roles: ["admin"],
      createdAt: 1704067200,
    });
    expect(record).not.toHaveProperty("secretPhc");
    expect(
      docClientMock.commandCalls(GetCommand)[0].args[0].input,
    ).toMatchObject({
      TableName: tableName,
      Key: { tokenId },
      ConsistentRead: true,
    });
  });

  it("should return null when the token does not exist", async () => {
    docClientMock.on(GetCommand).resolves({});

    await expect(pat.get(tokenId)).resolves.toBeNull();
  });
});
