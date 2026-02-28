import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setupAppTestEnvironment } from "./harness/app-harness";

describe("TerminalApp direct entrypoint", () => {
  let harness: ReturnType<typeof setupAppTestEnvironment>;

  beforeEach(() => {
    harness = setupAppTestEnvironment();
  });

  afterEach(() => {
    harness.cleanup();
  });

  it("boots websocket transport from the feature entrypoint", async () => {
    await harness.renderTerminalApp("terminal");
    await harness.waitForSocket();
    expect(harness.socket.instances.length).toBe(1);
  });
});
