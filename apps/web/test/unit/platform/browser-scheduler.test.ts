import { afterEach, describe, expect, it, vi } from "vitest";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";

describe("browser scheduler adapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("delegates timeout and interval APIs to browser globals", () => {
    const timeoutTask = vi.fn();
    const intervalTask = vi.fn();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    const timeoutHandle = browserScheduler.setTimeout(timeoutTask, 25);
    const intervalHandle = browserScheduler.setInterval(intervalTask, 50);
    browserScheduler.clearTimeout(timeoutHandle);
    browserScheduler.clearInterval(intervalHandle);

    expect(setTimeoutSpy).toHaveBeenCalledWith(timeoutTask, 25);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle);
    expect(setIntervalSpy).toHaveBeenCalledWith(intervalTask, 50);
    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalHandle);
  });

  it("delegates now() to Date.now", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1234);

    expect(browserScheduler.now()).toBe(1234);
    expect(nowSpy).toHaveBeenCalledTimes(1);
  });
});
