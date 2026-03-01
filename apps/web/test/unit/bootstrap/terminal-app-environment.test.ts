import { describe, expect, it } from "vitest";
import { createTerminalAppEnvironment } from "../../../src/features/terminal/bootstrap/terminal-environment";

describe("terminal app environment factory", () => {
  it("uses an injected websocket endpoint instead of import-time env capture", () => {
    const environment = createTerminalAppEnvironment({
      socketUrl: "wss://override.example.test/api/terminal",
    });

    const resolution = environment.platform.resolveBackendEndpoints(window);
    expect(resolution).toEqual({
      ok: true,
      endpoints: {
        terminalWsUrl: "wss://override.example.test/api/terminal",
        sessionsHttpUrl: "https://override.example.test/api/sessions",
      },
    });
  });
});
