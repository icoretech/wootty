# SERVER INTERNAL KNOWLEDGE BASE

## OVERVIEW
`apps/server/internal` is the backend implementation hotspot. Its packages are real domain seams, not arbitrary folders.

## PACKAGE BOUNDARIES
| Package | Role |
| --- | --- |
| `config/` | CLI/env parsing, static-dir detection, auth requirements |
| `protocol/` | websocket/http contract parsing and generated wire constants |
| `session/` | PTY process management, history, attach/watch, TTL cleanup |
| `server/` | HTTP routes, websocket upgrades, auth cookie flow, static serving |
| `webassets/` | embedded `dist/` assets and placeholder detection |

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| HTTP assembly / shutdown | `server/server.go` | routes and connection/resource lifetime |
| auth token / host / origin policy | `server/auth.go` + `config/config.go` | keep request checks aligned |
| terminal WebSocket dispatch | `server/terminal.go` | connection attach, input, resize, and rename |
| static filesystem boundary | `server/static.go` | rooted file access and embedded fallback |
| session actions / listing | `session/manager.go` | shared types and basic Manager operations |
| attach/watch/replay handshake | `session/attach.go` | ready and replay serialize before live output |
| detach/output/exit/shutdown | `session/lifecycle.go` | TTL and process lifetime authority |
| serialized WebSocket writers | `session/connection.go` | shared connection helpers |
| PTY vs fake PTY | `session/pty.go` + `session/fake.go` | deterministic test mode matters |
| inbound client message parsing | `protocol/protocol.go` | keep in sync with shared contracts |
| embedded asset behavior | `webassets/assets.go` | affects packaged server builds |

## CONVENTIONS
- Keep contract changes aligned across root `contracts/*.json`, generated `wire_contract.go`, and parser/tests
- Add or update colocated `*_test.go` files in the same package when behavior changes
- Preserve session semantics explicitly: controller vs watcher, replay buffer, detached TTL, exit handling
- Keep HTTP/auth policy inside `server/` and config policy inside `config/`; avoid spreading request/security rules across packages

## ANTI-PATTERNS
- Do not collapse `watch` and controller attach paths into one generic attach flow
- Do not bypass `config` helpers with ad hoc env parsing in server/session packages
- Do not edit generated `protocol/wire_contract.go` directly
- Do not treat `webassets/dist` placeholder content as hand-maintained source

## NOTES
- `server_test.go` and `manager_test.go` are large because they encode a lot of runtime invariants; use them as behavioral references before changing semantics
- Fake PTY and replay/history behavior are stability-critical for e2e and reconnect flows
