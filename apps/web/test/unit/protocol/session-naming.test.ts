import { describe, expect, it } from "vitest";
import { sessionDisplayName } from "../../../src/features/terminal/presentation/formatters";
import { parseSessionsResponse } from "../../../src/features/terminal/session/protocol/sessions-payload-parser";

describe("session naming", () => {
  describe("parser", () => {
    it("parses name when present", () => {
      const result = parseSessionsResponse({
        sessions: [
          {
            id: "abc",
            hasController: true,
            canControl: false,
            watchers: 0,
            createdAtMs: 100,
            lastActivityMs: 200,
            command: "bash",
            name: "deploy-prod",
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(result.sessions[0].name).toBe("deploy-prod");
    });

    it("returns null for missing name", () => {
      const result = parseSessionsResponse({
        sessions: [
          {
            id: "abc",
            hasController: true,
            canControl: false,
            watchers: 0,
            createdAtMs: 100,
            lastActivityMs: 200,
            command: "bash",
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(result.sessions[0].name).toBeNull();
    });

    it("returns null for empty name", () => {
      const result = parseSessionsResponse({
        sessions: [
          {
            id: "abc",
            hasController: true,
            canControl: false,
            watchers: 0,
            createdAtMs: 100,
            lastActivityMs: 200,
            command: "bash",
            name: "",
          },
        ],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected ok");
      expect(result.sessions[0].name).toBeNull();
    });
  });

  describe("sessionDisplayName", () => {
    it("returns name when provided", () => {
      expect(sessionDisplayName("deploy-prod", "abc123def456")).toBe(
        "deploy-prod",
      );
    });

    it("returns shortened id when name is null", () => {
      expect(
        sessionDisplayName(null, "abcdefgh-1234-5678-9012-ijklmnopqrst"),
      ).toBe("abcdefgh…qrst");
    });
  });
});
