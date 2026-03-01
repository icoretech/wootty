import { describe, expect, it, vi } from "vitest";
import {
  ageLabel,
  latencyTone,
  shortSessionId,
  statusLabel,
} from "../../../../src/features/terminal/presentation/formatters";

describe("terminal view-model helpers", () => {
  it("formats status labels", () => {
    expect(statusLabel("connecting")).toBe("Connecting");
    expect(statusLabel("connected")).toBe("Connected");
    expect(statusLabel("reconnecting")).toBe("Reconnecting");
    expect(statusLabel("closed")).toBe("Closed");
    expect(statusLabel("error")).toBe("Error");
  });

  it("assigns latency tones", () => {
    expect(latencyTone("connected", 40)).toBe("good");
    expect(latencyTone("connected", 120)).toBe("warn");
    expect(latencyTone("connected", 380)).toBe("bad");
    expect(latencyTone("reconnecting", 60)).toBe("neutral");
    expect(latencyTone("connected", null)).toBe("neutral");
  });

  it("formats age and session identifiers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-28T17:00:00Z"));

    expect(ageLabel(Date.now() - 7_000)).toBe("7s ago");
    expect(ageLabel(Date.now() - 5 * 60 * 1_000)).toBe("5m ago");
    expect(ageLabel(Date.now() - 2 * 60 * 60 * 1_000)).toBe("2h ago");
    expect(ageLabel(Date.now() - 3 * 24 * 60 * 60 * 1_000)).toBe("3d ago");

    expect(shortSessionId("short-id")).toBe("short-id");
    expect(shortSessionId("session-abcdefghijklmno")).toBe("session-…lmno");

    vi.useRealTimers();
  });
});
