import assert from "assert";
import {
  BinaryLike,
  randomBytes,
  scrypt as rawScrypt,
  ScryptOptions,
  timingSafeEqual,
} from "crypto";
import { setTimeout as sleep } from "timers/promises";
import { promisify } from "util";

import {
  ConditionalCheckFailedException,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  ScanCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { deserialize, serialize } from "@phc/format";
import { id62 } from "id62";

import { MAX_TOKEN_LENGTH, TokenRecord, tokenRecordSchema } from "./schema";

// We have to specify all the type parameters to `promisify` here because the
// inferred overload doesn't include the `ScryptOptions` parameter.
const scrypt = promisify<BinaryLike, BinaryLike, number, ScryptOptions, Buffer>(
  rawScrypt,
);

export type CanonicalScryptOptions = Pick<
  ScryptOptions,
  "cost" | "blockSize" | "parallelization" | "maxmem"
>;

export type DynamoDBPatConfig = {
  ddbClient?: DynamoDBClient;
  docClient?: DynamoDBDocumentClient;
  tableName: string;
  tokenPrefix?: string;
  keyLength?: number;
  saltLength?: number;
  scryptOptions?: CanonicalScryptOptions;
  bootstrapPhc?: string;
};

export type ListOptions = {
  limit?: number;
  batchLimit?: number;
  afterTokenId?: string;
  includeSecretPhc?: boolean;
  hasRole?: string;
};

export type BatchLoadOptions = {
  includeSecretPhc?: boolean;
};

export type BatchLoadResult = {
  found: PublicTokenRecord[];
  notFound: string[];
};

export type GenerateConfig = {
  tokenId?: string;
};

export type GenerateResult = {
  token: string;
  tokenId: string;
  secretPhc: string;
};

export type RegisterConfig = {
  tokenId: string;
  secretPhc: string;
  owner: string;
  isAdmin?: boolean;
  roles?: string[];
  expiresAt?: number;
};

export type IssueConfig = {
  tokenId?: string;
  owner: string;
  isAdmin?: boolean;
  roles?: string[];
  expiresAt?: number;
};

export type RolesUpdate =
  | string[]
  | { add: string[]; remove?: never }
  | { add?: never; remove: string[] };

export type IssueResult = {
  token: string;
  record: ValidTokenRecord;
};

export type VerifyFailureReason =
  | "invalid_prefix"
  | "invalid_format"
  | "not_found"
  | "invalid_phc"
  | "unsupported_algorithm"
  | "invalid_parameters"
  | "invalid_secret"
  | "revoked"
  | "expired";

type SetOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Optionally omits the secretPhc field for security reasons. That field isn't
// enough to impersonate the token, but it's best not to expose it
// unnecessarily.
export type PublicTokenRecord = SetOptional<TokenRecord, "secretPhc">;

export type VerifyFailure = {
  valid: false;
  reason: VerifyFailureReason;
  // Included for context when the failure is due to revocation or expiration.
  record?: PublicTokenRecord;
  cause?: unknown;
};

// A valid token record is one that has been verified and not revoked, so it
// doesn't include the revokedAt field.
export type ValidTokenRecord = Omit<PublicTokenRecord, "revokedAt">;

export type VerifySuccess = {
  valid: true;
  record: ValidTokenRecord;
};

export type VerifyResult = VerifySuccess | VerifyFailure;

export const DEFAULT_KEY_LENGTH = 32;
export const DEFAULT_SALT_LENGTH = 16;

export const SCRYPT_ALGORITHM_ID = "scrypt";
export const DEFAULT_SCRYPT_COST = 16384;
export const DEFAULT_SCRYPT_BLOCK_SIZE = 8;
export const DEFAULT_SCRYPT_PARALLELIZATION = 1;
export const DEFAULT_SCRYPT_MAXMEM = 32 * 1024 * 1024;

type ParsedToken = {
  tokenId: string;
  secret: Buffer;
};

type ParsedPhc = {
  valid: true;
  salt: Buffer;
  hash: Buffer;
  options: CanonicalScryptOptions;
};

/**
 * DynamoDB-backed personal access token (PAT) manager.
 */
export class DynamoDBPat {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly tokenPrefix: string;
  private readonly keyLength: number;
  private readonly saltLength: number;
  private readonly scryptOptions: Required<CanonicalScryptOptions>;
  private readonly bootstrapPhc?: string;
  private readonly bootstrapPhcParsed?: ParsedPhc;

  constructor(config: DynamoDBPatConfig) {
    this.docClient =
      config.docClient ??
      DynamoDBDocumentClient.from(config.ddbClient ?? new DynamoDBClient({}));
    this.tableName = config.tableName;
    this.tokenPrefix = config.tokenPrefix ?? "pat_";
    this.keyLength = config.keyLength ?? DEFAULT_KEY_LENGTH;
    this.saltLength = config.saltLength ?? DEFAULT_SALT_LENGTH;
    this.scryptOptions = {
      cost: config.scryptOptions?.cost ?? DEFAULT_SCRYPT_COST,
      blockSize: config.scryptOptions?.blockSize ?? DEFAULT_SCRYPT_BLOCK_SIZE,
      parallelization:
        config.scryptOptions?.parallelization ?? DEFAULT_SCRYPT_PARALLELIZATION,
      maxmem: config.scryptOptions?.maxmem ?? DEFAULT_SCRYPT_MAXMEM,
    };

    // Validate the bootstrap PHC string if provided
    if (config.bootstrapPhc) {
      const parsed = this.parsePhc(config.bootstrapPhc);
      if (!parsed.valid) {
        throw new Error(`Invalid bootstrap PHC string: ${parsed.reason}`);
      }
      this.bootstrapPhc = config.bootstrapPhc;
      this.bootstrapPhcParsed = parsed;
    }
  }

  /**
   * Get the approximate number of tokens stored in the table. Uses the item
   * count reported by DynamoDB DescribeTable, which is eventually consistent
   * and may be out of date.
   *
   * @returns The approximate number of tokens stored in the table.
   */
  async getCount(): Promise<number> {
    const result = await this.docClient.send(
      new DescribeTableCommand({
        TableName: this.tableName,
      }),
    );
    return result.Table?.ItemCount ?? 0;
  }

  /**
   * List tokens in the table. Yields token records without the `secretPhc`
   * field for security reasons. Any invalid records encountered will be
   * skipped.
   *
   * @param options Configuration for pagination and limiting results.
   * @returns An async generator yielding public token records.
   */
  async *list(options?: ListOptions): AsyncGenerator<PublicTokenRecord> {
    // If afterTokenId is provided, start from that token
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    const afterTokenId = options?.afterTokenId;
    if (afterTokenId) {
      lastEvaluatedKey = { tokenId: afterTokenId };
    }

    let yielded = 0;
    const limit = options?.limit;
    const batchLimit = options?.batchLimit;
    const includeSecretPhc = options?.includeSecretPhc ?? false;
    const hasRole = options?.hasRole;

    do {
      const scanParams: ScanCommandInput = {
        TableName: this.tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      // If we have a limit, set the scan limit to be more than what we need
      // to account for potentially invalid records that we'll skip
      if (limit !== undefined) {
        const remaining = limit - yielded;
        assert(remaining >= 0);
        // Scan more than needed to account for invalid records we might skip
        scanParams.Limit = remaining + 10;
        if (batchLimit !== undefined && scanParams.Limit > batchLimit) {
          scanParams.Limit = batchLimit;
        }
      } else if (batchLimit !== undefined) {
        scanParams.Limit = batchLimit;
      }

      const result = await this.docClient.send(new ScanCommand(scanParams));
      if (result.Items) {
        for (const item of result.Items) {
          const parseResult = tokenRecordSchema.safeParse(item);
          if (parseResult.success) {
            const { data } = parseResult;

            // Filter by role if specified
            if (hasRole && !data.roles?.includes(hasRole)) {
              continue;
            }

            yield includeSecretPhc ? data : omitSecretPhc(data);
            ++yielded;

            // Stop if we've reached the limit
            if (limit !== undefined && yielded >= limit) {
              return;
            }
          }
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  /**
   * Load multiple tokens by their IDs. Returns both found tokens and a list of
   * IDs that were not found.
   *
   * @param tokenIds Array of token IDs to fetch.
   * @param options Options including whether to include secretPhc.
   * @returns Object containing found tokens and not found token IDs.
   */
  async batchLoad(
    tokenIds: Set<string>,
    options?: BatchLoadOptions,
  ): Promise<BatchLoadResult> {
    const found: PublicTokenRecord[] = [];
    const notFound: string[] = [];
    const includeSecretPhc = options?.includeSecretPhc ?? false;

    // Queue to track token IDs that need to be processed
    const maxRetries = 3;
    let retryCount = 0;
    let toProcess = [...tokenIds];
    while (toProcess.length > 0) {
      // Process in batches of 100 (DynamoDB BatchGet limit)
      const itemsPerBatch = 100;
      const batchSize = Math.min(itemsPerBatch, toProcess.length);
      const currentBatch = toProcess.splice(0, batchSize);
      let unprocessedTokenIds: string[];
      try {
        const result = await this.docClient.send(
          new BatchGetCommand({
            RequestItems: {
              [this.tableName]: {
                Keys: currentBatch.map((tokenId) => ({ tokenId })),
              },
            },
          }),
        );

        // Process found items
        const items = result.Responses?.[this.tableName] ?? [];
        const foundTokenIds = new Set<string>();
        for (const item of items) {
          const parseResult = tokenRecordSchema.safeParse(item);
          if (parseResult.success) {
            const { data } = parseResult;
            found.push(includeSecretPhc ? data : omitSecretPhc(data));
            foundTokenIds.add(data.tokenId);
          }
        }

        // Handle unprocessed keys by putting them back in the queue
        const unprocessedKeys =
          result.UnprocessedKeys?.[this.tableName]?.Keys ?? [];
        unprocessedTokenIds = [];
        for (const key of unprocessedKeys) {
          if (typeof key.tokenId === "string") {
            unprocessedTokenIds.push(key.tokenId);
            foundTokenIds.add(key.tokenId);
          }
        }

        // Identify requested items that weren't returned or unprocessed
        for (const tokenId of currentBatch) {
          if (!foundTokenIds.has(tokenId)) {
            notFound.push(tokenId);
          }
        }
      } catch (err) {
        if (retryCount >= maxRetries) {
          throw err;
        }

        // On error, put the current batch back in the queue and retry
        unprocessedTokenIds = currentBatch;
      }

      // Put unprocessed items back at the front of the queue
      if (unprocessedTokenIds.length > 0) {
        if (retryCount >= maxRetries) {
          throw new Error(
            `Max retries reached with ${unprocessedTokenIds.length} unprocessed items`,
          );
        }

        toProcess = unprocessedTokenIds.concat(toProcess);
        ++retryCount;

        // Exponential backoff for retry delay
        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
        await sleep(delayMs);
      } else {
        // Reset retry count on successful batch processing
        retryCount = 0;
      }
    }

    return { found, notFound };
  }

  /**
   * Generate a new token and its PHC string. Does not store the token in the
   * database. This can be used for bootstrapping or issuing tokens manually.
   *
   * @param config The configuration for the issued token.
   * @returns The issued token and its PHC string.
   */
  async generate(config?: GenerateConfig): Promise<GenerateResult> {
    const { secret, secretPhc } = await this.createSecret();

    const tokenId = config?.tokenId ?? id62();
    const token = this.format(tokenId, secret);

    return { token, tokenId, secretPhc };
  }

  /**
   * Registers a new token with the given ID and secret hash, which are
   * generally provided by the `generate` method.
   *
   * @param config Configuration for the registration of the token.
   * @returns The registered token.
   */
  async register(config: RegisterConfig): Promise<TokenRecord> {
    const {
      tokenId,
      secretPhc,
      owner,
      isAdmin = false,
      roles,
      expiresAt,
    } = config;

    const record: TokenRecord = {
      tokenId,
      secretPhc,
      owner,
      isAdmin,
      ...(roles?.length && { roles }),
      createdAt: Math.floor(Date.now() / 1000),
      ...(expiresAt !== undefined && { expiresAt }),
    };

    await this.store(record);

    return record;
  }

  /**
   * Issue a new token with a random ID and secret.
   *
   * @param config Configuration for the issued token.
   * @returns The issued token.
   */
  async issue(config: IssueConfig): Promise<IssueResult> {
    const { secret, secretPhc } = await this.createSecret();

    const {
      tokenId = id62(),
      owner,
      isAdmin = false,
      roles,
      expiresAt,
    } = config;
    const record: ValidTokenRecord = {
      tokenId,
      owner,
      isAdmin,
      ...(roles?.length && { roles }),
      createdAt: Math.floor(Date.now() / 1000),
      ...(expiresAt !== undefined && { expiresAt }),
    };

    await this.store({ ...record, secretPhc });

    const token = this.format(record.tokenId, secret);

    return { token, record };
  }

  /**
   * Verify a token and return its metadata if valid.
   *
   * @param token The token string to verify.
   * @returns The verification result.
   */
  async verify(token: string): Promise<VerifyResult> {
    const parsed = this.parse(token);
    if (!("tokenId" in parsed)) {
      return parsed;
    }
    const { tokenId, secret } = parsed;

    const record = await this.load(tokenId);
    if (!record) {
      return failVerify("not_found");
    }

    const phc = this.parsePhc(record.secretPhc);
    if (!phc.valid) {
      return phc;
    }

    const verifyFailure = await this.verifySecret(secret, phc);
    if (verifyFailure) {
      return verifyFailure;
    }

    if (record.revokedAt) {
      return failVerify("revoked", { record });
    }

    const now = Math.floor(Date.now() / 1000);
    if (record.expiresAt && record.expiresAt <= now) {
      return failVerify("expired", { record });
    }

    const lastUsedAt = await this.touch(tokenId);

    const { owner, isAdmin, roles, createdAt, expiresAt } = record;
    return {
      valid: true,
      record: {
        tokenId,
        owner,
        isAdmin,
        ...(roles?.length && { roles }),
        createdAt,
        lastUsedAt,
        expiresAt,
      },
    };
  }

  /**
   * Revoke the token with the given ID. Optionally set an expiration time. Does
   * nothing if the token is already revoked. Throws an error if the token is
   * not found.
   *
   * @param tokenId The ID of the token to revoke.
   * @param options.expiresAt If provided, set the token's expiration time.
   */
  async revoke(
    tokenId: string,
    options?: { expiresAt?: number },
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { tokenId },
          ConditionExpression:
            "attribute_exists(tokenId) AND attribute_not_exists(revokedAt)",
          UpdateExpression: "SET revokedAt = :now, expiresAt = :expiresAt",
          ExpressionAttributeValues: {
            ":now": now,
            ":expiresAt": options?.expiresAt ?? null,
          },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!err.Item) {
          throw new Error(`Token not found: ${tokenId}`);
        }
        // Do nothing if token is already revoked
        return;
      }
      throw err;
    }
  }

  /**
   * Restores the revoked token with the given ID and clears its expiration
   * time. Does nothing if the token is not revoked. Throws an error if the
   * token is not found.
   *
   * @param tokenId The ID of the token to restore.
   * @throws Error if the token is not found.
   */
  async restore(tokenId: string): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { tokenId },
          ConditionExpression:
            "attribute_exists(tokenId) AND attribute_exists(revokedAt)",
          UpdateExpression: "REMOVE revokedAt, expiresAt",
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        if (!err.Item) {
          throw new Error(`Token not found: ${tokenId}`);
        }
        // Do nothing if token is not revoked
        return;
      }
      throw err;
    }
  }

  /**
   * Update the metadata of a token. Throws an error if the token is not found.
   *
   * @param tokenId The ID of the token to update.
   * @param updates The updates to apply.
   *
   * @example
   * // Update basic properties
   * await pat.update(tokenId, { owner: "new@example.com", isAdmin: true });
   *
   * @example
   * // Replace all roles
   * await pat.update(tokenId, { roles: ["reader", "writer"] });
   *
   * @example
   * // Add roles atomically
   * await pat.update(tokenId, { roles: { add: ["admin"] } });
   *
   * @example
   * // Remove roles atomically
   * await pat.update(tokenId, { roles: { remove: ["guest"] } });
   */
  async update(
    tokenId: string,
    updates: Partial<
      Pick<TokenRecord, "secretPhc" | "owner" | "isAdmin" | "expiresAt">
    > & { roles?: RolesUpdate },
  ): Promise<void> {
    const { roles, ...otherUpdates } = updates;

    if (otherUpdates.secretPhc) {
      // Validate the PHC string before storing it
      const parsed = this.parsePhc(otherUpdates.secretPhc);
      if (!parsed.valid) {
        throw new Error(`Invalid secret PHC string: ${parsed.reason}`);
      }
    }

    // Build update expression parts dynamically
    const setParts: string[] = [];
    const removeParts: string[] = [];
    const addParts: string[] = [];
    const deleteParts: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<
      string,
      string | number | boolean | null | Set<string>
    > = {};

    // Handle regular field updates
    for (const [key, value] of Object.entries(otherUpdates)) {
      if (value === undefined) {
        continue;
      }
      // Use expression attribute names for reserved keywords like owner
      const attributeName = `#${key}`;
      setParts.push(`${attributeName} = :${key}`);
      names[attributeName] = key;
      values[`:${key}`] = value;
    }

    // Handle roles updates
    if (roles !== undefined) {
      names["#roles"] = "roles";
      if (Array.isArray(roles)) {
        if (roles.length === 0) {
          // DynamoDB doesn't allow empty String Sets - remove the attribute entirely
          removeParts.push("#roles");
        } else {
          setParts.push("#roles = :roles");
          values[":roles"] = new Set(roles);
        }
      } else if ("add" in roles && roles.add?.length) {
        addParts.push("#roles :addRoles");
        values[":addRoles"] = new Set(roles.add);
      } else if ("remove" in roles && roles.remove?.length) {
        deleteParts.push("#roles :removeRoles");
        values[":removeRoles"] = new Set(roles.remove);
      }
    }

    // Build the combined update expression
    const expressionParts: string[] = [];
    if (setParts.length > 0) {
      expressionParts.push(`SET ${setParts.join(", ")}`);
    }
    if (removeParts.length > 0) {
      expressionParts.push(`REMOVE ${removeParts.join(", ")}`);
    }
    if (addParts.length > 0) {
      expressionParts.push(`ADD ${addParts.join(", ")}`);
    }
    if (deleteParts.length > 0) {
      expressionParts.push(`DELETE ${deleteParts.join(", ")}`);
    }

    // If no updates, return early
    if (expressionParts.length === 0) {
      return;
    }

    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { tokenId },
          ConditionExpression: "attribute_exists(tokenId)",
          UpdateExpression: expressionParts.join(" "),
          ExpressionAttributeNames: names,
          ...(Object.keys(values).length > 0 && {
            ExpressionAttributeValues: values,
          }),
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error(`Token not found: ${tokenId}`);
      }
      throw err;
    }
  }

  /**
   * Bootstrap authentication by verifying the provided token against the
   * configured bootstrap PHC string. Fails with reason `not_found` if the token
   * table is not empty or the bootstrap PHC is not set.
   *
   * @param token The token string to verify.
   * @param config The configuration for the issued token.
   * @returns The verification result.
   */
  async bootstrap(
    token: string,
    config: { owner: string },
  ): Promise<VerifyResult> {
    if (
      !this.bootstrapPhc ||
      !this.bootstrapPhcParsed ||
      (await this.getCount()) > 0
    ) {
      return failVerify("not_found");
    }

    const parsed = this.parse(token);
    if (!("tokenId" in parsed)) {
      return parsed;
    }
    const { tokenId, secret } = parsed;

    const verifyFailure = await this.verifySecret(
      secret,
      this.bootstrapPhcParsed,
    );
    if (verifyFailure) {
      return verifyFailure;
    }

    const result: ValidTokenRecord = {
      tokenId,
      owner: config.owner,
      isAdmin: true,
      createdAt: Math.floor(Date.now() / 1000),
    };

    await this.store({ ...result, secretPhc: this.bootstrapPhc });

    return {
      valid: true,
      record: result,
    };
  }

  private format(tokenId: string, secret: Buffer): string {
    const token = this.tokenPrefix + tokenId + "." + secret.toString("base64");
    assert(token.length <= MAX_TOKEN_LENGTH);
    return token;
  }

  private parse(token: string): ParsedToken | VerifyFailure {
    if (!token.startsWith(this.tokenPrefix)) {
      return failVerify("invalid_prefix");
    }

    if (token.length > MAX_TOKEN_LENGTH) {
      return failVerify("invalid_format");
    }

    const parts = token.substring(this.tokenPrefix.length).split(".");
    if (parts.length !== 2) {
      return failVerify("invalid_format");
    }

    const [tokenId, secretStr] = parts;
    if (!isId62(tokenId) || !isBase64(secretStr)) {
      return failVerify("invalid_format");
    }

    const secret = Buffer.from(secretStr, "base64");

    return { tokenId, secret };
  }

  private async createSecret(): Promise<{ secret: Buffer; secretPhc: string }> {
    const secret = randomBytes(this.keyLength);
    const salt = randomBytes(this.saltLength);

    const secretHash = await scrypt(
      secret,
      salt,
      this.keyLength,
      this.scryptOptions,
    );

    const secretPhc = serialize({
      id: SCRYPT_ALGORITHM_ID,
      params: {
        ln: Math.log2(this.scryptOptions.cost),
        r: this.scryptOptions.blockSize,
        p: this.scryptOptions.parallelization,
      },
      salt,
      hash: secretHash,
    });

    return { secret, secretPhc };
  }

  private parsePhc(phcString: string): ParsedPhc | VerifyFailure {
    let phc;
    try {
      phc = deserialize(phcString);
    } catch (cause) {
      return failVerify("invalid_phc", { cause });
    }

    if (phc.id !== SCRYPT_ALGORITHM_ID) {
      return failVerify("unsupported_algorithm");
    }

    if (
      !phc.salt ||
      !phc.hash ||
      !phc.params ||
      typeof phc.params.ln !== "number" ||
      typeof phc.params.r !== "number" ||
      typeof phc.params.p !== "number"
    ) {
      return failVerify("invalid_parameters");
    }

    return {
      valid: true,
      salt: phc.salt,
      hash: phc.hash,
      options: {
        cost: 1 << phc.params.ln,
        blockSize: phc.params.r,
        parallelization: phc.params.p,
      },
    };
  }

  private async verifySecret(
    secret: Buffer,
    phc: ParsedPhc,
  ): Promise<VerifyFailure | null> {
    const secretHash = await scrypt(
      secret,
      phc.salt,
      phc.hash.length,
      phc.options,
    );
    if (!timingSafeEqual(secretHash, phc.hash)) {
      return failVerify("invalid_secret");
    }

    return null;
  }

  private async load(tokenId: string): Promise<TokenRecord | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          tokenId,
        },
      }),
    );
    if (!result.Item) {
      return null;
    }

    const parseResult = tokenRecordSchema.safeParse(result.Item);
    if (!parseResult.success) {
      throw new Error(
        `Cannot load invalid record for token ${tokenId}: ${parseResult.error.message}`,
      );
    }

    return parseResult.data;
  }

  private async store(record: TokenRecord): Promise<void> {
    const parseResult = tokenRecordSchema.safeParse(record);
    if (!parseResult.success) {
      throw new Error(
        `Cannot store invalid token record: ${parseResult.error.message}`,
      );
    }

    const { roles, ...rest } = parseResult.data;
    const item: Record<string, unknown> = rest;
    if (roles?.length) {
      // Convert roles array to Set for DynamoDB storage (enables atomic ADD/DELETE)
      item.roles = new Set(roles);
    }

    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression: "attribute_not_exists(tokenId)",
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        throw new Error(`Token ID already exists: ${record.tokenId}`);
      }
      throw err;
    }
  }

  private async touch(tokenId: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { tokenId },
        UpdateExpression: "SET lastUsedAt = :now",
        ExpressionAttributeValues: { ":now": now },
      }),
    );
    return now;
  }
}

function isId62(s: string): boolean {
  return /^[a-zA-Z0-9]{21}$/.test(s);
}

function isBase64(s: string): boolean {
  // Accepts standard Base64 (with + and /) and URL-safe Base64 (with - and _)
  return /^[a-zA-Z0-9+-_/=]+$/.test(s);
}

function failVerify(
  reason: VerifyFailureReason,
  options: { record?: PublicTokenRecord; cause?: unknown } = {},
): VerifyFailure {
  return {
    valid: false,
    reason,
    ...options,
  };
}

function omitSecretPhc(record: TokenRecord): PublicTokenRecord {
  const { secretPhc: _secretPhc, ...publicRecord } = record;
  return publicRecord;
}
