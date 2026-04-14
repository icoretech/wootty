# TERMINAL FEATURE KNOWLEDGE BASE

## OVERVIEW
`src/features/terminal` is the dominant frontend bounded context: terminal runtime, transport lifecycle, session orchestration, notifications, commands, and presentation all live here.

## KEY OWNERSHIP AREAS
| Area | Role |
| --- | --- |
| `app/` | composition shell, controller, engine, bindings |
| `bootstrap/` | environment/bootstrap wiring |
| `adapters/` | browser/runtime-facing transport adapters |
| `protocol/` | wire parsing, generated contract bindings, server error policy |
| `session/` | session domain, protocol parsing, persistence, refresh orchestration |
| `runtime/` | xterm runtime loading and theming |
| `notifications/` | user-facing notice mapping/formatting |
| `commands/` | shortcut/action registry |
| `components/` + `view/` + `presentation/` | UI rendering and presentation helpers |
| `preferences/` + `shared/` + `validation/` | feature-local preferences, shared helpers, and validation guards |

## WHERE TO LOOK
| Task | Location | Notes |
| --- | --- | --- |
| websocket payload parsing | `protocol/terminal-protocol.ts` | parser/source of truth on client |
| generated contract constants | `protocol/generated-wire-contract.ts` | derived from root `contracts/` |
| controller composition | `app/controller/use-terminal-controller.ts` | central UI orchestration |
| transport creation | `adapters/browser-transport.ts` | browser websocket transport |
| session refresh and persistence | `session/application/` + `session/persistence/` | keep protocol/domain split intact |
| xterm loading | `runtime/xterm-runtime.ts` | runtime provider and lazy loading |

## CONVENTIONS
- Treat the terminal feature as contract-first: shared wire changes begin in root `contracts/*.json`, then regenerate bindings
- Keep layer boundaries intact; avoid casually moving logic between `app`, `protocol`, `session`, `runtime`, `notifications`, and `adapters`
- `session/domain`, `session/protocol`, and `session/persistence` are intentionally separate concerns; preserve that split when adding behavior
- User-facing error/status copy belongs in notice/presentation layers, not low-level protocol parsers

## TEST EXPECTATIONS
- Update unit/integration/e2e coverage when changing protocol shapes, session semantics, reconnect behavior, or terminal presentation
- Governance and traceability around this feature are enforced from `docs/governance/terminal-governance-map.json` and related tests

## ANTI-PATTERNS
- Do not hand-edit `protocol/generated-wire-contract.ts`
- Do not bypass protocol helpers with ad hoc websocket payload parsing in UI layers
- Do not collapse read-only/watch semantics, reconnect policy, or session replay behavior into generic booleans without preserving existing contracts
- Do not add feature logic to top-level `App.tsx`; keep it inside the terminal domain

## NOTES
- The repo README already contains a generated terminal module-ownership block; keep local AGENT rules focused on editing behavior, not restating that whole list
- Transport close codes, heartbeat policy, and reconnect behavior have dedicated policy/state files; preserve those central definitions
