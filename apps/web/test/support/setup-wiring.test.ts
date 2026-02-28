import "./test-setup";

import { describe, expect, it } from "vitest";

describe("test setup wiring", () => {
  it("registers browser polyfills used by integration tests", () => {
    expect(window.matchMedia).toBeTypeOf("function");
    expect(window.requestAnimationFrame).toBeTypeOf("function");
    expect(window.ResizeObserver).toBeDefined();
  });
});
