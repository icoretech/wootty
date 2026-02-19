# Contributing to WooTTY

## Development prerequisites

- Node.js >= 24
- pnpm >= 10

## Setup

```bash
pnpm install
pnpm dev
```

## Validation before opening a PR

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:pty-smoke
```

`pnpm lint` is the canonical unified command. It formats and lints with Biome,
then runs typechecks.

## Commit conventions

Use conventional commits when possible:

- `feat:` new behavior
- `fix:` bug fixes
- `docs:` documentation-only
- `chore:` maintenance
- `test:` tests-only changes

## Scope guidance

- Keep terminal reliability changes accompanied by tests.
- Prefer small, reviewable PRs.
- Update docs when behavior or UX changes.
