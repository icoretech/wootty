# SERVER PACKAGE KNOWLEDGE BASE

## OVERVIEW
`apps/server` is a separate Go module that owns config parsing, PTY/session lifecycle, HTTP/WebSocket delivery, auth, and embedded web asset serving.

## ENTRYPOINTS
- `cmd/woottyd/main.go`: process entrypoint
- `internal/server/server.go`: HTTP route assembly, session listing, and server lifecycle
- `internal/server/auth.go`: authentication bootstrap, cookie checks, and host/origin policy
- `internal/server/terminal.go`: terminal WebSocket protocol and connection lifecycle
- `internal/server/static.go`: rooted static filesystem and embedded asset serving
- `internal/config/config.go`: CLI/env/runtime configuration authority
- `internal/session/manager.go`: session types, basic actions, and listing; attach and lifecycle behavior live in sibling files

## STRUCTURE
```text
apps/server/
├── cmd/woottyd/ # executable entrypoint
├── internal/    # real implementation packages; use child AGENT here
└── README.md    # server-specific runtime summary
```

## COMMANDS
```bash
cd apps/server && go run ./cmd/woottyd run --host 127.0.0.1 --port 8080
cd apps/server && go test ./...
cd apps/server && go build ./...
```

## CONVENTIONS
- Keep package-local `*_test.go` files beside the implementation they exercise
- Prefer `WOOTTY_*` env vars and existing config parsing paths over ad hoc runtime flags
- Respect the split between `cmd/` bootstrap and `internal/` implementation packages
- Static web serving is part of this module; backend changes can affect packaged frontend delivery behavior

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| CLI/env parsing | `internal/config/` | auth and static-dir invariants live here |
| HTTP assembly / lifecycle | `internal/server/server.go` | routes, health, session listing, and shutdown |
| auth token / host / origin policy | `internal/server/auth.go` | tokenless loopback requests require trusted hosts |
| terminal WebSocket behavior | `internal/server/terminal.go` | attach, input, resize, and read-only enforcement |
| static filesystem serving | `internal/server/static.go` | rooted access and embedded fallback |
| session actions / listing | `internal/session/manager.go` | shared Manager types and basic operations |
| attach / replay handshake | `internal/session/attach.go` | initial ready and replay are serialized together |
| session lifetime / cleanup | `internal/session/lifecycle.go` | detach TTL, output, exit, and shutdown |
| wire parsing | `internal/protocol/` | generated contract companion lives here |
| embedded frontend assets | `internal/webassets/` | embedded dist + placeholder fallback |

## ANTI-PATTERNS
- Do not assume non-loopback binds are valid without `WOOTTY_AUTH_TOKEN`
- Do not assume websocket auth comes from query params or headers; cookie bootstrap is the supported path
- Do not assume an arbitrary hostname resolving to loopback permits tokenless access; custom-host proxies should configure a token, and explicit origin exceptions require a matching request Origin header
- Do not treat server restarts as preserving live sessions; state is in-memory only
- Do not hand-edit generated protocol bindings under `internal/protocol/wire_contract.go`

## NOTES
- `README.md` in this directory is the quickest runtime summary; keep package AGENT focused on implementation behavior
- `WOOTTY_FAKE_PTY=1` is the standard deterministic server test mode
