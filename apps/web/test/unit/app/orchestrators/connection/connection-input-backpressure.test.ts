import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConnectionInputBackpressure } from "../../../../../src/features/terminal/app/engine/runtime/connection-input-backpressure";
import {
  createInputMessage,
  createResizeMessage,
} from "../../../../../src/features/terminal/protocol/terminal-client-messages";

describe("connection input backpressure", () => {
  it("delivers queued keystrokes before new input when sending recovers", () => {
    let writable = false;
    const delivered: string[] = [];
    const { result } = renderHook(() =>
      useConnectionInputBackpressure({
        attachMode: "control",
        sendNow: (payload) => {
          if (!writable) return false;
          if (payload.type === "input") delivered.push(payload.data);
          return true;
        },
      }),
    );
    act(() => result.current.handleRuntimeInput("echo "));

    writable = true;
    act(() => result.current.handleRuntimeInput("hello\r"));
    act(() => result.current.flushQueuedInput());

    expect(delivered).toEqual(["echo ", "hello\r"]);
    expect(result.current.queuedInputBytes).toBe(0);
  });

  it("does not replay an older resize after a newer size was delivered", () => {
    let writable = false;
    const delivered: Array<{ cols: number; rows: number }> = [];
    const { result } = renderHook(() =>
      useConnectionInputBackpressure({
        attachMode: "control",
        sendNow: (payload) => {
          if (!writable) return false;
          if (payload.type === "resize") {
            delivered.push({ cols: payload.cols, rows: payload.rows });
          }
          return true;
        },
      }),
    );
    act(() => result.current.sendResize(80, 24));

    writable = true;
    act(() => result.current.sendResize(120, 40));
    act(() => result.current.flushPendingResize());

    expect(delivered).toEqual([{ cols: 120, rows: 40 }]);
  });

  it("skips input and resize sends in watch mode", () => {
    const sendNow = vi.fn(() => true);
    const { result } = renderHook(() => {
      return useConnectionInputBackpressure({
        attachMode: "watch",
        sendNow,
      });
    });

    act(() => {
      result.current.sendResize(120, 40);
      result.current.handleRuntimeInput("hello");
      result.current.flushPendingResize();
      result.current.flushQueuedInput();
    });

    expect(result.current.runtimeFitSizeRef.current).toEqual({
      cols: 120,
      rows: 40,
    });
    expect(result.current.queuedInputBytes).toBe(0);
    expect(result.current.droppedInputBytes).toBe(0);
    expect(sendNow).not.toHaveBeenCalled();
  });

  it("queues blocked input and resize, then flushes when transport is writable", () => {
    let writable = false;
    const sendNow = vi.fn((payload: ReturnType<typeof createInputMessage>) => {
      return writable && payload.type !== "ping";
    });
    const { result } = renderHook(() => {
      return useConnectionInputBackpressure({
        attachMode: "control",
        sendNow,
      });
    });

    act(() => {
      result.current.sendResize(100, 30);
      result.current.handleRuntimeInput("abc");
    });

    expect(sendNow).toHaveBeenCalledWith(createResizeMessage(100, 30));
    expect(sendNow).toHaveBeenCalledWith(createInputMessage("abc"));
    expect(result.current.queuedInputBytes).toBe(3);

    writable = true;
    act(() => {
      result.current.flushPendingResize();
      result.current.flushQueuedInput();
    });

    expect(sendNow).toHaveBeenCalledWith(createResizeMessage(100, 30));
    expect(sendNow).toHaveBeenCalledWith(createInputMessage("abc"));
    expect(result.current.queuedInputBytes).toBe(0);
    expect(result.current.droppedInputBytes).toBe(0);

    act(() => {
      result.current.handleRuntimeInput("zz");
      result.current.resetQueuedBuffers();
    });
    expect(result.current.queuedInputBytes).toBe(0);
    expect(result.current.droppedInputBytes).toBe(0);
  });
});
