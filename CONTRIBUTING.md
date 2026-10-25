# Contributing to WooTTY

## Setup

Use Linux or macOS for the PTY server, or WSL on Windows. Install Node.js 26+, the pnpm version in [`package.json`](package.json), and the Go version in [`apps/server/go.mod`](apps/server/go.mod).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL printed at startup. The development launcher starts both the Go server and Vite, and selects an available backend port unless `WOOTTY_PORT` is set.

Read [AGENTS.md](AGENTS.md) and the instructions below the package you are changing. The [architecture guide](docs/architecture.md) maps terminal ownership and protocol boundaries.

## Validate a change

From the repository root:

```bash
pnpm lint
pnpm --filter @icoretech/wootty-web exec playwright install chromium
pnpm run ci
```

`pnpm lint` applies Biome and Go fixes, then verifies documentation, generated contracts, governance, toolchain consistency, React Doctor diagnostics, and types. Keep its formatting changes. React Doctor scans the full web package and fails on warnings or errors; the same gate runs in `pnpm lint:ci`. `pnpm run ci` runs the non-mutating lint gate, script tests, browser unit/integration tests, Go tests, the build, and Chromium desktop/mobile E2E tests against the real server with a deterministic fake PTY.

Use narrower commands while developing:

| Command | Scope |
| --- | --- |
| `pnpm test:scripts` | Build and repository tooling |
| `pnpm lint:react` | Full-project React Doctor scan; warnings and errors fail |
| `pnpm --filter @icoretech/wootty-web test` | Browser unit and integration tests |
| `cd apps/server && go test ./...` | Backend tests |
| `cd apps/server && go test -race ./...` | Backend race detector |
| `pnpm test:e2e` | Chromium desktop and mobile |
| `pnpm test:e2e:cross` | Chromium, Firefox, and WebKit |
| `pnpm build:binary` | Standalone server with embedded UI |

Install all three browsers before the cross-browser suite with `pnpm --filter @icoretech/wootty-web exec playwright install chromium firefox webkit`.

Vite discovers `apps/web/vite.config.ts`, which delegates to `apps/web/config/build/vite.config.ts`. Keep proxy and build settings in that shared configuration. The React Compiler runs through the supported Rolldown Babel plugin and React compiler preset; the configuration is checked by `pnpm typecheck` as well as exercised by production builds.

## Keep contracts and tests together

- Put browser tests under `apps/web/test/`, browser E2E scenarios under `apps/web/e2e/`, and Go tests beside their package.
- Reproduce a behavior defect with a regression test. Exercise the actual PTY, HTTP, or WebSocket boundary when that boundary is the source of the problem.
- Edit shared wire definitions in `contracts/`, then run `pnpm generate:terminal-contracts`. Do not edit generated TypeScript or Go bindings directly.
- Update ownership or requirement coverage in `docs/governance/`, then run `pnpm generate:governance`. Preserve the stable traceability identifiers on executable tests.
- Keep deployment and user documentation synchronized with behavior. Preserve the documented session ownership and retention model.

## Commit and pull request conventions

Use Conventional Commits for Release Please:

- `feat:` new behavior
- `fix:` a corrected behavior
- `deps:` dependency or runtime updates
- `refactor:` structural changes preserving behavior
- `docs:`, `test:`, `ci:`, or `chore:` for their corresponding scope

Describe the concrete change in the subject, for example `fix: preserve UTF-8 output across PTY reads`. Documentation, test, and CI commits do not independently trigger a release. Do not bump the release version as part of an unrelated fix.

Keep pull requests focused. Explain the previous behavior, the resulting behavior, and how it was verified. Report security findings through [SECURITY.md](SECURITY.md).
