import type { ShortcutAction } from "../../commands/shortcut-actions";
import type { VIEWPORT_UI_COMMAND } from "../../commands/viewport-commands";

export type FloatingControlCommand = Exclude<
  ShortcutAction,
  (typeof VIEWPORT_UI_COMMAND)["TOGGLE_CONTROLS"]
>;

export type FloatingControlsAction = {
  type: FloatingControlCommand;
};
