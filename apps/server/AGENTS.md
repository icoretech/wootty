# SERVER PACKAGE KNOWLEDGE BASE

## OVERVIEW
`apps/server` is a separate Go module that owns config parsing, PTY/session lifecycle, HTTP/WebSocket delivery, auth, and embedded web asset serving.

## ENTRYPOINTS
- `cmd/woottyd/main.go`: process entrypoint
- `internal/server/server.go`: HTTP/WebSocket/auth/static route assembly
- `internal/config/config.go`: CLI/env/runtime configuration authority
- `internal/session/manager.go`: PTY session lifecycle authority

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
| websocket + HTTP behavior | `internal/server/` | `/api/*` and auth cookie flow |
| PTY/session lifecycle | `internal/session/` | attach/watch/replay/TTL semantics |
| wire parsing | `internal/protocol/` | generated contract companion lives here |
| embedded frontend assets | `internal/webassets/` | embedded dist + placeholder fallback |

## ANTI-PATTERNS
- Do not assume non-loopback binds are valid without `WOOTTY_AUTH_TOKEN`
- Do not assume websocket auth comes from query params or headers; cookie bootstrap is the supported path
- Do not treat server restarts as preserving live sessions; state is in-memory only
- Do not hand-edit generated protocol bindings under `internal/protocol/wire_contract.go`

## NOTES
- `README.md` in this directory is the quickest runtime summary; keep package AGENT focused on implementation behavior
- `WOOTTY_FAKE_PTY=1` is the standard deterministic server test mode
