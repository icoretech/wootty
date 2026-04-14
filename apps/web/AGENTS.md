# WEB PACKAGE KNOWLEDGE BASE

## OVERVIEW
`apps/web` is the standalone React/Vite package (`@icoretech/wootty-web`) that owns browser bootstrap, terminal UI, browser-side protocol handling, and browser test runners.

## ENTRYPOINTS
- `src/main.tsx` -> browser bootstrap and failure fallback UI
- `src/App.tsx` -> thin handoff into terminal feature
- `src/features/terminal/app/TerminalApp.tsx` -> real application shell

## STRUCTURE
```text
apps/web/
├── config/build/ # Vite config and dev proxy wiring
├── config/test/  # Vitest config
├── config/e2e/   # Playwright config + server launch rules
├── src/          # app code; real domain hotspot is src/features/terminal
├── test/         # unit, integration, support harnesses
└── e2e/          # browser specs
```

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| dev proxy / React compiler | `config/build/vite.config.ts` | `/api` proxies to Go server |
| unit/integration runner | `config/test/vitest.config.ts` | `jsdom` + shared setup file |
| e2e runner | `config/e2e/playwright.config.ts` | Chromium + mobile by default |
| e2e server boot | `config/e2e/e2e-env.ts` | launches Go server with fake PTY |
| package scripts | `package.json` | build, typecheck, test, e2e |
| main domain | `src/features/terminal/` | use child AGENT there |
| test conventions | `test/AGENTS.md` | use for new tests/harness work |

## CONVENTIONS
- `build` is `tsc --noEmit` before `vite build`; keep type health clean before bundling
- `typecheck:contracts` is separate from normal app typecheck; contract-facing files/tests must satisfy both lanes
- Keep React components in PascalCase and utility modules in lowercase/kebab style when consistent with surrounding code
- Browser bootstrap is defensive; preserve fallback behavior when changing startup wiring

## TESTING
- `pnpm --filter @icoretech/wootty-web test` runs Vitest only
- `pnpm --filter @icoretech/wootty-web test:e2e` rebuilds the repo first, then runs Playwright
- `pnpm --filter @icoretech/wootty-web test:e2e:cross` adds Firefox and WebKit via `WOOTTY_E2E_CROSS=1`
- Unit/integration tests live under `test/**`; browser specs live under `e2e/**`

## ANTI-PATTERNS
- Do not add package-local commands that bypass root verification flows unless they are truly web-only
- Do not treat `src/` as one flat app; terminal ownership boundaries are intentional and live below `src/features/terminal`
- Do not rely on Vite dev server semantics in e2e; Playwright boots the Go server directly

## NOTES
- `config/e2e/e2e-env.ts` defaults to port `4310` and sets `WOOTTY_FAKE_PTY=1`
- `mobile-chromium` is part of the default Playwright matrix; default CI is still Chromium-only
