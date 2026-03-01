# WooTTY Web UI Traceability Matrix

This matrix ties each web UI functional requirement to concrete automated checks.

| Requirement | Unit/Integration tests | E2E tests |
| --- | --- | --- |
| FR-1 Connection lifecycle | `apps/server/internal/protocol/protocol_test.go`, `apps/server/internal/protocol/wire_contract_test.go`, `apps/web/test/unit/protocol/terminal-wire-contract.test.ts`, and `apps/server/internal/config/config_test.go` (attach + wire-contract parity + runtime config parsing) | `apps/web/e2e/terminal.spec.ts` -> "renders terminal UI and reaches connected state" |
| FR-2 Session persistence | `apps/web/test/unit/lib/terminal-session.test.ts` (storage helpers), `apps/web/test/integration/app/app-connection-integration.test.tsx` (ready session id persistence) | `apps/web/e2e/terminal.spec.ts` -> "new session rotates session id" |
| FR-3 Heartbeat and stale transport detection | `apps/web/test/unit/lib/terminal-session.test.ts` (message parser for pong), `apps/web/test/unit/app/engine/transport-orchestrator.test.tsx` (heartbeat timeout + reconnect) | covered by reconnect stability checks in e2e reconnect and resize scenarios |
| FR-4 Input durability during reconnect | `apps/web/test/unit/lib/terminal-session.test.ts` (outbox accounting, flush behavior), `apps/web/test/integration/app/app-connection-integration.test.tsx` (buffer+flush in App flow) | exercised indirectly by reconnect flows in e2e |
| FR-5 Resize correctness | `apps/server/internal/session/history_test.go` + manager/runtime paths exercised in e2e | `apps/web/e2e/terminal.spec.ts` -> "stays stable through viewport resizes" |
| FR-6 Terminal behavior | `apps/web/test/integration/app/terminal-app-direct.test.tsx` validates runtime integration (`xterm` load + render path) | all e2e scenarios assert terminal visibility and connected state |
| FR-7 Operator controls | `apps/web/test/integration/app/app-ui-integration.test.tsx` (new-session + font controls), `apps/web/test/integration/app/app-sessions-integration.test.tsx` (session attach modes) | `apps/web/e2e/terminal.spec.ts` -> reconnect/new-session/font-control flows |
| FR-8 Accessibility baseline | `apps/web/test/integration/app/app-ui-integration.test.tsx` (status announcement behavior) | `apps/web/e2e/terminal.spec.ts` -> terminal region semantics check |

## Runtime health lane

- `pnpm test` runs web unit tests and Go server tests (`go test ./...` in `apps/server`).
