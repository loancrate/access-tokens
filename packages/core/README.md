# @access-tokens/core

[![npm](https://img.shields.io/npm/v/@access-tokens/core)](https://www.npmjs.com/package/@access-tokens/core)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Core library for managing Personal Access Tokens (PATs) with secure scrypt-based hashing. Supports DynamoDB backend.

## Features

- **Secure Token Generation**: Cryptographically secure random token generation
- **Scrypt Hashing**: Industry-standard password hashing with PHC format
- **Token Lifecycle Management**: Issue, verify, update, revoke, and restore tokens
- **Role-Based Access Control**: Attach arbitrary roles to tokens with atomic add/remove operations
- **DynamoDB Integration**: Low-cost, scalable storage with TTL expiration
- **TypeScript**: Full type safety with comprehensive API types

## Installation

```bash
npm install @access-tokens/core
```

## Quick Start

```typescript
import { DynamoDBPat } from "@access-tokens/core";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Create DynamoDBPat instance
const pat = new DynamoDBPat({
  tableName: "my-tokens",
  docClient,
});

// Issue a new token
const { token, record } = await pat.issue({
  owner: "user@example.com",
  isAdmin: false,
  expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
});

console.log("Token:", token); // pat_abc123...xyz
console.log("Token ID:", record.tokenId);

// Verify a token
const result = await pat.verify(token);
if (result.valid) {
  console.log("Token is valid!");
  console.log("Owner:", result.record.owner);
  console.log("Is Admin:", result.record.isAdmin);
}
```

## API Reference

### Constructor

#### `new DynamoDBPat(options)`

Creates a new DynamoDBPat instance.

**Options:**

```typescript
{
  tableName: string;                    // DynamoDB table name (required)
  ddbClient?: DynamoDBClient;           // AWS DynamoDB Client (optional)
  docClient?: DynamoDBDocumentClient;   // AWS DynamoDB Document Client (optional)
  tokenPrefix?: string;                 // Token prefix (default: "pat_")
  keyLength?: number;                   // Scrypt key length in bytes (default: 64)
  saltLength?: number;                  // Scrypt salt length in bytes (default: 16)
  scryptOptions?: {                     // Scrypt configuration (optional)
    cost?: number;                      // CPU/memory cost (default: 16384)
    blockSize?: number;                 // Block size (default: 8)
    parallelization?: number;           // Parallelization (default: 1)
    maxmem?: number;                    // Maximum memory (optional)
  };
  bootstrapPhc?: string;                // Bootstrap PHC for key derivation (optional)
}
```

**Note:** You only need to provide one of `ddbClient` or `docClient`, not both.
If neither is provided, a default DynamoDB client will be created automatically.
If only `ddbClient` is provided, a document client will be created from it. If
`docClient` is provided, it will be used directly.

### Token Operations

#### `issue(params): Promise<{ token: string; record: PatRecord }>`

Issues a new token.

**Parameters:**

```typescript
{
  owner: string;           // Token owner (e.g., email address)
  isAdmin: boolean;        // Whether token has admin privileges
  roles?: string[];        // Array of role strings (optional, max 50 roles, 100 chars each)
  expiresAt?: number;      // Unix timestamp for expiration (optional)
  tokenId?: string;        // Pre-generated token ID (optional)
}
```

**Returns:** Object containing the full token string and the database record.

#### `verify(token: string): Promise<VerifyResult>`

Verifies a token and returns its record if valid.

**Returns:**

```typescript
{
  valid: boolean;
  record?: PatRecord;      // Only present if valid=true
  reason?: string;         // Only present if valid=false
}
```

**Reasons for invalid tokens:**

- `"invalid_prefix"` - Token prefix doesn't match expected prefix
- `"invalid_format"` - Token format is incorrect (malformed)
- `"not_found"` - Token ID not found in database
- `"invalid_phc"` - Stored PHC hash format is invalid
- `"unsupported_algorithm"` - Hash algorithm in PHC is not supported
- `"invalid_parameters"` - Scrypt parameters in PHC are invalid
- `"invalid_secret"` - Secret doesn't match stored hash
- `"revoked"` - Token has been revoked
- `"expired"` - Token has expired

#### `register(params): Promise<TokenRecord>`

Registers a token with a pre-generated ID and secret hash.

**Parameters:**

```typescript
{
  tokenId: string;         // Token ID
  secretPhc: string;       // PHC-formatted secret hash
  owner: string;           // Token owner
  isAdmin: boolean;        // Admin status
  roles?: string[];        // Array of role strings (optional)
  expiresAt?: number;      // Expiration timestamp (optional)
}
```

#### `update(tokenId: string, updates): Promise<void>`

Updates an existing token's properties. Supports atomic role add/remove operations.

**Parameters:**

- `tokenId: string` - Token ID to update
- `updates: object` - Properties to update:

```typescript
{
  owner?: string;          // New owner (optional)
  isAdmin?: boolean;       // New admin status (optional)
  roles?: RolesUpdate;     // Roles update (optional, see below)
  secretPhc?: string;      // New secret hash (optional)
  expiresAt?: number | null; // New expiration or null to remove (optional)
}

// RolesUpdate can be:
type RolesUpdate =
  | string[]               // Replace all roles
  | { add: string[] }      // Atomic add (cannot combine with remove)
  | { remove: string[] }   // Atomic remove (cannot combine with add)
```

**Examples:**

```typescript
// Update basic properties
await pat.update("34NwRzvnBbgI3uedkrQ3Q", { owner: "newuser@example.com" });

// Replace all roles
await pat.update("34NwRzvnBbgI3uedkrQ3Q", { roles: ["reader", "writer"] });

// Add roles atomically (idempotent)
await pat.update("34NwRzvnBbgI3uedkrQ3Q", { roles: { add: ["admin"] } });

// Remove roles atomically (idempotent)
await pat.update("34NwRzvnBbgI3uedkrQ3Q", { roles: { remove: ["guest"] } });

// Clear all roles
await pat.update("34NwRzvnBbgI3uedkrQ3Q", { roles: [] });

// Update multiple properties at once
await pat.update("34NwRzvnBbgI3uedkrQ3Q", {
  owner: "newuser@example.com",
  roles: { add: ["admin"] },
});
```

#### `revoke(tokenId: string, options?: { expiresAt?: number }): Promise<void>`

Revokes a token. Optionally sets an expiration for automatic cleanup.

**Example:**

```typescript
// Revoke immediately
await pat.revoke("34NwRzvnBbgI3uedkrQ3Q");

// Revoke with cleanup in 30 days
await pat.revoke("34NwRzvnBbgI3uedkrQ3Q", {
  expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
});
```

#### `restore(tokenId: string): Promise<void>`

Restores a previously revoked token.

**Example:**

```typescript
await pat.restore("34NwRzvnBbgI3uedkrQ3Q");
```

#### `list(options?): AsyncGenerator<PublicTokenRecord>`

Lists all tokens with optional filtering. Returns an async generator that yields tokens.

**Options:**

```typescript
{
  afterTokenId?: string;         // Start after this token ID (pagination)
  limit?: number;                // Maximum tokens to return
  includeSecretPhc?: boolean;    // Include secret hashes (default: false)
  hasRole?: string;              // Filter tokens that have this role (optional)
}
```

**Example:**

```typescript
// Iterate through all tokens
for await (const token of pat.list()) {
  console.log(token.owner);
}

// With pagination
for await (const token of pat.list({
  limit: 100,
  afterTokenId: "34NwRzvnBbgI3uedkrQ3Q",
})) {
  console.log(token);
}
```

**Note:** Filtering for revoked and expired tokens should be done by the caller after retrieving records.

### Token Generation Utilities

#### `generate(config?: { tokenId?: string }): Promise<{ token: string; tokenId: string; secretPhc: string }>`

Generates a token without storing it in the database. Useful for pre-generating tokens.

**Example:**

```typescript
// Generate new token
const { token, tokenId, secretPhc } = await pat.generate();

// Generate with specific token ID
const result = await pat.generate({ tokenId: "34NwRzvnBbgI3uedkrQ3Q" });
```

## Token Format

Tokens follow the format: `{prefix}{tokenId}.{secret}`

Example: `pat_34NwRzvnBbgI3uedkrQ3Q.a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0x1y2z3`

- **Prefix**: Configurable (default: `pat_`)
- **Token ID**: 21-character Base62-encoded unique identifier
- **Secret**: Base64-encoded random bytes (default: 32 bytes = 43 Base64 chars)

## Security

- **Scrypt Hashing**: Secrets are hashed using scrypt with secure default parameters
- **PHC Format**: Hashes stored in Argon2-compatible PHC string format for algorithm agility
- **Timing-Safe Comparison**: Constant-time comparison prevents timing attacks
- **Secure Random Generation**: Uses Node.js `crypto.randomBytes()` for token generation

## DynamoDB Schema

### Table

**Primary Key:**

- Partition Key: `tokenId` (String)

**Attributes:**

- `tokenId`: Unique token identifier
- `secretPhc`: PHC-formatted secret hash
- `owner`: Token owner identifier
- `isAdmin`: Boolean admin flag
- `roles`: String Set of role names (optional, stored as DynamoDB SS type)
- `isRevoked`: Boolean revoked status
- `expiresAt`: Unix timestamp (optional, enables TTL)
- `createdAt`: Unix timestamp
- `updatedAt`: Unix timestamp

**Global Secondary Index (recommended):**

- Index Name: `owner-index`
- Partition Key: `owner` (String)
- Enables efficient `listByOwner()` queries

### TTL Configuration

Configure DynamoDB TTL on the `expiresAt` attribute for automatic cleanup of expired tokens.

## Error Handling

All methods may throw errors. Use try-catch for error handling:

```typescript
try {
  const result = await pat.verify(token);
  if (!result.valid) {
    console.log("Invalid token:", result.reason);
  }
} catch (error) {
  console.error("Error verifying token:", error);
}
```

## Requirements

- Node.js 20+
- AWS SDK v3
- DynamoDB table with appropriate permissions

## Related Packages

- [@access-tokens/express](https://www.npmjs.com/package/@access-tokens/express) - Express routes and middleware
- [@access-tokens/client](https://www.npmjs.com/package/@access-tokens/client) - HTTP client for PAT API
- [@access-tokens/cli](https://www.npmjs.com/package/@access-tokens/cli) - Command-line token management

## License

[ISC](https://opensource.org/licenses/ISC) © 2025 Loan Crate, Inc.

## Links

- [GitHub Repository](https://github.com/loancrate/access-tokens)
- [npm Package](https://www.npmjs.com/package/@access-tokens/core)
- [Documentation](https://github.com/loancrate/access-tokens#readme)
