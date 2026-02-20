# Repository Guidelines

## Project Structure & Module Organization
- `apps/web`: React 19 + Vite terminal UI (`src/` for app code, `test/` for Vitest, `e2e/` for Playwright).
- `apps/server`: Go runtime (`cmd/woottyd` entrypoint, `internal/` for config/protocol/session/server logic).
- `docs/`: UI specs and assets (for example `docs/assets/wootty-ui.png`).
- Root-level CI/release files live in `.github/workflows/`, with release automation via Release Please.

## Build, Test, and Development Commands
```bash
pnpm install            # install workspace deps (Node >=24)
pnpm dev                # run Go server + Vite dev server concurrently
pnpm build              # build web bundle and compile Go packages
pnpm lint               # biome check --write + TypeScript typecheck
pnpm test               # Vitest + go test ./...
pnpm test:e2e           # Playwright E2E (Chromium)
pnpm test:e2e:cross     # Playwright E2E (Chromium/Firefox/WebKit)
pnpm ci                 # local CI sequence (lint, test, build, e2e)
```
Server-only loop:
```bash
cd apps/server && go run ./cmd/woottyd run --host 127.0.0.1 --port 8080
```

## Coding Style & Naming Conventions
- Use Biome (`biome.json`) for formatting/linting in JS/TS/JSON/Markdown.
- Use `gofmt`/standard Go formatting for all Go changes.
- Keep React components in PascalCase (`App.tsx`), utility modules in kebab/lowercase (`terminal-session.ts`).
- Keep packages scoped under `@icoretech/*` naming where applicable.

## Testing Guidelines
- Web unit/integration tests: `apps/web/test/*.test.ts(x)` with Vitest.
- Browser tests: `apps/web/e2e/*.spec.ts` with Playwright.
- Go tests: `*_test.go` next to implementation files in `apps/server/internal/**`.
- For deterministic terminal behavior in tests, use `WOOTTY_FAKE_PTY=1`.

## Commit & Pull Request Guidelines
- Follow Conventional Commits seen in history: `feat: ...`, `fix: ...`, `chore: ...`.
- Do not manually craft release commits; Release Please generates `chore(main): release ...`.
- PRs should include:
  - concise problem/solution summary,
  - linked issue (if available),
  - test evidence (`pnpm test`, `pnpm test:e2e`),
  - UI screenshot/video for visible frontend changes.

## Security & Configuration Tips
- Never commit secrets or tokens; use environment variables.
- Prefer `WOOTTY_*` runtime variables (`WOOTTY_HOST`, `WOOTTY_PORT`, `WOOTTY_COMMAND`, etc.) for configuration.
- Validate runtime health with `GET /api/health` before shipping images.
