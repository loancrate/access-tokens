# @access-tokens/express

[![npm](https://img.shields.io/npm/v/@access-tokens/express)](https://www.npmjs.com/package/@access-tokens/express)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Express routes and middleware for Personal Access Token (PAT) authentication with OAuth 2.0-compatible JWT token exchange.

## Features

- **Ready-to-Use Routes**: Pre-built authentication and admin token management endpoints
- **JWT Token Exchange**: OAuth 2.0-compatible token endpoint for PAT-to-JWT exchange
- **Express Middleware**: `requireJwt` and `requireAdmin` middleware for route protection
- **JOSE Integration**: Industry-standard JWT signing and verification
- **TypeScript**: Full type safety with Express request augmentation
- **Flexible Configuration**: Customizable paths, token lifetime, and key management

## Installation

```bash
npm install @access-tokens/express @access-tokens/core
```

## Quick Start

```typescript
import express from "express";
import { DynamoDBPat } from "@access-tokens/core";
import {
  createAuthRouter,
  createAdminTokensRouter,
  createRequireJwt,
  createRequireAdmin,
  buildSignerVerifier,
  generateKeySet,
} from "@access-tokens/express";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const app = express();
app.use(express.json());

// Initialize DynamoDB
const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const pat = new DynamoDBPat({ tableName: "tokens", docClient });

// Generate JWT signing keys
const keySet = await generateKeySet("my-key-id-1");
const signerVerifier = await buildSignerVerifier({
  keySet,
  issuer: "my-app",
  ttl: "1h",
});

// Add authentication and token admin routes
app.use("/auth", createAuthRouter({ pat, signerVerifier }));
app.use("/admin", createAdminTokensRouter({ pat, signerVerifier }));

const requireJwt = createRequireJwt({ signerVerifier });
const requireAdmin = createRequireAdmin();

// Your protected routes
app.get("/api/data", requireJwt, (req, res) => {
  res.json({
    message: "User data",
    user: req.user, // { sub, owner, admin }
  });
});

app.get("/api/admin/data", requireJwt, requireAdmin, (req, res) => {
  res.json({
    message: "Admin data",
    user: req.user, // { sub, owner, admin }
  });
});

app.listen(3000, () => console.log("Server running on port 3000"));
```

## API Reference

### Routes

#### `createAuthRouter(options)`

Creates an Express router with authentication endpoints.

**Options:**

```typescript
{
  pat: DynamoDBPat;                    // DynamoDBPat instance
  signerVerifier: JwtSignerVerifier;   // JWT signer/verifier from buildSignerVerifier()
  logger?: pino.Logger;                // Optional logger
}
```

**Note:** JWT lifetime (TTL) is configured in `buildSignerVerifier()`.

**Endpoints:**

- `POST /token` - Exchange PAT for JWT (OAuth 2.0 token endpoint)

  **Request Body:**

  ```typescript
  {
    grant_type?: "client_credentials";  // Optional, must be "client_credentials" if provided
    client_secret?: string;             // PAT (for OAuth 2.0 client_secret_post method)
    client_id?: string;                 // Optional, accepted but not used
    state?: string;                     // Optional, echoed back in response
  }
  ```

  **Authentication Methods** (checked in this order):
  1. **Body parameter** (OAuth 2.0 `client_secret_post`): Include `client_secret` in request body
  2. **Basic authentication** (OAuth 2.0 `client_secret_basic`): Use `Authorization: Basic <base64>` header (format: `Basic base64(":<token>")`)
  3. **Bearer token**: Use `Authorization: Bearer <token>` header

  **Response:**

  ```json
  {
    "access_token": "eyJ...", // The signed JWT
    "token_type": "Bearer", // Always "Bearer"
    "expires_in": 3600, // JWT lifetime in seconds
    "state": "..." // Optional, echoed from request
  }
  ```

**Examples:**

```bash
# Method 1: Body parameter (client_secret_post)
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_secret":"pat_abc123..."}'

# Method 2: Basic authentication (client_secret_basic)
curl -X POST http://localhost:3000/auth/token \
  -H "Authorization: Basic $(echo -n ":pat_abc123..." | base64)"

# Method 3: Bearer token (non-OAuth)
curl -X POST http://localhost:3000/auth/token \
  -H "Authorization: Bearer pat_abc123..."
```

#### `createAdminTokensRouter(options)`

Creates an Express router with admin token management endpoints. Requires JWT authentication and admin privileges.

**Options:**

```typescript
{
  pat: DynamoDBPat;                              // DynamoDBPat instance
  signerVerifier: JwtSignerVerifier;             // JWT signer/verifier
  logger?: pino.Logger;                          // Optional logger
}
```

**Endpoints:**

- `GET /tokens` - List tokens
  - **Query Params:** `afterTokenId`, `limit`, `includeRevoked`, `includeExpired`, `includeSecretPhc`
  - **Response:** `{ "records": [...] }`

- `POST /tokens` - Issue a new token
  - **Request Body:** `{ "owner": "user@example.com", "isAdmin"?: false, "tokenId"?: "...", "expiresAt"?: 1234567890 }`
  - **Response:** `{ "token": "pat_...", "record": {...} }`

- `PUT /tokens/:tokenId` - Register pre-generated token
  - **Request Body:** `{ "secretPhc": "...", "owner": "...", "isAdmin"?: false, "expiresAt"?: 1234567890 }`
  - **Response:** `{ "record": {...} }`

- `PATCH /tokens/:tokenId` - Update token
  - **Request Body:** `{ "owner"?: "...", "isAdmin"?: true, "secretPhc"?: "...", "expiresAt"?: 1234567890 }`
  - **Response:** 204 No Content

- `PUT /tokens/:tokenId/revoke` - Revoke token
  - **Request Body:** `{ "expiresAt"?: 1234567890 }` (optional)
  - **Response:** 204 No Content

- `PUT /tokens/:tokenId/restore` - Restore revoked token
  - **Response:** 204 No Content

- `POST /tokens/batch` - Batch retrieve tokens
  - **Request Body:** `{ "tokenIds": ["id1", "id2"], "includeSecretPhc"?: false }`
  - **Response:** `{ "found": [...], "missing": [...] }`

**Note:** All endpoints require JWT authentication and admin privileges. They
use `requireJwt` and `requireAdmin` middleware internally.

### Middleware

#### `createRequireJwt(options)`

Creates middleware that validates JWT tokens and populates `req.user`.

**Options:**

```typescript
{
  signerVerifier: JwtSignerVerifier;   // JWT signer/verifier from buildSignerVerifier()
  logger?: pino.Logger;                // Optional logger
}
```

**Request Extension:**

```typescript
req.user = {
  sub: string;      // Token ID
  owner: string;    // Token owner
  admin: boolean;   // Admin status
};
```

**Usage:**

```typescript
const requireJwt = createRequireJwt({ signerVerifier });

app.get("/protected", requireJwt, (req, res) => {
  console.log("User:", req.user?.owner);
  res.json({ data: "secret" });
});
```

#### `createRequireAdmin(options?)`

Creates middleware that requires `req.user.admin` to be `true`. Must be used after `requireJwt`.

**Options:**

```typescript
{
  logger?: pino.Logger;  // Optional logger
}
```

**Usage:**

```typescript
const requireAdmin = createRequireAdmin();

app.delete("/users/:id", requireJwt, requireAdmin, (req, res) => {
  // Only admin users can access this
  res.json({ success: true });
});
```

### JWT Utilities

#### `generateKeySet(kid: string, algorithm?: "EdDSA" | "RS256")`

Generates a new asymmetric key set for JWT signing.

**Parameters:**

- `kid: string` - Key ID (required) - unique identifier for this key set
- `algorithm?: "EdDSA" | "RS256"` - Signing algorithm (default: "EdDSA")

**Returns:**

```typescript
{
  active_kid: string;    // The active key ID
  private_keys: JWK[];   // Array of private keys in JWK format
  public_keys: JWK[];    // Array of public keys in JWK format
}
```

**Example:**

```typescript
const keySet = await generateKeySet("my-key-id-1");
// or with specific algorithm
const rsaKeySet = await generateKeySet("rsa-key-1", "RS256");
```

**Note:** Store keys securely (e.g., AWS Secrets Manager, environment variables). Generate once and reuse.

#### `buildSignerVerifier(config)`

Creates JWT signer and verifier from a key set.

**Config:**

```typescript
{
  keySet: KeySet; // From generateKeySet()
  issuer: string; // JWT issuer claim
  ttl: string; // Token time-to-live (e.g., "1h", "30m")
}
```

**Returns:**

```typescript
JwtSignerVerifier {
  sign: (claims) => Promise<string>;
  verify: (jws: string) => Promise<JWTVerifyResult>;
  jwks: { keys: readonly JWK[] };
}
```

**Example:**

```typescript
const keySet = await generateKeySet("my-key-id");
const signerVerifier = await buildSignerVerifier({
  keySet,
  issuer: "my-app",
  ttl: "1h",
});
```

## OAuth 2.0 Flow

This library implements a simplified OAuth 2.0 client credentials flow:

1. **Client authenticates** with PAT to `POST /auth/token`
2. **Server validates** PAT and issues short-lived JWT (default: 1 hour)
3. **Client uses JWT** for subsequent API requests via `Authorization: Bearer <jwt>`
4. **Server validates JWT** using `requireJwt` middleware

### Why JWT Exchange?

- **Performance**: Avoid DynamoDB lookup and scrypt on every request
- **Scalability**: Stateless JWT verification
- **Short-lived**: Reduced risk if JWT is compromised
- **Standard**: OAuth 2.0 compatible

## Security Best Practices

1. **Use HTTPS** - Always use TLS in production
2. **Secure Key Storage** - Store private keys in secure vaults (AWS Secrets Manager, etc.)
3. **Short JWT Lifetime** - Default 1 hour is recommended
4. **Rotate Keys** - Implement key rotation for long-running services
5. **Validate Issuer/Audience** - Configure these in production
6. **Rate Limiting** - Add rate limiting to `/auth/token` endpoint

## Key Generation

Generate keys using the included tool:

```bash
pnpm --filter @access-tokens/express genkey
```

Or programmatically:

```typescript
import { generateKeySet } from "@access-tokens/express";

const keys = await generateKeySet("my-key-id-1");
console.log("Public Key:", keys.public_keys);
console.log("Private Key:", keys.private_keys);
```

Store these keys securely and pass them to your application via environment variables.

## Error Handling

All endpoints return standard HTTP error codes:

- `400 Bad Request` - Invalid request body or parameters
- `401 Unauthorized` - Invalid or missing token
- `403 Forbidden` - Insufficient permissions (not admin)
- `404 Not Found` - Token not found
- `500 Internal Server Error` - Server error

Example error response:

```json
{
  "error": "Invalid token",
  "details": "Token has been revoked"
}
```

## TypeScript Types

The package extends Express types:

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string; // Token ID
        owner: string; // Token owner
        admin: boolean; // Admin status
      };
      logger?: Logger; // Optional Pino logger
      clientIp?: string; // Optional client IP (from request-ip)
    }
  }
}
```

## Requirements

- Node.js 20+
- Express 4.18+ or 5.0+
- @access-tokens/core

## Related Packages

- [@access-tokens/core](https://www.npmjs.com/package/@access-tokens/core) - Core token management library
- [@access-tokens/client](https://www.npmjs.com/package/@access-tokens/client) - HTTP client for PAT API
- [@access-tokens/cli](https://www.npmjs.com/package/@access-tokens/cli) - Command-line token management

## License

[ISC](https://opensource.org/licenses/ISC) © 2025 Loan Crate, Inc.

## Links

- [GitHub Repository](https://github.com/loancrate/access-tokens)
- [npm Package](https://www.npmjs.com/package/@access-tokens/express)
- [Documentation](https://github.com/loancrate/access-tokens#readme)
