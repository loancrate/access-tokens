import type { Logger } from "pino";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // Set by middleware such as `request-ip`
      clientIp?: string;
      // Optional logger set by consumer middleware
      logger?: Logger;
      // Set by JWT authentication middleware
      user?: {
        sub: string;
        owner: string;
        admin: boolean;
        roles: string[];
      };
    }
  }
}

export * from "./buildSignerVerifier";
export * from "./createAdminTokensRouter";
export * from "./createAuthRouter";
export * from "./createRequireAdmin";
export * from "./createRequireJwt";
export * from "./createRequireRole";
export * from "./generateKeySet";
