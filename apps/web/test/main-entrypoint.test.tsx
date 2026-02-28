import { beforeEach, describe, expect, it, vi } from "vitest";

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({
  render: renderSpy,
}));

vi.mock("react-dom/client", () => ({
  createRoot: createRootSpy,
}));

vi.mock("../src/App", () => ({
  default: () => null,
}));

describe("main entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("mounts the app into #root", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import("../src/main");

    expect(createRootSpy).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when #root is missing", async () => {
    await expect(import("../src/main")).rejects.toThrow(
      "Missing #root element",
    );
  });
});
