# Runtime and deployment

WooTTY connects a browser to a command running in a PTY on the server. It does not install the command, create a sandbox, or persist a workspace. Choose the server's user, installed tools, working directory, and filesystem access accordingly.

## Configuration

CLI flags override the corresponding environment values. Once the command name appears, remaining arguments belong to that command.

| Variable | Default | Meaning |
| --- | --- | --- |
| `WOOTTY_HOST` | `127.0.0.1` | Listen address for direct host runs; the official container command binds `0.0.0.0` |
| `WOOTTY_PORT` | `8080` | HTTP and WebSocket listen port |
| `WOOTTY_COMMAND` | `$SHELL` or `bash` | Executable launched for each new terminal session |
| `WOOTTY_COMMAND_ARGS` | Empty | Quoted/escaped argument string, parsed without shell expansion |
| `WOOTTY_CWD` | Server working directory | Working directory of the child command |
| `WOOTTY_DETACHED_TTL_MS` | `86400000` | Detached-session TTL in milliseconds (24 hours); `0` disables timer cleanup |
| `WOOTTY_HISTORY_BYTES` | `5242880` | Maximum replay history bytes per session (5 MiB) |
| `WOOTTY_STATIC_DIR` | Auto-detected | Directory containing a built web UI; takes precedence over embedded assets |
| `WOOTTY_AUTH_TOKEN` | Empty | Shared credential for cookie bootstrap; required for non-loopback binds |
| `WOOTTY_ALLOWED_ORIGINS` | Empty | Comma-separated exact WebSocket origins; matching request origins also permit custom hosts on tokenless loopback binds |
| `WOOTTY_ALLOW_INSECURE_NO_AUTH` | Unset | `1` permits unauthenticated non-loopback binds; only for explicitly trusted local networks |
| `WOOTTY_FAKE_PTY` | Unset | `1` selects a deterministic test terminal instead of a real command |

Supported server flags are `--host`, `--port` / `-p`, `--detached-ttl-ms`, `--history-bytes`, and `--help` / `-h`. The legacy `--naked` / `-n` flag is accepted as a no-op. `WOOTTY_RECONNECT_GRACE_MS` has been removed; use `WOOTTY_DETACHED_TTL_MS`.

Numeric values fail startup when malformed or out of range: ports must be `1..65535`, history size must be a positive platform integer, and detached TTL must be `0..9223372036854` milliseconds (also limited by the platform integer size). Empty environment values use defaults; a CLI flag with a missing or blank value is an error. CLI overrides are applied before validation, so a valid CLI value can replace an invalid environment value.

Direct arguments avoid an extra layer of quoting:

```bash
woottyd run --port 9090 /bin/bash -lc 'printf "hello world\n"; exec bash'
```

The environment equivalent is:

```bash
export WOOTTY_COMMAND=/bin/bash
export WOOTTY_COMMAND_ARGS='-lc "printf hello; exec bash"'
woottyd run --port 9090
```

`WOOTTY_COMMAND_ARGS` supports quotes, escapes, and empty arguments. It does not expand environment variables, globs, pipes, or command substitutions. Invoke a shell explicitly when those features are needed. Unclosed quotes or escapes reject startup.

## Authentication and remote access

For local host runs, the default loopback bind can run without a token. A configured token protects the session API and terminal even on loopback. Container and remote binds require a token.

Tokenless loopback access accepts request hosts named `localhost` or literal loopback IP addresses. A custom hostname that resolves to loopback is rejected for session and terminal access to prevent DNS rebinding. Configure `WOOTTY_AUTH_TOKEN` when a reverse proxy preserves a custom hostname. An exact `WOOTTY_ALLOWED_ORIGINS` match can grant an exception only when the request carries that `Origin` header; it does not allow every request to the hostname. Same-origin session-list requests may omit `Origin`, so the allowlist alone is not sufficient for a custom-host browser deployment.

1. Generate a token, for example with `openssl rand -hex 32`, and set `WOOTTY_AUTH_TOKEN` on the server.
2. Open `https://terminal.example.com/#token=YOUR_TOKEN` through your HTTPS endpoint.
3. The browser posts the token as a bearer credential to `/api/auth/bootstrap`, receives the HTTP-only `wootty_auth` cookie, and removes the token fragment after successful bootstrap.
4. Session listing and terminal WebSocket connections authenticate with that cookie. URL query tokens and bearer headers on those two routes are not supported.

Anyone with the token has access to the instance's sessions. There are no per-user accounts or session isolation between token holders. Read-only watch mode prevents terminal input on that connection; it does not make the shared credential read-only. Rotate the token in the server configuration and restart to invalidate existing cookies and close sessions.

For remote deployments, terminate TLS at a trusted reverse proxy, forward WebSocket upgrades, preserve the intended host, and keep the backend private. The WebSocket origin allowlist is an additional browser check, not an authentication mechanism. Serve the UI and API on the same origin. The server does not implement general cross-origin HTTP access.

The trusted proxy must overwrite `X-Forwarded-Proto` with the actual client scheme. WooTTY marks the authentication cookie `Secure` for direct TLS or an exact `https` header value (case-insensitive); comma-separated proxy chains are not parsed. Successful bootstrap always renews the cookie attributes, even when its token already matches. This header only adds the `Secure` attribute: it cannot authenticate a request or downgrade a direct TLS connection.

Without an explicit allowlist, browser WebSocket origins must match the request host. An allowlist does not waive the token requirement for non-loopback binds or bypass cookie authentication when a token is configured.

The health endpoint `/api/health` and static web UI are public; the terminal and session APIs enforce access checks. Restrict ingress to trusted operators using network controls or your existing identity proxy. Avoid mounting host credentials or broad host paths into a terminal container unless the intended operators should have that access.

## Session lifetime

- Each new browser tab starts a fresh session unless you explicitly choose an existing session.
- A running session has at most one controller. Other connections can watch without sending input or resizing the PTY.
- Closing the last controller/watcher starts the detached TTL. A watcher counts as attached, so watch-only sessions do not expire through the detached timer.
- A reconnect to the same server can resume a still-running session and replay its bounded output history. Old output beyond `WOOTTY_HISTORY_BYTES` is discarded.
- Process exit removes the live session. A browser's recent session IDs are navigation history, not saved terminals.
- Server shutdown or restart ends all sessions. There is no disk-backed session store, cross-node routing layer, or replica handoff.

For 72-hour detached retention, set `WOOTTY_DETACHED_TTL_MS=259200000`. Disabling the TTL with `0` requires you to manage the lifetime and resource use of detached processes.

Deploy a single server instance for each session owner. Multiple independent instances are possible, but each needs its own stable route. Adding replicas behind a shared load balancer does not make existing sessions available on those replicas.

## Containers

The base image includes Bash and CA certificates. The `latest-openssh` variant also includes OpenSSH. Pin a release tag for reproducible deployment; `latest` follows published releases.

Build and run locally:

```bash
export WOOTTY_AUTH_TOKEN="$(openssl rand -hex 32)"
docker build -t wootty:local .
docker run --rm -it -p 127.0.0.1:8080:8080 \
  -e WOOTTY_AUTH_TOKEN wootty:local
```

Open `http://127.0.0.1:8080/#token=YOUR_TOKEN` using the token you generated. The published port is restricted to loopback; WooTTY still binds `0.0.0.0` inside the container.

### Compose profiles

The checked-in [Compose file](../docker-compose.yml) requires `WOOTTY_AUTH_TOKEN` and builds from the current source. Export a token before selecting a profile:

```bash
export WOOTTY_AUTH_TOKEN="$(openssl rand -hex 32)"
docker compose up --build wootty
```

| Service | Command | Host port |
| --- | --- | --- |
| `wootty` | `docker compose up --build wootty` | `8080` |
| `wootty-bash` | `docker compose --profile bash up --build wootty-bash` | `8081` |
| `wootty-ssh` | `docker compose --profile ssh up --build wootty-ssh` | `8082` |
| `wootty-retention` | `docker compose --profile retention up --build wootty-retention` | `8083` |
| `wootty-fake-pty` | `docker compose --profile test up --build wootty-fake-pty` | `8084` |

The retention profile uses a 72-hour detached TTL. The fake PTY profile is for testing. Configure an actual SSH destination and trusted host keys before using the SSH profile.

### Run another command

The image uses `CMD`, not an entrypoint. When overriding it, include the executable and the container listen address:

```bash
docker run --rm -it -p 127.0.0.1:8080:8080 \
  -e WOOTTY_AUTH_TOKEN \
  ghcr.io/icoretech/wootty:latest-openssh \
  wootty run --host 0.0.0.0 /usr/bin/ssh user@example.com
```

The SSH client runs inside the container. Supply its authentication and known hosts through your deployment's normal secret/configuration mechanism; host SSH aliases and keys are not inherited automatically.

For other tools, extend the base image:

```dockerfile
FROM ghcr.io/icoretech/wootty:latest
RUN apt-get update \
  && apt-get install -y --no-install-recommends rsync \
  && rm -rf /var/lib/apt/lists/*
```

The binaries `wootty` and `woottyd` are both available in the official image. Copying `/usr/local/bin/wootty` into another Linux image also carries its embedded UI; the destination image must supply the command and its runtime dependencies.

## Kubernetes

Use one replica for each instance and a `Recreate` deployment strategy when replacing it. A rollout ends existing terminals; schedule maintenance accordingly. The terminal executes inside the container, so determine the required files, tools, permissions, and any storage mounts before deploying. WooTTY itself does not need a database or PVC for its in-memory sessions.

The following assumes a `wootty-auth` Secret with a `token` key in the same namespace:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: terminal
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: terminal
  template:
    metadata:
      labels:
        app: terminal
    spec:
      containers:
        - name: terminal
          image: ghcr.io/icoretech/wootty:latest
          ports:
            - name: http
              containerPort: 8080
          env:
            - name: WOOTTY_AUTH_TOKEN
              valueFrom:
                secretKeyRef:
                  name: wootty-auth
                  key: token
          readinessProbe:
            httpGet:
              path: /api/health
              port: http
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
---
apiVersion: v1
kind: Service
metadata:
  name: terminal
spec:
  selector:
    app: terminal
  ports:
    - name: http
      port: 8080
      targetPort: http
```

Pin the image tag before production use. Add your ingress, TLS, and operator access policy separately. Do not expose the service directly to an untrusted network.

## Controls

Open the session badge to create a session, resume a detached session, or watch one controlled elsewhere. The menu distinguishes live sessions on the server from recent IDs stored in the browser. Session labels can be renamed by their controller.

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Shift+R` | Reconnect |
| `Ctrl/Cmd+Shift+K` | Clear the visible terminal |
| `Ctrl/Cmd+Shift+=` / `-` | Increase / decrease font size |
| `Ctrl/Cmd+Shift+0` | Reset font size |
| `Ctrl/Cmd+Shift+F` | Toggle fullscreen |
| `Ctrl/Cmd+Shift+B` | Toggle floating controls |
| `Ctrl/Cmd+Shift+.` | Show the About/shortcuts dialog |

The status bar shows connection state, latency, session ID, control/read-only mode, reconnect count, and input/output metrics. Clearing the visible terminal does not erase the server's replay history.
