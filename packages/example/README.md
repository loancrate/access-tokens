# Access Tokens Example Application

This example demonstrates how to use all four `@access-tokens` packages together:

- `@access-tokens/core` - Core token management
- `@access-tokens/express` - Express middleware and routes
- `@access-tokens/client` - HTTP client for the API
- `@access-tokens/cli` - Command-line token management

## Prerequisites

- Node.js 20+
- A local AWS emulator on port 4566 (`pnpm test-int` from the repo root starts
  one, or run `scripts/start-aws-emulator.sh` directly), or real AWS DynamoDB

## Quick Start

```bash
pnpm install

pnpm dev
```

The server will start on `http://localhost:3000`.
