import * as z from "zod";

export const authTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  state: z.string().optional(),
});

export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;

export const tokenRecordSchema = z.object({
  tokenId: z
    .string()
    .length(21)
    .regex(/^[a-zA-Z0-9]+$/),
  secretPhc: z.string().optional(),
  owner: z.string(),
  isAdmin: z.boolean(),
  roles: z.array(z.string()).optional(),
  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().nullish(),
  expiresAt: z.number().int().nonnegative().nullish(),
  revokedAt: z.number().int().nonnegative().nullish(),
});

export type TokenRecord = z.infer<typeof tokenRecordSchema>;

export const listResponseSchema = z.object({
  records: z.array(tokenRecordSchema),
});

export type ListResponse = z.infer<typeof listResponseSchema>;

export const issueResultSchema = z.object({
  token: z.string(),
  record: tokenRecordSchema,
});

export type IssueResult = z.infer<typeof issueResultSchema>;

export const registerResultSchema = z.object({
  record: tokenRecordSchema,
});

export type RegisterResult = z.infer<typeof registerResultSchema>;

export type ListOptions = {
  afterTokenId?: string;
  limit?: number;
  includeRevoked?: boolean;
  includeExpired?: boolean;
  includeSecretPhc?: boolean;
  hasRole?: string;
};

export const batchLoadResultSchema = z.object({
  found: z.array(tokenRecordSchema),
  notFound: z.array(z.string()),
});

export type BatchLoadResult = z.infer<typeof batchLoadResultSchema>;

export type BatchLoadOptions = {
  includeSecretPhc?: boolean;
};

export type IssueConfig = {
  tokenId?: string;
  owner: string;
  isAdmin?: boolean;
  roles?: string[];
  expiresAt?: number;
};

export type RegisterConfig = {
  tokenId: string;
  secretPhc: string;
  owner: string;
  isAdmin?: boolean;
  roles?: string[];
  expiresAt?: number;
};

export type RolesUpdate =
  | string[]
  | { add: string[]; remove?: never }
  | { add?: never; remove: string[] };

export type UpdateConfig = {
  secretPhc?: string;
  owner?: string;
  isAdmin?: boolean;
  roles?: RolesUpdate;
  expiresAt?: number | null;
};

export type RevokeOptions = {
  expiresAt?: number;
};
