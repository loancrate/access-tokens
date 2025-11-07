# Contributing to Access Tokens

Thank you for your interest in contributing to Access Tokens! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building this together.

## Getting Started

### Prerequisites

- Node.js 20+ (Node.js 24.x recommended for development, see `.nvmrc`)
- pnpm 10.x+
- Docker (for LocalStack integration tests)
- AWS CLI (for LocalStack setup)

### Setup Development Environment

```bash
git clone https://github.com/loancrate/access-tokens.git
cd access-tokens

nvm use

pnpm install

pnpm build

pnpm test:coverage
```

## Project Structure

```
access-tokens/
├── packages/
│   ├── core/          # Core token management (DynamoDB backend)
│   ├── express/       # Express middleware
│   ├── client/        # HTTP client
│   ├── cli/           # Command-line tool
│   └── example/       # Example application
├── scripts/           # Setup and utility scripts
└── .github/workflows/ # CI/CD workflows
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

Follow these guidelines:

- **TypeScript**: Use strict type checking, avoid `any`
- **Code Style**: Run `pnpm format` to auto-format before committing
- **Tests**: Add tests for new features
- **Commits**: Use clear, descriptive commit messages

### 3. Run Tests

```bash
pnpm build
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
```

### 4. Submit Pull Request

- Ensure all tests pass
- Update documentation if needed
- Reference any related issues
- Request review from maintainers

## Coding Standards

### Code Formatting

This project uses **Prettier** for consistent code formatting:

- **Auto-format**: Run `pnpm format` to format all files
- **Check formatting**: Run `pnpm format:check` to verify formatting
- **CI enforcement**: All code must pass `pnpm format:check` in CI
- **ESLint**: Run `pnpm lint` for linting (separate from formatting)

The format check runs automatically in CI, so make sure to format your code before pushing.

### TypeScript

- Use strict mode
- No `any` types (use `unknown` and type guards)
- No type assertions unless absolutely necessary
- Use proper type narrowing

### Testing

- Unit tests for business logic
- Integration tests (`.int.test.ts`) for DynamoDB operations
- Mock external dependencies
- Aim for >80% code coverage

### Code Organization

- One class/function per file when appropriate
- Clear, descriptive names
- Keep functions small and focused
- Use dependency injection

### Comments

- Comments should explain "why", not "what"
- Keep comments on separate lines (not inline)
- Maximum 80 characters per comment line
- Use JSDoc for public APIs

## Testing

### Unit Tests

```bash
cd packages/core
pnpm test
```

### Database Tests (LocalStack required)

```bash
cd packages/core
pnpm test-int
```

### All Tests

```bash
pnpm test
pnpm test-int
```

## Building

### Build All Packages

```bash
pnpm build
```

### Build Single Package

```bash
cd packages/core
pnpm build
```

## Releasing

Releases are managed by maintainers using Changesets:

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

Automated via GitHub Actions on tag push.

## Package-Specific Guidelines

### Core Package

- Add tests for all token operations
- Ensure timing-safe comparisons
- Document security considerations

### Express Package

- Test middleware with supertest
- Handle errors gracefully
- Follow Express best practices

### Client Package

- Mock fetch in tests
- Handle network errors
- Provide clear error messages

### CLI Package

- Use commander for CLI parsing
- Provide helpful error messages
- Support both interactive and scripted usage

## Common Tasks

### Adding a New Feature

1. Start with tests (TDD approach)
2. Implement feature
3. Update documentation
4. Add example usage

### Fixing a Bug

1. Write a failing test that reproduces the bug
2. Fix the bug
3. Ensure test passes
4. Add regression test

### Updating Dependencies

```bash
pnpm update -r --latest

pnpm build
pnpm test
```

## Documentation

- Update README.md for major changes
- Add JSDoc comments for public APIs
- Update package READMEs as needed
- Include code examples

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Tag maintainers for review

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

Thank you for contributing to Access Tokens!
