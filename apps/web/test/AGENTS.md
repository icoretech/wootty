# WEB TEST KNOWLEDGE BASE

## OVERVIEW
`apps/web/test` owns Vitest unit/integration coverage, browser polyfills, doubles, and app harnesses. Add tests here instead of colocating them under `src/`.

## STRUCTURE
```text
apps/web/test/
├── config/      # test-focused config assertions
├── unit/        # focused behavior, contracts, governance, presentation
├── integration/ # app-flow tests with shared harnesses
├── support/     # setup file, doubles, socket/storage helpers
└── *.test.ts    # occasional top-level package tests such as runtime coverage
```

## WHERE TO ADD TESTS
| Change | Location | Notes |
| --- | --- | --- |
| pure logic / presenter / protocol helper | `unit/<closest-area>/` | `*.test.ts` or `*.test.tsx` |
| app flow crossing runtime/socket/storage/fetch | `integration/app/` | use shared harnesses |
| browser polyfill or shared double | `support/` | do not duplicate ad hoc helpers |
| test config assertions or package-level runtime tests | `config/` or top-level `*.test.ts` | match existing layout when no feature bucket fits cleanly |
| browser behavior against built app + Go server | `../e2e/` | use Playwright, not Vitest |

## HARNESSES
- `support/test-setup.ts`: cleanup + `matchMedia` / `ResizeObserver` / RAF / canvas polyfills
- `support/harness/socket-mock.ts`: websocket double
- `support/harness/storage-double.ts`: storage double
- `integration/app/harness/app-harness.tsx`: main composition helper for runtime/socket/storage/fetch orchestration

## CONVENTIONS
- Prefer existing harnesses and doubles over one-off mocks
- Keep test names aligned with the behavior or contract under test, not the implementation accident of the day
- Preserve `@trace` / traceability comments where a test participates in governance mapping
- Contract-oriented TS files are also covered by the separate `tsconfig.contract-tests.json` lane

## DETERMINISM
- Preserve `WOOTTY_FAKE_PTY=1` when a flow depends on stable terminal output
- Use shared fake timers or time controls where the surrounding suite already does so
- Do not weaken browser setup by removing common polyfills from `support/test-setup.ts`

## ANTI-PATTERNS
- Do not put new app tests under `src/`
- Do not invent alternate socket/storage/fetch harnesses when the shared ones already fit
- Do not move browser-behavior assertions into Vitest when they require real Playwright coverage
- Do not drop governance traceability comments from tests tied to `FR-*` requirements
