# WooTTY server

The Go server owns HTTP and WebSocket access, authentication, command execution, PTY sessions, output replay, and web asset delivery. It runs on Linux and macOS; use WSL or Docker on Windows.

## Run

From the repository root, build the web UI and server:

```bash
pnpm build:binary
./apps/server/woottyd run --host 127.0.0.1 --port 8080 bash
```

The resulting binary embeds the web UI. For development, `pnpm dev` starts Vite and the Go server together. For backend-only work:

```bash
cd apps/server
go run ./cmd/woottyd run --host 127.0.0.1 --port 8080
```

A plain `go build` or `go run` does not build/embed the frontend. It can serve an existing `apps/web/dist` or an explicit `WOOTTY_STATIC_DIR`; use the root binary build when packaging a standalone server.

The configured command runs with the server's user, environment, and filesystem permissions. Host execution uses host binaries; container execution uses binaries and files inside the container.

## Runtime contract

- `GET /api/health` is an unauthenticated health endpoint.
- `POST /api/auth/bootstrap` accepts a bearer token and establishes the authentication cookie.
- `GET /api/sessions` lists live sessions; `/api/terminal` upgrades to the terminal WebSocket. When a token is configured, these routes require the cookie.
- One connection controls a session. Other connections can explicitly watch it in read-only mode; attaching does not silently take control.
- Sessions, child processes, and bounded output history belong to one server process. Detached sessions live until their TTL, process exit, or server shutdown. They are not shared between replicas or persisted across restarts.
- Non-loopback binds require `WOOTTY_AUTH_TOKEN` unless the explicit insecure override is enabled.
- Tokenless loopback access requires a loopback request host. Configure a token for custom-host reverse proxies; an explicitly allowed origin only grants a host exception to requests carrying that exact `Origin` header.

See the [runtime reference](../../docs/runtime.md) for configuration, deployment, and authentication; see the [architecture guide](../../docs/architecture.md) for protocol and module boundaries.

## Test

```bash
cd apps/server
go test ./...
go test -race ./...
```

`WOOTTY_FAKE_PTY=1` enables deterministic fake terminal behavior for browser tests. It is not a production shell.
