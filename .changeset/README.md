# Changesets

This directory contains changeset files used to manage versions and changelogs for this monorepo.

## Creating a Changeset

When you make changes to a package, create a changeset:

```bash
pnpm changeset
```

Follow the prompts to:
1. Select which packages have been affected
2. Choose the type of change (major, minor, patch)
3. Describe the changes

## Releasing

Maintainers can release new versions:

```bash
pnpm version-packages

pnpm release
```

This will:
1. Update package versions based on changesets
2. Update CHANGELOGs
3. Build packages
4. Publish to npm

## Learn More

- [Changesets Documentation](https://github.com/changesets/changesets)
