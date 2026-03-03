import { describe, expect, it } from "vitest";
import { TERMINAL_AUTH_POLICY } from "../../../src/features/terminal/bootstrap/auth-policy";

describe("TERMINAL_AUTH_POLICY", () => {
  it("should define websocket auth as cookie", () => {
    expect(TERMINAL_AUTH_POLICY.websocket).toBe("cookie");
  });

  it("should define sessionsHttp auth as bearer_header", () => {
    expect(TERMINAL_AUTH_POLICY.sessionsHttp).toBe("bearer_header");
  });

  it("should have distinct auth strategies for websocket and HTTP", () => {
    expect(TERMINAL_AUTH_POLICY.websocket).not.toBe(
      TERMINAL_AUTH_POLICY.sessionsHttp,
    );
  });
});
