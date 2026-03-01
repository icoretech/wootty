import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    loadRuntime: vi.fn(async () => ({}) as never),
    createProvider: vi.fn(),
  };
});

vi.mock("../../../src/features/terminal/runtime/xterm-runtime", () => {
  return {
    createXtermRuntimeProvider: mocks.createProvider,
  };
});

describe("runtime loader", () => {
  beforeEach(() => {
    mocks.loadRuntime.mockReset();
    mocks.loadRuntime.mockResolvedValue({} as never);
    mocks.createProvider.mockReset();
    mocks.createProvider.mockImplementation(() => ({
      load: mocks.loadRuntime,
    }));
    vi.resetModules();
  });

  it("lazily initializes one runtime provider and reuses it", async () => {
    const { createRuntimeLoader } = await import(
      "../../../src/features/terminal/bootstrap/runtime-loader"
    );

    const load = createRuntimeLoader();
    await load();
    await load();

    expect(mocks.createProvider).toHaveBeenCalledTimes(1);
    expect(mocks.loadRuntime).toHaveBeenCalledTimes(2);
  });
});
