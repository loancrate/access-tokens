# @access-tokens/client

[![npm](https://img.shields.io/npm/v/@access-tokens/client)](https://www.npmjs.com/package/@access-tokens/client)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Type-safe HTTP client for Personal Access Token (PAT) authentication services built with @access-tokens/express.

## Features

- **Type-Safe API**: Full TypeScript support with Zod schema validation
- **Automatic JWT Management**: Handles PAT-to-JWT exchange and renewal
- **Retry Logic**: Built-in exponential backoff with fetch-retry
- **Error Handling**: Comprehensive error types with detailed messages
- **Admin Operations**: Full token lifecycle management
- **Zero Dependencies**: Uses native fetch (Node.js 18+)

## Installation

```bash
npm install @access-tokens/client
```

## Quick Start

```typescript
import { AccessTokensClient } from "@access-tokens/client";

// Initialize client with PAT
const client = new AccessTokensClient({
  endpoint: "https://api.example.com",
  apiKey: "pat_abc123...", // Your Personal Access Token
});

// List all tokens (requires admin PAT)
const tokens = await client.list();
console.log("Total tokens:", tokens.length);

// Issue a new token
const { token, record } = await client.issue({
  owner: "user@example.com",
  isAdmin: false,
  expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
});

console.log("New token:", token);
console.log("Token ID:", record.tokenId);
```

## API Reference

### Constructor

#### `new AccessTokensClient(options)`

Creates a new client instance.

**Options:**

```typescript
{
  endpoint: string;        // Base URL of your PAT API (e.g., "https://api.example.com")
  apiKey: string;          // Your Personal Access Token
  authPath?: string;       // Auth endpoint path (default: "/auth")
  adminPath?: string;      // Admin endpoint path (default: "/admin")
  fetch?: typeof fetch;    // Custom fetch implementation (optional)
}
```

**Example:**

```typescript
const client = new AccessTokensClient({
  endpoint: "https://api.example.com",
  apiKey: process.env.PAT_TOKEN!,
  authPath: "/auth", // optional, default is "/auth"
  adminPath: "/admin", // optional, default is "/admin"
});
```

### Token Operations

All methods require an admin PAT unless otherwise noted.

#### `list(options?): Promise<PatRecord[]>`

Lists all tokens.

**Options:**

```typescript
{
  includeRevoked?: boolean;     // Include revoked tokens (default: false)
  includeExpired?: boolean;     // Include expired tokens (default: false)
  includeSecretPhc?: boolean;   // Include secret hashes (default: false)
  limit?: number;               // Max results per page
  afterTokenId?: string;        // Pagination token (tokenId to start after)
}
```

**Example:**

```typescript
// List all active tokens
const tokens = await client.list();

// List all tokens including revoked and expired
const allTokens = await client.list({
  includeRevoked: true,
  includeExpired: true,
});

// Paginated listing
const page1 = await client.list({ limit: 10 });
const page2 = await client.list({
  limit: 10,
  afterTokenId: page1[page1.length - 1].tokenId, // Use last token ID from previous page
});
```

#### `issue(params): Promise<{ token: string; record: PatRecord }>`

Issues a new token.

**Parameters:**

```typescript
{
  owner: string;           // Token owner (e.g., email address)
  isAdmin?: boolean;       // Whether token has admin privileges (default: false)
  expiresAt?: number;      // Unix timestamp for expiration (optional)
}
```

**Example:**

```typescript
const { token, record } = await client.issue({
  owner: "user@example.com",
  isAdmin: false,
  expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
});

// Give token to user securely
console.log("Token (show once):", token);
console.log("Token ID:", record.tokenId);
```

#### `register(params): Promise<TokenRecord>`

Registers a pre-generated token.

**Parameters:**

```typescript
{
  tokenId: string;         // Pre-generated token ID
  secretPhc: string;       // PHC-formatted secret hash
  owner: string;           // Token owner
  isAdmin?: boolean;       // Admin status (default: false)
  expiresAt?: number;      // Expiration timestamp (optional)
}
```

**Example:**

```typescript
await client.register({
  tokenId: "pregenerated123",
  secretPhc: "$scrypt$...",
  owner: "user@example.com",
  isAdmin: false,
});
```

#### `update(tokenId: string, updates): Promise<void>`

Updates an existing token.

**Updates:**

```typescript
{
  owner?: string;          // New owner
  isAdmin?: boolean;       // New admin status
  secretPhc?: string;      // New secret hash
  expiresAt?: number | null; // New expiration or null to remove
}
```

**Example:**

```typescript
// Promote user to admin
await client.update("34NwRzvnBbgI3uedkrQ3Q", {
  isAdmin: true,
});

// Change owner
await client.update("34NwRzvnBbgI3uedkrQ3Q", {
  owner: "newuser@example.com",
});

// Remove expiration
await client.update("34NwRzvnBbgI3uedkrQ3Q", {
  expiresAt: null,
});
```

#### `revoke(tokenId: string, options?: { expiresAt?: number }): Promise<void>`

Revokes a token. Optionally sets an expiration for automatic cleanup.

**Example:**

```typescript
// Revoke immediately
await client.revoke("34NwRzvnBbgI3uedkrQ3Q");

// Revoke with cleanup in 30 days
await client.revoke("34NwRzvnBbgI3uedkrQ3Q", {
  expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
});
```

#### `restore(tokenId: string): Promise<void>`

Restores a previously revoked token.

**Example:**

```typescript
await client.restore("34NwRzvnBbgI3uedkrQ3Q");
```

## JWT Token Exchange

The client automatically handles JWT token exchange:

1. On first API call, the client exchanges your PAT for a JWT
2. JWT is used for subsequent requests
3. When JWT expires (default: 1 hour), client automatically requests a new one
4. Your PAT is only sent during token exchange

This design provides:

- **Performance**: No DynamoDB lookup and scrypt operation on every request
- **Security**: Short-lived JWTs reduce risk if compromised
- **Transparency**: Automatic, no manual JWT management required

## Error Handling

The client throws standard `Error` objects. The `error.cause` property may contain additional details:

```typescript
import { AccessTokensClient, isApiError } from "@access-tokens/client";

try {
  await client.revoke("invalid-token-id");
} catch (error) {
  if (error instanceof Error) {
    console.error("Message:", error.message); // "Failed to revoke token"

    // error.cause may be an ApiError object or a string
    if (isApiError(error.cause)) {
      console.error("API Error:", error.cause.error.message);
      console.error("Code:", error.cause.error.code);
      console.error("Details:", error.cause.error.details);
    } else if (typeof error.cause === "string") {
      console.error("Status text:", error.cause);
    }
  }
}
```

**Common Error Status Codes:**

- `400` - Bad request (invalid parameters)
- `401` - Unauthorized (invalid or missing PAT/JWT)
- `403` - Forbidden (insufficient permissions, not admin)
- `404` - Not found (token doesn't exist)
- `500` - Internal server error

## Retry Behavior

The client uses exponential backoff for retries:

- **Retryable errors**: 408, 429, 500, 502, 503, 504 status codes
- **Non-retryable**: All other status codes
- **Fixed policy**: 3 retries with exponential backoff starting at 1s, capped at 30s
- **429 Rate Limits**: Respects `Retry-After` header when present

The retry policy is built-in and cannot be customized. If you need custom retry behavior, provide your own `fetch` implementation in the constructor options.

## Types

### `PatRecord`

```typescript
interface PatRecord {
  tokenId: string; // Unique token identifier (21 chars, alphanumeric)
  owner: string; // Token owner
  isAdmin: boolean; // Admin privileges
  secretPhc?: string; // PHC hash (only if includeSecretPhc=true)
  createdAt: number; // Unix timestamp
  lastUsedAt?: number | null; // Unix timestamp of last use
  expiresAt?: number | null; // Unix timestamp for expiration
  revokedAt?: number | null; // Unix timestamp when revoked (null if not revoked)
}
```

### `ApiError`

When API errors occur, they are provided as the `cause` property of the thrown `Error`:

```typescript
type ApiError = {
  error: {
    message: string; // Error message
    code?: string; // Optional error code
    details?: string | Record<string, unknown>; // Additional error details
  };
};
```

**Usage:**

```typescript
import { isApiError } from "@access-tokens/client";

try {
  await client.list();
} catch (error) {
  if (error instanceof Error && isApiError(error.cause)) {
    console.error(error.cause.error.message);
  }
}
```

## Requirements

- Node.js 20+ (native fetch support)
- @access-tokens/express server

## Related Packages

- [@access-tokens/core](https://www.npmjs.com/package/@access-tokens/core) - Core token management library
- [@access-tokens/express](https://www.npmjs.com/package/@access-tokens/express) - Express routes and middleware
- [@access-tokens/cli](https://www.npmjs.com/package/@access-tokens/cli) - Command-line token management

## License

[ISC](https://opensource.org/licenses/ISC) © 2025 Loan Crate, Inc.

## Links

- [GitHub Repository](https://github.com/loancrate/access-tokens)
- [npm Package](https://www.npmjs.com/package/@access-tokens/client)
- [Documentation](https://github.com/loancrate/access-tokens#readme)
