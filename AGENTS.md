# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-14
**Commit:** `4388bef`
**Branch:** `main`

## OVERVIEW
WooTTY is a polyglot repo with two runtime domains: a React 19 + Vite browser terminal in `apps/web` and a Go PTY/websocket server in `apps/server`.
Root owns orchestration, shared contracts, governance docs, generators, and release/CI policy.

## STRUCTURE
```text
wootty/
├── apps/web/        # React/Vite client package and browser tests
├── apps/server/     # Go module, HTTP/WebSocket runtime, embedded assets
├── contracts/       # shared JSON source of truth for web/server wire contracts
├── scripts/         # dev orchestration, codegen, governance/doc verification
├── docs/governance/ # module ownership + traceability manifests
└── .github/workflows/ # CI, release-please, publish workflows
```

## CHILD AGENTS
- `apps/web/AGENTS.md`: frontend package commands, config, test layout
- `apps/web/src/features/terminal/AGENTS.md`: terminal domain boundaries and contract-first rules
- `apps/web/test/AGENTS.md`: harnesses, deterministic test setup, where to add tests
- `apps/server/AGENTS.md`: Go module commands and runtime entrypoints
- `apps/server/internal/AGENTS.md`: internal package boundaries and backend invariants

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| root commands / CI parity | `package.json` | canonical `dev`, `lint`, `test`, `build`, `ci` |
| shared protocol schema | `contracts/*.json` | generated into TS and Go; edit source here |
| frontend bootstrap | `apps/web/src/main.tsx` | dynamic App import + bootstrap failure UI |
| frontend architecture map | `README.md` + `docs/governance/terminal-governance-map.json` | strongest ownership map in repo |
| backend bootstrap | `apps/server/cmd/woottyd/main.go` | reads config then starts server |
| auth / websocket / static serving | `apps/server/internal/server/server.go` | API + websocket + asset routing |
| dev port orchestration | `scripts/dev.mjs` | auto-falls forward from busy `8080` |
| governance/doc checks | `scripts/generate-terminal-governance-docs.mjs` | also powers `verify:governance` |

## CODE MAP
| Symbol | Type | Location | Role |
| --- | --- | --- | --- |
| `main` | Go function | `apps/server/cmd/woottyd/main.go` | server process entrypoint |
| `New` | Go function | `apps/server/internal/server/server.go` | HTTP/WebSocket server assembly |
| `NewManager` | Go function | `apps/server/internal/session/manager.go` | PTY session lifecycle owner |
| `ParseRunConfig` | Go function | `apps/server/internal/config/config.go` | CLI/env/runtime config authority |
| `TerminalApp` | React component | `apps/web/src/features/terminal/app/TerminalApp.tsx` | terminal feature shell |
| `useTerminalController` | React hook | `apps/web/src/features/terminal/app/controller/use-terminal-controller.ts` | UI/controller composition root |
| `createBrowserTransport` | TS function | `apps/web/src/features/terminal/adapters/browser-transport.ts` | browser websocket transport |
| `parseServerMessageWithReason` | TS function | `apps/web/src/features/terminal/protocol/terminal-protocol.ts` | inbound message parsing authority |

## CONVENTIONS
- Root `pnpm lint` is intentionally mutating: Biome write mode, `go fix`, docs path verification, governance verification, then typecheck
- `pnpm lint:ci` is the non-mutating CI path; do not substitute it for local fix-up work
- `pnpm ci` is the local parity sequence: lint:ci -> test -> build -> e2e
- The repo does not use a shared package/library layer; cross-runtime truth flows through `contracts/*.json` plus generator scripts
- Governance is enforced, not aspirational: ownership and traceability manifests under `docs/governance/` must stay in sync with docs and executable tests

## ANTI-PATTERNS (THIS PROJECT)
- Do not hand-edit generated files such as `apps/web/src/features/terminal/protocol/generated-wire-contract.ts` or `apps/server/internal/protocol/wire_contract.go`
- Do not use ad hoc check-only Biome flows as the normal dev path; use `pnpm lint` or explicit write mode
- Do not assume `docs` / `chore` / `test` / `ci` commits will trigger a release; Release Please requires releasable conventional commit types
- Do not expose non-loopback WooTTY without `WOOTTY_AUTH_TOKEN`; insecure override is for trusted local networks only
- Do not assume sessions persist across server restarts or can be silently stolen by another tab

## UNIQUE STYLES
- Root README is partially generated: module ownership and traceability sections are derived from governance manifests
- E2E bootstraps the Go server directly instead of a Vite dev server and forces `WOOTTY_FAKE_PTY=1`
- Default CI browser coverage is Chromium-only; Firefox/WebKit are opt-in via `pnpm test:e2e:cross`

## COMMANDS
```bash
pnpm install
pnpm dev
pnpm lint
pnpm lint:ci
pnpm test
pnpm build
pnpm test:e2e
pnpm test:e2e:cross
pnpm ci
pnpm generate:terminal-contracts
pnpm generate:governance
```

## NOTES
- `scripts/dev.mjs` can shift the backend port when `8080` is busy; read exported `WOOTTY_DEV_PROXY_PORT` before debugging proxy issues
- Static asset serving order is: `WOOTTY_STATIC_DIR` / detected `apps/web/dist` -> embedded `apps/server/internal/webassets/dist` -> JSON fallback
- Keep `.DS_Store` ignored and out of commits
