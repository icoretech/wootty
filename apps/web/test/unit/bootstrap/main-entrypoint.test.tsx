import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({
  render: renderSpy,
}));

vi.mock("react-dom/client", () => ({
  createRoot: createRootSpy,
}));

describe("main entrypoint", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("mounts the app into #root", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.doMock("../../../src/App", () => ({
      default: () => null,
    }));

    await import("../../../src/main");

    await waitFor(() => {
      expect(createRootSpy).toHaveBeenCalledWith(
        document.getElementById("root"),
      );
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("throws when #root is missing", async () => {
    await expect(import("../../../src/main")).rejects.toThrow(
      "Missing #root element",
    );
  });

  it("renders a bootstrap fallback when App import fails invariants", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.doMock("../../../src/App", () => {
      throw new Error("manifest exploded");
    });

    await import("../../../src/main");

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(1);
      const rendered = renderSpy.mock.calls[0]?.[0] as {
        props?: {
          className?: string;
          children?: { props?: { "data-testid"?: string; children?: string } };
        };
      };
      expect(rendered.props?.className).toBe("shell shell--bootstrap-failure");
      expect(rendered.props?.children?.props?.["data-testid"]).toBe(
        "bootstrap-failure",
      );
      expect(rendered.props?.children?.props?.children).toContain(
        "Unable to start terminal application.",
      );
    });
  });
});
