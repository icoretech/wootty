import { describe, expect, it } from "vitest";

import {
  ACTIVE_SESSION_STORAGE_KEY,
  clearStoredSessionId,
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  formatBytes,
  formatLatency,
  LAST_SESSION_STORAGE_KEY,
  parseServerMessage,
  readStoredSessionId,
  reconnectDelayMs,
  storeSessionId,
} from "../src/lib/terminal-session";

describe("terminal-session helpers", () => {
  it("parses valid server messages and rejects invalid payloads", () => {
    expect(parseServerMessage('{"type":"ready","sessionId":"abc"}')).toEqual({
      type: "ready",
      sessionId: "abc",
      readOnly: false,
    });
    expect(
      parseServerMessage('{"type":"ready","sessionId":"abc","readOnly":true}'),
    ).toEqual({
      type: "ready",
      sessionId: "abc",
      readOnly: true,
    });
    expect(parseServerMessage('{"type":"output","data":"hello"}')).toEqual({
      type: "output",
      data: "hello",
    });
    expect(parseServerMessage('{"type":"exit","code":0,"signal":15}')).toEqual({
      type: "exit",
      code: 0,
      signal: 15,
    });
    expect(parseServerMessage('{"type":"pong"}')).toEqual({ type: "pong" });
    expect(parseServerMessage('{"type":"ready"}')).toBeNull();
    expect(parseServerMessage("not-json")).toBeNull();
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
    });

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.join("")).toContain("echo");
    expect(sentBytes).toBeGreaterThan(0);
    expect(outbox.bytes).toBe(0);
  });

  it("stores and clears session id in storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem(key: string): string | null {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        values.set(key, value);
      },
      removeItem(key: string): void {
        values.delete(key);
      },
    } as Storage;

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
