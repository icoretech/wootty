import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalAppEnvironment } from "../../../src/features/terminal/app/TerminalApp";

const { createTerminalAppEnvironment, useTerminalController } = vi.hoisted(
  () => {
    return {
      createTerminalAppEnvironment: vi.fn(() => {
        return {
          platform: {},
          domain: {},
        };
      }),
      useTerminalController: vi.fn(() => {
        return {
          isFullscreen: false,
          appViewportRef: { current: null },
          statusAnnouncement: "",
          terminalElementRef: { current: null },
          status: "connecting",
          terminalReady: false,
          statusText: "connecting",
          floatingControlsModel: {},
          dispatchFloatingControls: vi.fn(),
          sessionMenuOpen: false,
          sessionMenuRef: { current: null },
          sessionMenuModel: {},
          dispatchSessionMenu: vi.fn(),
          statusBarModel: {},
          sessionButtonRef: { current: null },
          dispatchStatusBar: vi.fn(),
        };
      }),
    };
  },
);

vi.mock("../../../src/features/terminal/bootstrap/terminal-environment", () => {
  return { createTerminalAppEnvironment };
});

vi.mock("../../../src/features/terminal/app/use-terminal-controller", () => {
  return { useTerminalController };
});

vi.mock("../../../src/features/terminal/components/FloatingControls", () => {
  return { FloatingControls: () => null };
});

vi.mock("../../../src/features/terminal/components/SessionMenu", () => {
  return { SessionMenu: () => null };
});

vi.mock("../../../src/features/terminal/components/StatusBar", () => {
  return { StatusBar: () => null };
});

import { TerminalApp } from "../../../src/features/terminal/app/TerminalApp";

describe("terminal app bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a default environment when a custom environment is provided", () => {
    const customEnvironment = {
      platform: {} as TerminalAppEnvironment["platform"],
      domain: {} as TerminalAppEnvironment["domain"],
    };

    render(<TerminalApp environment={customEnvironment} />);

    expect(createTerminalAppEnvironment).not.toHaveBeenCalled();
    expect(useTerminalController).toHaveBeenCalledWith(customEnvironment);
  });

  it("creates the default environment lazily and only once per mount", () => {
    const rendered = render(<TerminalApp />);
    rendered.rerender(<TerminalApp />);

    expect(createTerminalAppEnvironment).toHaveBeenCalledTimes(1);
  });
});
