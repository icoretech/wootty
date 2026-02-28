import { describe, expect, it } from "vitest";

import { loadXtermRuntime } from "../src/lib/xterm-runtime";

describe("xterm runtime loader", () => {
  it("loads runtime modules and memoizes the result", async () => {
    const firstRuntime = await loadXtermRuntime();
    const secondRuntime = await loadXtermRuntime();

    expect(firstRuntime).toBe(secondRuntime);
    expect(typeof firstRuntime.Terminal).toBe("function");
    expect(typeof firstRuntime.FitAddon).toBe("function");
    expect(typeof firstRuntime.WebLinksAddon).toBe("function");
  });
});
