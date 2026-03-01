import { describe, expect, it } from "vitest";
import { floatingControlPolicy } from "../../../src/features/terminal/commands/floating-controls/catalog";
import type { FloatingControlIconToken } from "../../../src/features/terminal/commands/floating-controls/contracts";
import { TERMINAL_RUNTIME_COMMAND } from "../../../src/features/terminal/commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../../src/features/terminal/commands/viewport-commands";
import type { FloatingControlsModel } from "../../../src/features/terminal/view-models/floating-controls-model";

const BASE_MODEL: FloatingControlsModel = {
  controlsOpen: true,
  terminalReady: true,
  fontSize: 14,
  fontSizeMin: 10,
  fontSizeMax: 20,
  defaultFontSize: 14,
  isFullscreen: false,
};

describe("floating control policy", () => {
  it("enforces disabled state based on readiness and font bounds", () => {
    const notReady: FloatingControlsModel = {
      ...BASE_MODEL,
      terminalReady: false,
    };

    expect(
      floatingControlPolicy(TERMINAL_RUNTIME_COMMAND.RECONNECT).isDisabled(
        notReady,
      ),
    ).toBe(true);
    expect(
      floatingControlPolicy(VIEWPORT_UI_COMMAND.DECREASE_FONT).isDisabled({
        ...BASE_MODEL,
        fontSize: 10,
      }),
    ).toBe(true);
    expect(
      floatingControlPolicy(VIEWPORT_UI_COMMAND.INCREASE_FONT).isDisabled({
        ...BASE_MODEL,
        fontSize: 20,
      }),
    ).toBe(true);
  });

  it("switches fullscreen icon, label, and tooltip when active", () => {
    const policy = floatingControlPolicy(VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN);
    const fullscreenModel: FloatingControlsModel = {
      ...BASE_MODEL,
      isFullscreen: true,
    };

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
