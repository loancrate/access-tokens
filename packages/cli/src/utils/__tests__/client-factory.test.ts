import { AccessTokensClient } from "@access-tokens/client";

import { MergedEndpointConfig } from "../../config/schemas";
import { createClient } from "../client-factory";

describe("createClient", () => {
  it("should create an AccessTokensClient with provided config", () => {
    const config: MergedEndpointConfig = {
      url: "https://api.example.com",
      adminToken: "test-admin-token",
      authPath: "/custom-auth",
      adminPath: "/custom-admin",
    };

    const client = createClient(config);

    expect(client).toBeInstanceOf(AccessTokensClient);
    // Verify the client was configured with the correct values
    expect(client["endpoint"]).toBe("https://api.example.com");
    expect(client["apiKey"]).toBe("test-admin-token");
    expect(client["authPath"]).toBe("/custom-auth");
    expect(client["adminPath"]).toBe("/custom-admin");
  });
});
