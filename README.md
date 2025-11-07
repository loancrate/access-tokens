# Access Tokens

[![CI](https://github.com/loancrate/access-tokens/actions/workflows/ci.yml/badge.svg)](https://github.com/loancrate/access-tokens/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/loancrate/access-tokens/branch/master/graph/badge.svg)](https://codecov.io/gh/loancrate/access-tokens)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A comprehensive TypeScript library for managing Personal Access Tokens (PATs)
with Express middleware, HTTP client, and CLI tools. Currently supports DynamoDB
as a storage backend.

## Features

- **Secure Token Management**: Scrypt-based hashing with PHC format
- **OAuth 2.0 Compatible**: JWT token exchange for API access
- **Express Integration**: Ready-to-use routes and middleware
- **HTTP Client**: Type-safe client library for token operations
- **CLI Tools**: Command-line interface for token management
- **DynamoDB Storage**: Scalable token persistence with TTL support
- **TypeScript**: Full type safety with modern ES2022+ support
- **Dual Module Support**: Both CommonJS and ESM builds
- **Comprehensive Testing**: Unit and integration tests with LocalStack

## Packages

| Package                                      | Description                   | Version                                                     |
| -------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| [@access-tokens/core](./packages/core)       | Core token management library | ![npm](https://img.shields.io/npm/v/@access-tokens/core)    |
| [@access-tokens/express](./packages/express) | Express routes and middleware | ![npm](https://img.shields.io/npm/v/@access-tokens/express) |
| [@access-tokens/client](./packages/client)   | HTTP client for PAT API       | ![npm](https://img.shields.io/npm/v/@access-tokens/client)  |
| [@access-tokens/cli](./packages/cli)         | Command-line token management | ![npm](https://img.shields.io/npm/v/@access-tokens/cli)     |

## Quick Start

### Installation

```bash
npm install @access-tokens/core @access-tokens/express
```

### Basic Usage

#### 1. Core Library

```typescript
import { DynamoDBPat } from "@access-tokens/core";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const pat = new DynamoDBPat({
  tableName: "my-tokens",
  docClient,
});

const { token, record } = await pat.issue({
  owner: "user@example.com",
  isAdmin: false,
  expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
});

console.log("Token:", token);
console.log("Token ID:", record.tokenId);

const result = await pat.verify(token);
console.log("Valid:", result.valid);
if (result.valid) {
  console.log("Owner:", result.record.owner);
}
```

#### 2. Express Integration

```typescript
import express from "express";
import { DynamoDBPat } from "@access-tokens/core";
import {
  createAuthRouter,
  createAdminTokensRouter,
  createRequireJwt,
  buildSignerVerifier,
  generateKeySet,
} from "@access-tokens/express";

const app = express();
const pat = new DynamoDBPat({ tableName: "tokens", docClient });

const keySet = await generateKeySet("my-key-id-1");
const signerVerifier = await buildSignerVerifier({
  keySet,
  issuer: "my-app",
  ttl: "1h",
});

app.use("/auth", createAuthRouter({ pat, signerVerifier }));
app.use("/admin", createAdminTokensRouter({ pat, signerVerifier }));

const requireJwt = createRequireJwt({ signerVerifier });
const requireAdmin = createRequireAdmin();

app.get("/require-user", requireJwt, (req, res) => {
  res.json({ user: req.user });
});

app.get("/require-admin", requireJwt, requireAdmin, (req, res) => {
  res.json({ user: req.user });
});

app.listen(3000);
```

#### 3. Client Library

```typescript
import { AccessTokensClient } from "@access-tokens/client";

const client = new AccessTokensClient({
  endpoint: "https://api.example.com",
  apiKey: "pat_abc123...",
});

const tokens = await client.list();
```

#### 4. CLI Usage

```bash
# Issue a new token
npx @access-tokens/cli issue \
  --url https://api.example.com \
  --admin-token <your-admin-token> \
  --owner user@example.com \
  --admin

# List all tokens
npx @access-tokens/cli list \
  --url https://api.example.com \
  --admin-token <your-admin-token>

# Revoke a token
npx @access-tokens/cli revoke <token-id> \
  --url https://api.example.com \
  --admin-token <your-admin-token>
```

## Architecture

### Token Format

Tokens follow the format: `{prefix}{tokenId}.{secret}`

- **Prefix**: Configurable (default: `pat_`)
- **Token ID**: 21-character Base62-encoded identifier
- **Secret**: Base64-encoded random bytes (32 bytes default)

### Security Model

- Secrets are hashed using **scrypt** (cost=16384, blockSize=8, parallelization=1)
- Hashes stored in **PHC string format** for algorithm agility
- **Timing-safe comparison** to prevent timing attacks
- DynamoDB **TTL** for automatic token expiration

### OAuth 2.0 Flow

1. Client presents PAT to `/auth/token` endpoint
2. Server validates PAT and issues short-lived JWT
3. Client uses JWT for subsequent API requests
4. JWT verified by `requireJwt` middleware

## Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- AWS CLI (for LocalStack setup)
- Docker (for LocalStack)

### Setup

```bash
git clone https://github.com/loancrate/access-tokens.git
cd access-tokens

pnpm install

pnpm build

pnpm test:coverage
```

### Running the Example

```bash
pnpm dev
```

See [packages/example/README.md](./packages/example/README.md) for more details.

## Testing

```bash
# Run all checks
pnpm typecheck
pnpm format:check
pnpm lint
pnpm test:coverage

# Auto-format code
pnpm format
```

## Documentation

- [Core Package](./packages/core/README.md)
- [Express Package](./packages/express/README.md)
- [Client Package](./packages/client/README.md)
- [CLI Package](./packages/cli/README.md)
- [Example Application](./packages/example/README.md)

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## License

[ISC](./LICENSE) © 2025 Loan Crate, Inc.
