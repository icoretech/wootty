import { describe, expect, it } from "vitest";
import { reconnectDelayMs } from "../../../src/features/terminal/app/engine/transport/transport-policy";
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
import { TERMINAL_WIRE_CONTRACT_VERSION } from "../../../src/features/terminal/protocol/terminal-wire-schema";
import {
  clearStoredSessionIdResult,
  readStoredSessionIdResult,
  storeSessionIdResult,
} from "../../../src/features/terminal/session/persistence/session-storage";
import {
  ACTIVE_SESSION_STORAGE_KEY,
  LAST_SESSION_STORAGE_KEY,
} from "../../../src/features/terminal/session/persistence/storage-keys";

describe("terminal-session helpers", () => {
  it("parses valid server messages and rejects invalid payloads", () => {
    expect(
      parseServerMessageWithReason(
        `{"type":"ready","version":${TERMINAL_WIRE_CONTRACT_VERSION},"sessionId":"abc","readOnly":false}`,
      ),
    ).toEqual({
      message: {
        type: "ready",
        version: TERMINAL_WIRE_CONTRACT_VERSION,
        sessionId: "abc",
        readOnly: false,
      },
    });
    expect(
      parseServerMessageWithReason(
        `{"type":"ready","version":${TERMINAL_WIRE_CONTRACT_VERSION},"sessionId":"abc","readOnly":true}`,
      ),
    ).toEqual({
      message: {
        type: "ready",
        version: TERMINAL_WIRE_CONTRACT_VERSION,
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
    expect(
      parseServerMessageWithReason('{"type":"exit","code":"NaN","signal":15}'),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_exit_payload",
      },
    });
    expect(
      parseServerMessageWithReason('{"type":"exit","code":1e309,"signal":15}'),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_exit_payload",
      },
    });
    expect(
      parseServerMessageWithReason('{"type":"exit","code":1.5,"signal":15}'),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_exit_payload",
      },
    });
    expect(
      parseServerMessageWithReason('{"type":"exit","code":0,"signal":-1}'),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_exit_payload",
      },
    });
    expect(parseServerMessageWithReason('{"type":"pong"}')).toEqual({
      message: { type: "pong" },
    });
    expect(parseServerMessageWithReason('{"type":"ready"}')).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "missing_ready_session_id",
      },
    });
    expect(
      parseServerMessageWithReason(
        '{"type":"ready","version":999,"sessionId":"abc"}',
      ),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_ready_read_only",
      },
    });
    expect(
      parseServerMessageWithReason(
        `{"type":"ready","version":${TERMINAL_WIRE_CONTRACT_VERSION},"sessionId":"abc"}`,
      ),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_ready_read_only",
      },
    });
    expect(
      parseServerMessageWithReason(
        `{"type":"ready","version":${TERMINAL_WIRE_CONTRACT_VERSION},"sessionId":"abc","readOnly":"nope"}`,
      ),
    ).toMatchObject({
      failure: {
        reason: "malformed_payload",
        detail: "invalid_ready_read_only",
      },
    });
    expect(
      parseServerMessageWithReason(
        '{"type":"ready","version":999,"sessionId":"abc","readOnly":false}',
      ),
    ).toEqual({
      failure: {
        reason: "incompatible_version",
        detail: "wire_version_mismatch",
      },
    });
    expect(
      parseServerMessageWithReason('{"type":"future","value":"x"}'),
    ).toMatchObject({
      failure: {
        reason: "unsupported_type",
        detail: "unsupported_message_type",
        rawType: "future",
      },
    });
    expect(parseServerMessageWithReason("not-json")).toEqual({
      failure: {
        reason: "malformed_payload",
        detail: "json_parse_error",
        cause: expect.any(SyntaxError),
      },
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
    const retrySent: string[] = [];
    const retriedBytes = flushOutbox(outbox, (chunk) => {
      retrySent.push(chunk);
      return true;
    });
    expect(retrySent).toEqual(["second\n"]);
    expect(retriedBytes).toBeGreaterThan(0);
    expect(outbox.bytes).toBe(0);
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

    clearStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY);
    expect(
      readStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY).sessionId,
    ).toBeNull();

    storeSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY, "session-1");
    storeSessionIdResult(storage, LAST_SESSION_STORAGE_KEY, "session-2");
    expect(
      readStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY).sessionId,
    ).toBe("session-1");
    expect(
      readStoredSessionIdResult(storage, LAST_SESSION_STORAGE_KEY).sessionId,
    ).toBe("session-2");

    clearStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY);
    expect(
      readStoredSessionIdResult(storage, ACTIVE_SESSION_STORAGE_KEY).sessionId,
    ).toBeNull();
  });

  it("gracefully handles storage backends that throw", () => {
    const explodingStorage: Storage = {
      get length(): number {
        return 0;
      },
      clear(): void {
        throw new Error("quota");
      },
      getItem(): string | null {
        throw new Error("quota");
      },
      key(): string | null {
        return null;
      },
      removeItem(): void {
        throw new Error("quota");
      },
      setItem(): void {
        throw new Error("quota");
      },
    };

    expect(
      readStoredSessionIdResult(explodingStorage, ACTIVE_SESSION_STORAGE_KEY)
        .sessionId,
    ).toBeNull();
    expect(() => {
      storeSessionIdResult(
        explodingStorage,
        ACTIVE_SESSION_STORAGE_KEY,
        "session-1",
      );
      clearStoredSessionIdResult(explodingStorage, ACTIVE_SESSION_STORAGE_KEY);
    }).not.toThrow();
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
