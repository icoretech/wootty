# WooTTY Server

This directory contains the Go server implementation for WooTTY.

Implemented behavior:

- websocket protocol compatibility with the web app (`attach`, `input`, `resize`, `ping`)
- `attach` supports watch mode (`watch: true`) for read-only observers
- PTY-backed command execution (`creack/pty`)
- reconnect-safe sessions with history replay
- conflict-safe attach: active sessions cannot be silently hijacked by a second connection
- live session listing endpoint: `GET /api/sessions`
- optional deterministic fake PTY mode (`WOOTTY_FAKE_PTY=1`) for e2e tests
- optional bearer auth for sessions/websocket (`WOOTTY_AUTH_TOKEN`), required automatically when binding on non-loopback hosts
- optional explicit websocket origin allowlist via `WOOTTY_ALLOWED_ORIGINS`
- `/api/health` and static web serving fallback

## Run

```bash
cd apps/server
go run ./cmd/woottyd run --host 127.0.0.1 --port 8080
```

With frontend dev server:

```bash
pnpm dev
```

## Test

```bash
cd apps/server
go test ./...
```
