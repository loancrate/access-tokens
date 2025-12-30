# @access-tokens/cli

[![npm](https://img.shields.io/npm/v/@access-tokens/cli)](https://www.npmjs.com/package/@access-tokens/cli)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

Command-line interface for managing Personal Access Tokens (PATs).

## Features

- **Token Management**: Issue, list, update, revoke, and restore tokens
- **Configuration**: Named endpoints for easy multi-environment management
- **Bulk Operations**: Sync tokens across environments from YAML config
- **Local Generation**: Generate tokens without server connection
- **Flexible Output**: JSON or human-readable output formats
- **Secure Credentials**: Config file permission validation

## Installation

```bash
npm install -g @access-tokens/cli
```

Or use with npx (no installation):

```bash
npx @access-tokens/cli --help
```

## Quick Start

### Issue a Token

```bash
access-tokens issue \
  --url https://api.example.com \
  --admin-token <your-admin-token> \
  --owner user@example.com \
  --admin
```

### List Tokens

```bash
access-tokens list \
  --url https://api.example.com \
  --admin-token <your-admin-token>
```

### Using Named Endpoints

Create a config file at `~/.access-tokens-cli/config.yaml`:

```yaml
endpoints:
  prod:
    url: https://api.example.com
    adminToken: pat_prod_admin_token_here
  staging:
    url: https://staging.example.com
    adminToken: pat_staging_admin_token_here
```

Then use the endpoint name:

```bash
access-tokens list --endpoint prod
access-tokens issue --endpoint staging --owner user@example.com
```

## Commands

### `generate`

Generate a token locally without storing in database. Useful for pre-generating tokens.

```bash
access-tokens generate
access-tokens generate --token-prefix myapp_
access-tokens generate --token-id specific-id-123
access-tokens generate --json
```

**Options:**

- `--token-prefix <prefix>` - Token prefix (default: `pat_`)
- `--token-id <id>` - Use specific token ID
- `--json` - Output as JSON
- `--verbose` - Verbose output
- `--quiet` - Minimal output

**Output:**

```
Token: pat_9Xj2kLm5nPqRs7tUv.a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0x1y2z3
Token ID: 9Xj2kLm5nPqRs7tUv
Secret PHC: $scrypt$n=16384,r=8,p=1$...
```

### `list`

List all tokens.

```bash
access-tokens list --endpoint prod
access-tokens list --url https://api.example.com --admin-token <token>
access-tokens list --endpoint prod --include-revoked --include-expired
access-tokens list --endpoint prod --json
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--include-revoked` - Include revoked tokens
- `--include-expired` - Include expired tokens
- `--include-secret-phc` - Include secret PHC hashes
- `--has-role <role>` - Filter tokens that have this role
- `--json` - Output as JSON
- `--verbose` - Verbose output
- `--quiet` - Minimal output

### `issue`

Issue a new token.

```bash
access-tokens issue \
  --endpoint prod \
  --owner user@example.com \
  --admin

access-tokens issue \
  --url https://api.example.com \
  --admin-token <token> \
  --owner user@example.com \
  --roles reader,writer \
  --expires-at 2025-12-31
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--owner <email>` - Token owner (required)
- `--admin` - Make token an admin token
- `--roles <roles>` - Comma-separated list of roles
- `--expires-at <date>` - Expiration date (ISO 8601 or Unix timestamp)
- `--json` - Output as JSON
- `--verbose` - Verbose output
- `--quiet` - Minimal output

**Date Formats:**

- ISO 8601: `2025-12-31`, `2025-12-31T23:59:59Z`
- Unix timestamp: `1735689599`

### `register`

Register a pre-generated token (from `generate` command).

```bash
access-tokens register \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --secret-phc '$scrypt$n=16384,r=8,p=1$...' \
  --owner user@example.com
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--token-id <id>` - Pre-generated token ID (required)
- `--secret-phc <phc>` - Secret PHC hash (required)
- `--owner <email>` - Token owner (required)
- `--admin` - Make token an admin token
- `--expires-at <date>` - Expiration date
- `--json` - Output as JSON
- `--verbose` - Verbose output
- `--quiet` - Minimal output

### `update`

Update an existing token's properties.

```bash
# Update owner
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --owner newuser@example.com

# Update admin flag
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --admin true

# Clear expiration
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --expires-at null

# Update roles
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --roles reader,writer

# Add roles atomically
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --add-roles admin

# Remove roles atomically
access-tokens update \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --remove-roles guest
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--token-id <id>` - Token ID to update (required)
- `--owner <email>` - New owner
- `--admin <boolean>` - New admin status (true/false)
- `--secret-phc <phc>` - New secret PHC hash
- `--roles <roles>` - Replace all roles (comma-separated)
- `--add-roles <roles>` - Add roles atomically (comma-separated)
- `--remove-roles <roles>` - Remove roles atomically (comma-separated)
- `--expires-at <date>` - New expiration or "null" to remove
- `--verbose` - Verbose output
- `--quiet` - Minimal output

### `revoke`

Revoke a token.

```bash
access-tokens revoke --endpoint prod --token-id 9Xj2kLm5nPqRs7tUv

# Revoke with cleanup in 30 days
access-tokens revoke \
  --endpoint prod \
  --token-id 9Xj2kLm5nPqRs7tUv \
  --expires-at 2025-12-31
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--token-id <id>` - Token ID to revoke (required)
- `--expires-at <date>` - Expiration for cleanup (optional)
- `--verbose` - Verbose output
- `--quiet` - Minimal output

### `restore`

Restore a previously revoked token.

```bash
access-tokens restore --endpoint prod --token-id 9Xj2kLm5nPqRs7tUv
```

**Options:**

- `--endpoint <name>` - Named endpoint from config
- `--url <url>` - Direct endpoint URL
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--token-id <id>` - Token ID to restore (required)
- `--verbose` - Verbose output
- `--quiet` - Minimal output

### `sync`

Sync tokens from YAML config to endpoints. Ensures tokens exist with correct properties.

**Sync Config (`sync.yaml`):**

```yaml
tokens:
  - tokenId: service-a-prod
    owner: service-a@example.com
    isAdmin: false
    roles: [reader, writer]
    secretPhc: $scrypt$n=16384,r=8,p=1$...
    expiresAt: 1735689599

  - tokenId: admin-bot
    owner: admin-bot@example.com
    isAdmin: true
    roles: [admin, reader, writer]
    secretPhc: $scrypt$n=16384,r=8,p=1$...
```

**Usage:**

```bash
# Sync to configured endpoints
access-tokens sync --config sync.yaml

# Sync to specific endpoint
access-tokens sync --config sync.yaml --endpoint prod

# Sync to direct URL
access-tokens sync --config sync.yaml --url https://api.example.com --admin-token <token>

# Dry run (preview changes)
access-tokens sync --config sync.yaml --dry-run
```

**Options:**

- `--config <path>` - Path to sync config YAML (required)
- `--endpoint <name>` - Target endpoint(s), comma-separated
- `--url <url>` - Direct endpoint URL (overrides config)
- `--admin-token <token>` - Admin token (required with --url)
- `--auth-path <path>` - Auth path (default: /auth)
- `--admin-path <path>` - Admin path (default: /admin)
- `--config-dir <path>` - Config directory (default: ~/.access-tokens-cli)
- `--dry-run` - Show changes without applying
- `--verbose` - Verbose output
- `--quiet` - Minimal output

## Configuration

### Config File Location

Default: `~/.access-tokens-cli/config.yaml`

Override: `--config-dir <path>`

### Config File Format

```yaml
endpoints:
  prod:
    url: https://api.example.com
    adminToken: pat_prod_admin_token
    authPath: /auth # optional, default: /auth
    adminPath: /admin # optional, default: /admin

  staging:
    url: https://staging.example.com
    adminToken: pat_staging_admin_token
```

### Security

The CLI validates config file permissions and warns if the file is world-readable (mode 0644 or more permissive).

**Secure your config:**

```bash
chmod 600 ~/.access-tokens-cli/config.yaml
```

## Output Formats

### Human-Readable (Default)

```
Token issued successfully!

TOKEN (save this securely, it won't be shown again):
pat_9Xj2kLm5nPqRs7tUv.a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0x1y2z3

Token ID: 9Xj2kLm5nPqRs7tUv
Owner: user@example.com
Admin: true
```

### JSON (--json)

```json
{
  "token": "pat_9Xj2kLm5nPqRs7tUv.a8b9c0d1e2f3g4h5i6j7k8l9m0n1o2p3q4r5s6t7u8v9w0x1y2z3",
  "record": {
    "tokenId": "9Xj2kLm5nPqRs7tUv",
    "owner": "user@example.com",
    "isAdmin": true,
    "isRevoked": false,
    "createdAt": 1704067200,
    "updatedAt": 1704067200
  }
}
```

## Exit Codes

- `0` - Success
- `1` - Error (invalid arguments, API error, etc.)

## Requirements

- Node.js 20+
- @access-tokens/express server (except generate)

## Related Packages

- [@access-tokens/core](https://www.npmjs.com/package/@access-tokens/core) - Core token management library
- [@access-tokens/express](https://www.npmjs.com/package/@access-tokens/express) - Express routes and middleware
- [@access-tokens/client](https://www.npmjs.com/package/@access-tokens/client) - HTTP client for PAT API

## License

[ISC](https://opensource.org/licenses/ISC) © 2025 Loan Crate, Inc.

## Links

- [GitHub Repository](https://github.com/loancrate/access-tokens)
- [npm Package](https://www.npmjs.com/package/@access-tokens/cli)
- [Documentation](https://github.com/loancrate/access-tokens#readme)
