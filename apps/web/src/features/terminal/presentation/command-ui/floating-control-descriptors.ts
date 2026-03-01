import type { FloatingControlMetadata } from "../../commands/floating-control-metadata-contract";
import { TERMINAL_RUNTIME_COMMAND } from "../../commands/runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../../commands/viewport-commands";
import { floatingControlMetadata } from "./floating-control-metadata";

type FloatingControlDescriptors = {
  reconnect: FloatingControlMetadata;
  clear: FloatingControlMetadata;
  decreaseFont: FloatingControlMetadata;
  increaseFont: FloatingControlMetadata;
  resetFont: FloatingControlMetadata;
  fullscreen: FloatingControlMetadata;
};

export function buildFloatingControlDescriptors(): FloatingControlDescriptors {
  return {
    reconnect: floatingControlMetadata(TERMINAL_RUNTIME_COMMAND.RECONNECT),
    clear: floatingControlMetadata(TERMINAL_RUNTIME_COMMAND.CLEAR),
    decreaseFont: floatingControlMetadata(VIEWPORT_UI_COMMAND.DECREASE_FONT),
    increaseFont: floatingControlMetadata(VIEWPORT_UI_COMMAND.INCREASE_FONT),
    resetFont: floatingControlMetadata(VIEWPORT_UI_COMMAND.RESET_FONT),
    fullscreen: floatingControlMetadata(VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN),
  };
}
