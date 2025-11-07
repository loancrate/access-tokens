import * as z from "zod";

export const MAX_TOKEN_LENGTH = 200;
export const MAX_SECRET_PHC_LENGTH = 200;
export const MAX_OWNER_LENGTH = 100;

export const tokenRecordSchema = z.object({
  tokenId: z
    .string()
    .length(21)
    .regex(/^[a-zA-Z0-9]+$/),
  secretPhc: z.string().min(1).max(MAX_SECRET_PHC_LENGTH),
  owner: z.string().min(1).max(MAX_OWNER_LENGTH),
  isAdmin: z.boolean().default(false),
  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().nullish(),
  revokedAt: z.number().int().nonnegative().nullish(),
  expiresAt: z.number().int().nonnegative().nullish(),
});

export type TokenRecord = z.infer<typeof tokenRecordSchema>;
