# Contributing to WooTTY

## Development prerequisites

- Node.js >= 26
- pnpm 12.14.0 (pinned in `package.json`)
- Go >= 1.27.3

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
```

`pnpm lint` is the canonical unified command. It formats and lints with Biome,
then runs typechecks.

## Commit conventions

Use Conventional Commits for every change (required for Release Please):

- `feat:` new behavior
- `fix:` bug fixes
- `docs:` documentation-only
- `chore:` maintenance
- `test:` tests-only changes

Format:

```text
<type>(optional-scope): <summary>
```

Examples:

- `fix: resolve Playwright webServer cwd in CI`
- `refactor(session): split transport lifecycle boundaries`

## Scope guidance

- Keep terminal reliability changes accompanied by tests.
- Prefer small, reviewable PRs.
- Update docs when behavior or UX changes.
