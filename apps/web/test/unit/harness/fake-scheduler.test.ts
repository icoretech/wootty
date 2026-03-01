import { describe, expect, it } from "vitest";
import { FakeScheduler } from "../../support/harness/fake-scheduler";

describe("fake scheduler", () => {
  it("runs same-tick timeouts in registration order", () => {
    const scheduler = new FakeScheduler();
    const calls: string[] = [];

    scheduler.setTimeout(() => {
      calls.push("first");
    }, 10);
    scheduler.setTimeout(() => {
      calls.push("second");
    }, 10);
    scheduler.setTimeout(() => {
      calls.push("third");
    }, 10);

    scheduler.advanceBy(10);

    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("does not execute timeouts after they are cleared", () => {
    const scheduler = new FakeScheduler();
    const calls: string[] = [];

    const timer = scheduler.setTimeout(() => {
      calls.push("fired");
    }, 50);
    scheduler.clearTimeout(timer);

    scheduler.advanceBy(100);

    expect(calls).toEqual([]);
  });
});
