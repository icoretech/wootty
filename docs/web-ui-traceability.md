# WooTTY Web UI Traceability Matrix

This matrix ties each web UI functional requirement to concrete automated checks.

| Requirement | Unit/Integration tests | E2E tests |
| --- | --- | --- |
| FR-1 Connection lifecycle | `apps/server/test/server.test.ts` (attach/ready flow) | `apps/web/e2e/terminal.spec.ts` -> "renders terminal UI and reaches connected state" |
| FR-2 Session persistence | `apps/web/test/terminal-session.test.ts` (storage helpers) | `apps/web/e2e/terminal.spec.ts` -> "new session rotates session id" |
| FR-3 Heartbeat and stale transport detection | `apps/web/test/terminal-session.test.ts` (message parser for pong) | covered by reconnect stability checks in e2e reconnect and resize scenarios |
| FR-4 Input durability during reconnect | `apps/web/test/terminal-session.test.ts` (outbox accounting, flush behavior), `apps/web/test/app.integration.test.tsx` (buffer+flush in App flow) | exercised indirectly by reconnect flows in e2e |
| FR-5 Resize correctness | `apps/server/test/server.test.ts` (resize forwarding) | `apps/web/e2e/terminal.spec.ts` -> "stays stable through viewport resizes" |
| FR-6 Terminal behavior | validated through runtime integration (`xterm` load + render path) | all e2e scenarios assert terminal visibility and connected state |
| FR-7 Operator controls | `apps/web/test/app.integration.test.tsx` (new-session + font controls) | `apps/web/e2e/terminal.spec.ts` -> reconnect/new-session/font-control flows |
| FR-8 Accessibility baseline | `apps/web/test/app.integration.test.tsx` (status announcement behavior) | `apps/web/e2e/terminal.spec.ts` -> terminal region semantics check |

## Runtime health lane

- `pnpm test:pty-smoke` runs a real-PTY spawn probe. It is non-blocking by default and becomes strict with `PTY_SMOKE_STRICT=1`.
