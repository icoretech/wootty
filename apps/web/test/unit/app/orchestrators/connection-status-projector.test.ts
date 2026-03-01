import { describe, expect, it } from "vitest";
import {
  projectConnectionStatus,
  shouldClearStatusOverride,
} from "../../../../src/features/terminal/app/engine/protocol/connection-status-projector";

describe("connection status projector", () => {
  it("projects explicit flags over transport state coherently", () => {
    expect(projectConnectionStatus(null, "connecting")).toBe("connecting");
    expect(projectConnectionStatus("runtime_error", "connected")).toBe("error");
    expect(projectConnectionStatus("protocol_incompatible", "connected")).toBe(
      "error",
    );
    expect(projectConnectionStatus("session_not_found", "connected")).toBe(
      "closed",
    );
    expect(projectConnectionStatus("attach_forbidden", "connected")).toBe(
      "connected",
    );
    expect(projectConnectionStatus("remote_exit", "connected")).toBe("closed");
  });

  it("clears status flag once transport reaches connected", () => {
    expect(shouldClearStatusOverride(null, "connected")).toBe(false);
    expect(shouldClearStatusOverride("remote_exit", "reconnecting")).toBe(
      false,
    );
    expect(shouldClearStatusOverride("remote_exit", "connected")).toBe(true);
  });
});
