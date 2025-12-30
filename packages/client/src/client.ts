import fetchBuilder from "fetch-retry";

import { createApiResponseError } from "./apiError";
import { Fetch, fetchRetryPolicy } from "./fetchRetryPolicy";
import {
  authTokenResponseSchema,
  BatchLoadOptions,
  BatchLoadResult,
  batchLoadResultSchema,
  IssueConfig,
  IssueResult,
  issueResultSchema,
  ListOptions,
  listResponseSchema,
  RegisterConfig,
  registerResultSchema,
  RevokeOptions,
  TokenRecord,
  UpdateConfig,
} from "./schemas";

const MIN_TOKEN_VALIDITY_MS = 30 * 1000;

export type AccessTokensClientConfig = {
  fetch?: Fetch;
  endpoint: string;
  apiKey: string;
  authPath?: string;
  adminPath?: string;
};

export class AccessTokensClient {
  private readonly fetch: Fetch;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly authPath: string;
  private readonly adminPath: string;
  private jwtToken?: string;
  private jwtTokenExpiry?: number;

  constructor(config: AccessTokensClientConfig) {
    this.fetch = config.fetch || fetchBuilder(global.fetch, fetchRetryPolicy);
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.authPath = config.authPath || "/auth";
    this.adminPath = config.adminPath || "/admin";
  }

  private async authenticate(): Promise<string> {
    if (
      !this.jwtToken ||
      this.jwtTokenExpiry == null ||
      Date.now() + MIN_TOKEN_VALIDITY_MS >= this.jwtTokenExpiry
    ) {
      const response = await this.fetch(
        `${this.endpoint}${this.authPath}/token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        },
      );

      if (!response.ok) {
        throw await createApiResponseError(response, "Failed to authenticate");
      }

      const data = await response.json();
      const parsed = authTokenResponseSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error("Invalid auth token response", { cause: parsed.error });
      }

      this.jwtToken = parsed.data.access_token;
      this.jwtTokenExpiry = Date.now() + parsed.data.expires_in * 1000;
    }
    return this.jwtToken;
  }

  async list(options?: ListOptions): Promise<TokenRecord[]> {
    const jwtToken = await this.authenticate();

    const params = new URLSearchParams();
    if (options?.afterTokenId) {
      params.set("afterTokenId", options.afterTokenId);
    }
    if (options?.limit != null) {
      params.set("limit", options.limit.toString());
    }
    if (options?.includeRevoked) {
      params.set("includeRevoked", "true");
    }
    if (options?.includeExpired) {
      params.set("includeExpired", "true");
    }
    if (options?.includeSecretPhc) {
      params.set("includeSecretPhc", "true");
    }
    if (options?.hasRole) {
      params.set("hasRole", options.hasRole);
    }

    const query = params.toString();
    const url = `${this.endpoint}${this.adminPath}/tokens${query && `?${query}`}`;

    const response = await this.fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    });

    if (!response.ok) {
      throw await createApiResponseError(response, "Failed to list tokens");
    }

    const data = await response.json();
    const parsed = listResponseSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid list tokens response", { cause: parsed.error });
    }

    return parsed.data.records;
  }

  async batchLoad(
    tokenIds: Set<string>,
    options?: BatchLoadOptions,
  ): Promise<BatchLoadResult> {
    const jwtToken = await this.authenticate();

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens/batch`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenIds: Array.from(tokenIds),
          includeSecretPhc: options?.includeSecretPhc,
        }),
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(
        response,
        "Failed to batch load tokens",
      );
    }

    const data = await response.json();
    const parsed = batchLoadResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid batch load response", {
        cause: parsed.error,
      });
    }

    return parsed.data;
  }

  async issue(config: IssueConfig): Promise<IssueResult> {
    const jwtToken = await this.authenticate();

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(response, "Failed to issue token");
    }

    const data = await response.json();
    const parsed = issueResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid issue token response", { cause: parsed.error });
    }

    return parsed.data;
  }

  async register(config: RegisterConfig): Promise<TokenRecord> {
    const jwtToken = await this.authenticate();

    const { tokenId, ...rest } = config;

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens/${tokenId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(rest),
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(
        response,
        `Failed to register token ${tokenId}`,
      );
    }

    const data = await response.json();
    const parsed = registerResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid register token response", {
        cause: parsed.error,
      });
    }

    return parsed.data.record;
  }

  async update(tokenId: string, updates: UpdateConfig): Promise<void> {
    const jwtToken = await this.authenticate();

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens/${tokenId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(
        response,
        `Failed to update token ${tokenId}`,
      );
    }
  }

  async revoke(tokenId: string, options?: RevokeOptions): Promise<void> {
    const jwtToken = await this.authenticate();

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens/${tokenId}/revoke`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options || {}),
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(
        response,
        `Failed to revoke token ${tokenId}`,
      );
    }
  }

  async restore(tokenId: string): Promise<void> {
    const jwtToken = await this.authenticate();

    const response = await this.fetch(
      `${this.endpoint}${this.adminPath}/tokens/${tokenId}/restore`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    );

    if (!response.ok) {
      throw await createApiResponseError(
        response,
        `Failed to restore token ${tokenId}`,
      );
    }
  }
}
