import { describe, expect, it } from "vitest";

import {
  createXtermRuntimeProvider,
  loadXtermRuntime,
} from "../src/features/terminal/runtime/xterm-runtime";

describe("xterm runtime loader", () => {
  it("loads runtime modules", async () => {
    const runtime = await loadXtermRuntime();
    expect(typeof runtime.Terminal).toBe("function");
    expect(typeof runtime.FitAddon).toBe("function");
    expect(typeof runtime.WebLinksAddon).toBe("function");
  });

  it("memoizes runtime when using an explicit provider", async () => {
    const provider = createXtermRuntimeProvider();
    const firstRuntime = await provider.load();
    const secondRuntime = await provider.load();

    expect(firstRuntime).toBe(secondRuntime);
  });

  it("resets provider cache explicitly", async () => {
    const provider = createXtermRuntimeProvider();
    const firstRuntime = await provider.load();
    provider.reset();
    const secondRuntime = await provider.load();

    expect(firstRuntime).not.toBe(secondRuntime);
  });
});
