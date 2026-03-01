import { describe, expect, it } from "vitest";
import {
  FLOATING_CONTROL_POLICY,
  type FloatingControlIconToken,
} from "../../../src/features/terminal/commands/floating-controls/catalog";
import { TERMINAL_RUNTIME_COMMAND } from "../../../src/features/terminal/commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";
import type { FloatingControlsModel } from "../../../src/features/terminal/view-models/floating-controls-model";

function createModel(
  overrides: Partial<FloatingControlsModel> = {},
): FloatingControlsModel {
  return {
    controlsOpen: true,
    terminalReady: true,
    fontSize: 14,
    fontSizeMin: 10,
    fontSizeMax: 20,
    defaultFontSize: 14,
    isFullscreen: false,
    metadata: {
      reconnect: {
        tooltip: "Reconnect",
        ariaLabel: "Reconnect terminal session",
      },
      clear: { tooltip: "Clear", ariaLabel: "Clear terminal viewport" },
      decreaseFont: {
        tooltip: "Font down",
        ariaLabel: "Decrease terminal font size",
      },
      increaseFont: {
        tooltip: "Font up",
        ariaLabel: "Increase terminal font size",
      },
      resetFont: {
        tooltip: "Reset font",
        ariaLabel: "Reset terminal font size",
      },
      fullscreen: {
        tooltip: "Fullscreen",
        ariaLabel: "Toggle fullscreen terminal",
      },
    },
    ...overrides,
  };
}

describe("floating control policy", () => {
  it("enforces disabled state based on readiness and font bounds", () => {
    const notReady = createModel({ terminalReady: false });

    expect(
      FLOATING_CONTROL_POLICY[TERMINAL_RUNTIME_COMMAND.RECONNECT].isDisabled(
        notReady,
      ),
    ).toBe(true);
    expect(
      FLOATING_CONTROL_POLICY[VIEWPORT_UI_COMMAND.DECREASE_FONT].isDisabled(
        createModel({ fontSize: 10 }),
      ),
    ).toBe(true);
    expect(
      FLOATING_CONTROL_POLICY[VIEWPORT_UI_COMMAND.INCREASE_FONT].isDisabled(
        createModel({ fontSize: 20 }),
      ),
    ).toBe(true);
  });

  it("switches fullscreen icon, label, and tooltip when active", () => {
    const policy =
      FLOATING_CONTROL_POLICY[VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN];
    const fullscreenModel = createModel({ isFullscreen: true });

    expect(policy.resolveIcon(fullscreenModel)).toBe(
      "fullscreenExit" satisfies FloatingControlIconToken,
    );
    expect(
      policy.resolveLabel?.(fullscreenModel, "Toggle fullscreen terminal"),
    ).toBe("Exit fullscreen terminal");
    expect(policy.resolveTooltip?.(fullscreenModel, "Fullscreen")).toBe(
      "Exit fullscreen",
    );
  });
});
