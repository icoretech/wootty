import { TERMINAL_RUNTIME_COMMAND } from "../../commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../commands/viewport-commands";
import type { FloatingControlMetadata } from "../contracts/floating-control-metadata";
import type { FloatingControlCommand } from "./actions";

const FLOATING_CONTROL_METADATA_BY_COMMAND: Record<
  FloatingControlCommand,
  FloatingControlMetadata
> = {
  [TERMINAL_RUNTIME_COMMAND.RECONNECT]: {
    tooltip: "Reconnect",
    ariaLabel: "Reconnect terminal session",
    ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
  },
  [TERMINAL_RUNTIME_COMMAND.CLEAR]: {
    tooltip: "Clear",
    ariaLabel: "Clear terminal viewport",
    ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
  },
  [VIEWPORT_UI_COMMAND.DECREASE_FONT]: {
    tooltip: "Font down",
    ariaLabel: "Decrease terminal font size",
    ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
  },
  [VIEWPORT_UI_COMMAND.INCREASE_FONT]: {
    tooltip: "Font up",
    ariaLabel: "Increase terminal font size",
    ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
  },
  [VIEWPORT_UI_COMMAND.RESET_FONT]: {
    tooltip: "Reset font",
    ariaLabel: "Reset terminal font size",
    ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
  },
  [VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN]: {
    tooltip: "Fullscreen",
    ariaLabel: "Toggle fullscreen terminal",
  },
};

export function floatingControlMetadata(
  command: FloatingControlCommand,
): FloatingControlMetadata {
  return FLOATING_CONTROL_METADATA_BY_COMMAND[command];
}
