import { describe, expect, it } from "vitest";

import {
  clearStoredSessionId,
  createOutbox,
  enqueueOutbox,
  flushOutbox,
  formatLatency,
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

    clearStoredSessionId(storage);
    expect(readStoredSessionId(storage)).toBeUndefined();

    storeSessionId(storage, "session-1");
    expect(readStoredSessionId(storage)).toBe("session-1");

    clearStoredSessionId(storage);
    expect(readStoredSessionId(storage)).toBeUndefined();
  });

  it("formats latency for UI", () => {
    expect(formatLatency(null)).toBe("-");
    expect(formatLatency(20)).toBe("20ms");
    expect(formatLatency(1_250)).toBe("1.3s");
  });
});
