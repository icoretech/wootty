import { describe, expect, it } from "vitest";
import { TERMINAL_AUTH_POLICY } from "../../../src/features/terminal/bootstrap/auth-policy";

describe("TERMINAL_AUTH_POLICY", () => {
  it("should define websocket auth as cookie", () => {
    expect(TERMINAL_AUTH_POLICY.websocket).toBe("cookie");
  });

  it("should define sessionsHttp auth as cookie", () => {
    expect(TERMINAL_AUTH_POLICY.sessionsHttp).toBe("cookie");
  });

  it("should use cookie auth consistently across websocket and HTTP", () => {
    expect(TERMINAL_AUTH_POLICY.websocket).toBe(
      TERMINAL_AUTH_POLICY.sessionsHttp,
    );
  });
});
