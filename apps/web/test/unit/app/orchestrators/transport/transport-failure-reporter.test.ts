import { describe, expect, it, vi } from "vitest";
import { TransportFailureReporter } from "../../../../../src/features/terminal/app/engine/transport/transport-failure-reporter";
import type { Scheduler } from "../../../../../src/features/terminal/platform/scheduler";

describe("transport failure reporter", () => {
  it("dispatches socket context and publishes failure notice details", () => {
    let nowMs = 10_000;
    const scheduler: Scheduler = {
      now: () => nowMs,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    };
    const dispatchSocketFailure = vi.fn();
    const onSocketFailure = vi.fn();
    const reporter = new TransportFailureReporter({
      scheduler,
      dispatchSocketFailure,
      onSocketFailure,
    });

    reporter.report("close", 1006, "socket_failure", "broken pipe");

    expect(dispatchSocketFailure).toHaveBeenCalledWith(
      "close reason=socket_failure code=1006 detail=broken pipe",
    );
    expect(onSocketFailure).toHaveBeenCalledWith(
      "close",
      1006,
      "socket_failure",
      "broken pipe",
      undefined,
      "broken pipe",
    );
    nowMs += 1000;
    reporter.report("close", 1006, "socket_failure", "broken pipe");
    expect(onSocketFailure).toHaveBeenCalledTimes(1);
  });

  it("resets throttle state and emits repeated marker after cooldown", () => {
    let nowMs = 5_000;
    const scheduler: Scheduler = {
      now: () => nowMs,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    };
    const onSocketFailure = vi.fn();
    const reporter = new TransportFailureReporter({
      scheduler,
      dispatchSocketFailure: vi.fn(),
      onSocketFailure,
    });

    reporter.report("error", undefined, "send_failed");
    nowMs += 16_000;
    reporter.report("error", undefined, "send_failed");

    expect(onSocketFailure).toHaveBeenNthCalledWith(
      2,
      "error",
      undefined,
      "send_failed",
      undefined,
      undefined,
      "send_failed (repeated 2 times)",
    );

    reporter.reset();
    nowMs += 16_000;
    reporter.report("error", undefined, "send_failed");
    expect(onSocketFailure).toHaveBeenCalledTimes(3);
    expect(onSocketFailure).toHaveBeenNthCalledWith(
      3,
      "error",
      undefined,
      "send_failed",
      undefined,
      undefined,
      "send_failed",
    );
  });
});
