import * as z from "zod";

const dateSchema = z.union([
  z.iso.datetime().transform((s) => Math.floor(new Date(s).getTime() / 1000)),
  z.number().int().positive(),
  z.null(),
]);

export const endpointConfigSchema = z.object({
  url: z.url().optional(),
  adminToken: z.string().optional(),
  authPath: z.string().optional(),
  adminPath: z.string().optional(),
});

export type EndpointConfig = z.infer<typeof endpointConfigSchema>;

export const defaultsSchema = z.object({
  authPath: z.string().optional(),
  adminPath: z.string().optional(),
  adminToken: z.string().optional(),
});

export type Defaults = z.infer<typeof defaultsSchema>;

export const tokenDefinitionSchema = z.object({
  tokenId: z.string(),
  secretPhc: z.string().optional(),
  owner: z.string(),
  isAdmin: z.boolean().optional().default(false),
  revoked: z.boolean().optional().default(false),
  expiresAt: dateSchema.optional(),
});

export type TokenDefinition = z.infer<typeof tokenDefinitionSchema>;

export const configSchema = z.object({
  defaults: defaultsSchema.optional(),
  endpoints: z.record(z.string(), endpointConfigSchema).optional(),
  tokens: z.array(tokenDefinitionSchema).optional(),
});

export type Config = z.infer<typeof configSchema>;

export type MergedEndpointConfig = {
  url: string;
  adminToken: string;
  authPath: string;
  adminPath: string;
};
