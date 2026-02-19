# WooTTY Web UI Spec (v0.2)

## Scope

This spec defines the required behavior for the browser-side terminal UI only. Kubernetes and deployment topology are intentionally out of scope for this phase.

## Product goals

1. Session continuity over transient network failures.
2. Terminal rendering that stays correct through viewport and device changes.
3. Fast operator feedback: clear status, clear controls, no hidden state.
4. Predictable behavior validated by automated tests.

## Functional requirements

### FR-1 Connection lifecycle

- UI states: `connecting`, `connected`, `reconnecting`, `closed`, `error`.
- Initial connection sends an `attach` message with terminal geometry.
- Reconnect keeps prior `sessionId` when available.
- Manual reconnect is available from UI controls.

### FR-2 Session persistence

- Session identifier persists to browser local storage.
- A "New Session" control clears persisted session identity and starts a fresh attach flow.

### FR-3 Heartbeat and stale transport detection

- Client sends periodic `ping` messages.
- Client expects `pong`; if missing for timeout window, socket is closed and reconnect flow starts.
- Last measured RTT is exposed in UI.

### FR-4 Input durability during reconnect

- Terminal input generated while websocket is down is buffered client-side.
- Buffer has an upper byte limit; oldest buffered input is evicted first.
- Buffered input flushes when session reaches `connected` after `ready`.
- UI shows buffered and dropped byte counters.

### FR-5 Resize correctness

- Terminal fit is recomputed on container resize.
- Client sends updated `resize` frames.
- Last resize is cached while disconnected and sent once reconnected.
- Fit recalculates when tab regains visibility and when DPR changes.

### FR-6 Terminal behavior

- Scrollback target: very high (`1,000,000` lines) for practical "infinite" history in-session.
- Colors, links, and cursor behavior remain enabled.
- Overlay communicates non-connected states without hiding terminal shell context.

### FR-7 Operator controls

- UI controls: `Reconnect`, `Clear`, `Font -`, `Font +`, `Font Reset`, `New Session`.
- Keyboard shortcuts:
  - `Ctrl/Cmd+Shift+R`: reconnect.
  - `Ctrl/Cmd+Shift+K`: clear terminal.
  - `Ctrl/Cmd+Shift+-` and `Ctrl/Cmd+Shift+=`: decrease/increase font.
  - `Ctrl/Cmd+Shift+0`: reset font size.

### FR-8 Accessibility baseline

- Status changes are announced via ARIA live regions.
- Terminal viewport is exposed as a labeled `region`.
- Controls provide visible keyboard focus affordance.
- Reduced-motion preference is respected in UI transitions.

## Non-functional requirements

1. Node runtime target: `>=24`.
2. React runtime target: `>=19` with React Compiler plugin `1.0.0` enabled.
3. Formatting/linting gate: Biome unified command (`biome check --write --assist-enabled=true`) before typecheck.
4. Tests: Vitest for both server and web packages.

## Test mapping

- `apps/server/test/server.test.ts`
  - websocket attach/input/resize, lifecycle behavior.
- `apps/server/test/session-manager.test.ts`
  - session replay and reconnect history semantics.
- `apps/web/test/terminal-session.test.ts`
  - protocol parsing, reconnect backoff, input outbox accounting, latency formatting, storage helpers.
- `apps/web/test/app.integration.test.tsx`
  - React app state-machine integration: connect/ready flow, reconnect input flush, fresh-session attach behavior, accessibility/status announcements, font controls.
- `apps/web/e2e/terminal.spec.ts`
  - UI state transitions, reconnect control, new-session rotation, viewport-resize stability, font-control behavior.
