# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript monorepo for managing Personal Access Tokens (PATs) backed by DynamoDB. Tokens use scrypt hashing in PHC format with timing-safe comparison. The OAuth 2.0 flow exchanges PATs for short-lived JWTs at `/auth/token`.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (via Turbo)
pnpm clean            # Remove build output
pnpm test             # Run unit tests across all packages
pnpm test-smoke       # Smoke tests against built artifacts (CI runs this)
pnpm test-int         # Integration tests (starts the local AWS emulator; requires Docker)
pnpm test:coverage    # Unit + integration tests with coverage merge (requires Docker)
pnpm lint             # ESLint across all packages
pnpm typecheck        # TypeScript type checking
pnpm format           # Prettier auto-format
pnpm format:check     # Prettier check (CI enforced)
pnpm verify           # Everything CI runs: build, lint, typecheck, smoke, unit +
                      #   integration with coverage, format check (requires Docker)
pnpm dev              # Run example app (local AWS emulator must already be running)
pnpm emulator:up      # Start the local AWS emulator on its own
pnpm emulator:down    # Stop and remove it
```

The emulator is the `aws-emulator` service in `docker-compose.yml` — Floci,
pinned by digest. No compose project name is pinned, so each checkout gets its
own; `emulator:down` only affects the current one. `AWS_ENDPOINT_URL` moves the
emulator and its clients together (`AWS_ENDPOINT_URL=http://localhost:4699 pnpm
test-int`), and must be declared under a task's `env` key in `turbo.json` or
turbo drops it.

Single package commands (run from package directory):

```bash
pnpm test                    # Unit tests (Vitest)
pnpm test -- --testNamePattern="MyTest"  # Run specific test
pnpm test-int                # Integration tests (core package only)
pnpm build                   # Build single package
```

Releases use Changesets: `pnpm changeset`, `pnpm version-packages`, `pnpm release`. `pnpm release:local` runs `verify` first.

## Architecture

**Monorepo structure** (pnpm workspaces + Turborepo):

- **`@access-tokens/core`** — `DynamoDBPat` class: token generation (id62 IDs + random secrets), scrypt hashing, DynamoDB CRUD (issue, verify, revoke, restore, update, list, batchLoad, bootstrap). Schema validation via Zod. Token format: `{prefix}{tokenId}.{base64Secret}`.
- **`@access-tokens/express`** — Express routers and middleware. `createAuthRouter` handles PAT→JWT exchange. `createAdminTokensRouter` provides CRUD endpoints. `createRequireJwt`/`createRequireAdmin`/`createRequireRole` are auth middleware. JWT signing via `jose`. Uses esbuild for bundling + tsc for declarations.
- **`@access-tokens/client`** — `AccessTokensClient` class: type-safe HTTP client for the express API. Uses fetch-retry. Zod schemas for response validation.
- **`@access-tokens/cli`** — Commander-based CLI. Commands: issue, generate, register, list, revoke, restore, update, sync. Supports YAML config files for sync operations.
- **`@access-tokens/example`** — Demo Express app against DynamoDB in the local AWS emulator. ESM (`"type": "module"`).
  **Key dependency chain**: cli → client → express → core

## Git Rules

- Never amend commits or force push

## Conventions

- Node.js 20+ required (24.x recommended, see `.nvmrc`); pnpm 10+
- TypeScript strict mode; no `any` types
- Tests co-located in `__tests__/` directories; integration tests use `.int.test.ts` suffix; smoke tests use `.smoke.test.ts`
- Testing with Vitest; globals mode enabled (no imports needed for describe/it/expect); use `vi` from `vitest` for mocking
- DynamoDB roles stored as Sets (enables atomic ADD/DELETE operations); Zod schema transforms Sets to arrays
- Token records validated with Zod on both read and write paths
