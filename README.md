# WooTTY

[![CI](https://img.shields.io/github/actions/workflow/status/icoretech/wootty/ci.yml?branch=main&label=CI)](https://github.com/icoretech/wootty/actions/workflows/ci.yml)
[![Release Please](https://img.shields.io/github/actions/workflow/status/icoretech/wootty/release-please.yml?branch=main&label=Release%20Please)](https://github.com/icoretech/wootty/actions/workflows/release-please.yml)
[![Container Publish](https://img.shields.io/github/actions/workflow/status/icoretech/wootty/publish-image.yml?branch=main&label=Container)](https://github.com/icoretech/wootty/actions/workflows/publish-image.yml)
[![GitHub Release](https://img.shields.io/github/v/release/icoretech/wootty)](https://github.com/icoretech/wootty/releases)
[![Node](https://img.shields.io/badge/node-%3E%3D24-3c873a)](https://nodejs.org/)
[![License](https://img.shields.io/github/license/icoretech/wootty)](./LICENSE)

Flawless browser terminal for real operators.

WooTTY is a clean-slate browser terminal designed for one non-negotiable outcome: a terminal experience that stays reliable under real pressure (resize storms, reconnects, long output, and unstable networks).

![WooTTY UI screenshot](docs/assets/wootty-ui.png)

## Why WooTTY

- Terminal-first UI: maximum viewport, compact status bar, floating controls.
- Reconnect-safe sessions: resume by `sessionId`, replay buffered output.
- Resize fidelity: client and PTY stay in sync during rapid window changes.
- Operational defaults: high scrollback, keyboard-first controls, low-friction deployment.
- Modern stack: Node 24+, React 19 + compiler, Fastify, xterm.js.

## Table of Contents

- [Quick Start](#quick-start)
- [Run with Docker](#run-with-docker)
- [Run from Source](#run-from-source)
- [Operator Controls](#operator-controls)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Testing and Quality](#testing-and-quality)
- [Contributing](#contributing)
- [Security](#security)
- [OSS Standards](#oss-standards)

## Quick Start

### Run with Docker

Stable image from GitHub Container Registry:

```bash
docker run --rm -it -p 3000:3000 ghcr.io/icoretech/wootty:latest
```

Then open `http://127.0.0.1:3000`.

Pin by version:

```bash
docker run --rm -it -p 3000:3000 ghcr.io/icoretech/wootty:v0.1.0
```

Run a custom command:

```bash
docker run --rm -it -p 3000:3000 \
  -e WOOTTY_COMMAND=/bin/bash \
  -e WOOTTY_COMMAND_ARGS="-l" \
  ghcr.io/icoretech/wootty:latest
```

### Run from Source

```bash
pnpm install
pnpm dev
```

- Web: `http://127.0.0.1:5173`
- Server: `http://127.0.0.1:3000`

Production-like local run:

```bash
pnpm build
node apps/server/dist/cli.js run -p 3000 bash
```

Compatibility flag for existing wrappers:

```bash
node apps/server/dist/cli.js run -naked bash
```

## Run with Docker

Build locally:

```bash
docker build -t wootty:dev .
docker run --rm -it -p 3000:3000 wootty:dev
```

The container serves:

- backend API/websocket on `/api/*`
- web UI from `apps/web/dist`

## Operator Controls

Keyboard shortcuts:

- `Ctrl/Cmd+Shift+R`: reconnect
- `Ctrl/Cmd+Shift+K`: clear viewport
- `Ctrl/Cmd+Shift+=`: increase font size
- `Ctrl/Cmd+Shift+-`: decrease font size
- `Ctrl/Cmd+Shift+0`: reset font size
- `Ctrl/Cmd+Shift+F`: fullscreen
- `Ctrl/Cmd+Shift+B`: toggle controls

Status bar metrics:

- connection status and latency
- session id
- reconnect count
- buffered/dropped input bytes
- output bytes

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `WOOTTY_HOST` | `0.0.0.0` | Bind address |
| `WOOTTY_PORT` | `3000` | HTTP/WebSocket port |
| `WOOTTY_RECONNECT_GRACE_MS` | `30000` | Session retention window while reconnecting |
| `WOOTTY_HISTORY_BYTES` | `5242880` | Buffered output bytes for replay |
| `WOOTTY_COMMAND` | `$SHELL` or `bash` | Executed command |
| `WOOTTY_COMMAND_ARGS` | _empty_ | Space-separated command args |
| `WOOTTY_CWD` | current directory | Process working directory |
| `WOOTTY_FAKE_PTY` | `0` | Set to `1` for deterministic fake PTY mode |

## Architecture

```mermaid
flowchart LR
  B[Browser UI (React + xterm)] -- WebSocket --> S[WooTTY Server (Fastify)]
  S -- PTY attach/input/resize --> P[Shell Process (@lydell/node-pty)]
  P -- output stream --> S
  S -- output + status events --> B
  S -- session history buffer --> H[(In-memory replay buffer)]
```

## Testing and Quality

Standard quality gates:

```bash
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:pty-smoke
```

Cross-browser browser matrix (Chromium + Firefox + WebKit):

```bash
pnpm test:e2e:cross
```

Notes:

- `pnpm lint` applies Biome fixes and then runs typecheck.
- CI enforces zero formatting drift (`git diff --exit-code`).
- PTY smoke runs in strict mode in CI (`PTY_SMOKE_STRICT=1`).

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

## Security

Report vulnerabilities through [SECURITY.md](./SECURITY.md).

## OSS Standards

WooTTY ships with:

- `LICENSE` (MIT)
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- issue and PR templates
- CI, release, and container publish workflows
