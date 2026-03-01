import { TERMINAL_RUNTIME_COMMAND } from "../runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../viewport-commands";
import type { FloatingControlCommand } from "./actions";

export type FloatingControlMetadataKey =
  | "reconnect"
  | "clear"
  | "decreaseFont"
  | "increaseFont"
  | "resetFont"
  | "fullscreen";

type FloatingControlRegistryEntry = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  action: FloatingControlCommand;
};

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  [
    {
      testId: "reconnect-button",
      metadataKey: "reconnect",
      action: TERMINAL_RUNTIME_COMMAND.RECONNECT,
    },
    {
      testId: "clear-button",
      metadataKey: "clear",
      action: TERMINAL_RUNTIME_COMMAND.CLEAR,
    },
    {
      testId: "font-decrease-button",
      metadataKey: "decreaseFont",
      action: VIEWPORT_UI_COMMAND.DECREASE_FONT,
    },
    {
      testId: "font-increase-button",
      metadataKey: "increaseFont",
      action: VIEWPORT_UI_COMMAND.INCREASE_FONT,
    },
    {
      testId: "font-reset-button",
      metadataKey: "resetFont",
      action: VIEWPORT_UI_COMMAND.RESET_FONT,
    },
    {
      testId: "fullscreen-button",
      metadataKey: "fullscreen",
      action: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
    },
  ] as const;
