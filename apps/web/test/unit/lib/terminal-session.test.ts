import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "../../../src/features/terminal/contracts/transport-policy";
import {
  formatBytes,
  formatLatency,
} from "../../../src/features/terminal/lib/terminal-format";
import {
  createOutbox,
  enqueueOutbox,
  flushOutbox,
} from "../../../src/features/terminal/lib/terminal-outbox";
import { parseServerMessageWithReason } from "../../../src/features/terminal/protocol/terminal-protocol";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  clearStoredSessionId,
  LAST_SESSION_STORAGE_KEY,
  readStoredSessionId,
  storeSessionId,
} from "../../../src/features/terminal/session/persistence/session-storage";

describe("terminal-session helpers", () => {
  it("parses valid server messages and rejects invalid payloads", () => {
    expect(
      parseServerMessageWithReason('{"type":"ready","sessionId":"abc"}'),
    ).toEqual({
      message: {
        type: "ready",
        sessionId: "abc",
        readOnly: false,
      },
    });
    expect(
      parseServerMessageWithReason(
        '{"type":"ready","sessionId":"abc","readOnly":true}',
      ),
    ).toEqual({
      message: {
        type: "ready",
        sessionId: "abc",
        readOnly: true,
      },
    });
    expect(
      parseServerMessageWithReason('{"type":"output","data":"hello"}'),
    ).toEqual({
      message: { type: "output", data: "hello" },
    });
    expect(
      parseServerMessageWithReason('{"type":"exit","code":0,"signal":15}'),
    ).toEqual({
      message: {
        type: "exit",
        code: 0,
        signal: 15,
      },
    });
    expect(parseServerMessageWithReason('{"type":"pong"}')).toEqual({
      message: { type: "pong" },
    });
    expect(parseServerMessageWithReason('{"type":"ready"}')).toEqual({
      reason: "malformed_payload",
    });
    expect(
      parseServerMessageWithReason('{"type":"future","value":"x"}'),
    ).toEqual({
      reason: "unsupported_type",
    });
    expect(parseServerMessageWithReason("not-json")).toEqual({
      reason: "malformed_payload",
    });
  });

  it("backs off reconnect delay with a hard cap", () => {
    expect(reconnectDelayMs(0)).toBe(300);
    expect(reconnectDelayMs(1)).toBe(540);
    expect(reconnectDelayMs(4)).toBeLessThanOrEqual(5_000);
    expect(reconnectDelayMs(100)).toBe(5_000);
  });

  it("buffers and flushes input while preserving byte accounting", () => {
    const outbox = createOutbox();

    enqueueOutbox(outbox, "echo 1\n", 16);
    enqueueOutbox(outbox, "echo 2\n", 16);
    enqueueOutbox(outbox, "echo 3\n", 16);

    const sent: string[] = [];
    const sentBytes = flushOutbox(outbox, (chunk) => {
      sent.push(chunk);
      return true;
    });

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.join("")).toContain("echo");
    expect(sentBytes).toBeGreaterThan(0);
    expect(outbox.bytes).toBe(0);
  });

  it("keeps unsent chunks queued when sender reports failure", () => {
    const outbox = createOutbox();
    enqueueOutbox(outbox, "first\n");
    enqueueOutbox(outbox, "second\n");

    let attempts = 0;
    const sentBytes = flushOutbox(outbox, (_chunk) => {
      attempts += 1;
      return attempts === 1;
    });

    expect(sentBytes).toBeGreaterThan(0);
    expect(outbox.chunks).toEqual(["second\n"]);
    expect(outbox.bytes).toBeGreaterThan(0);
  });

  it("stores and clears session id in storage", () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length(): number {
        return values.size;
      },
      getItem(key: string): string | null {
        return values.get(key) ?? null;
      },
      key(index: number): string | null {
        return Array.from(values.keys())[index] ?? null;
      },
      setItem(key: string, value: string): void {
        values.set(key, value);
      },
      removeItem(key: string): void {
        values.delete(key);
      },
      clear(): void {
        values.clear();
      },
    };

    clearStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY);
    expect(
      readStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY),
    ).toBeUndefined();

    storeSessionId(storage, ACTIVE_SESSION_STORAGE_KEY, "session-1");
    storeSessionId(storage, LAST_SESSION_STORAGE_KEY, "session-2");
    expect(readStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY)).toBe(
      "session-1",
    );
    expect(readStoredSessionId(storage, LAST_SESSION_STORAGE_KEY)).toBe(
      "session-2",
    );

    clearStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY);
    expect(
      readStoredSessionId(storage, ACTIVE_SESSION_STORAGE_KEY),
    ).toBeUndefined();
  });

  it("formats latency for UI", () => {
    expect(formatLatency(null)).toBe("-");
    expect(formatLatency(20)).toBe("20ms");
    expect(formatLatency(1_250)).toBe("1.3s");
  });

  it("formats bytes for compact human-readable badges", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(36)).toBe("36 B");
    expect(formatBytes(1_024)).toBe("1.0 KiB");
    expect(formatBytes(15_360)).toBe("15 KiB");
    expect(formatBytes(1_572_864)).toBe("1.5 MiB");
  });
});
