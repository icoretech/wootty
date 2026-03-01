import type { ShortcutAction } from "../shortcut-actions";
import type { VIEWPORT_UI_COMMAND } from "../viewport-commands";

export type FloatingControlCommand = Exclude<
  ShortcutAction,
  (typeof VIEWPORT_UI_COMMAND)["TOGGLE_CONTROLS"]
>;

export type FloatingControlsAction = {
  type: FloatingControlCommand;
};
