import type { FloatingControlsModel } from "../../view-models/floating-controls-model";
import { TERMINAL_RUNTIME_COMMAND } from "../runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../viewport-commands";
import type { FloatingControlCommand } from "./actions";

export type FloatingControlIconToken =
  | "reconnect"
  | "clear"
  | "fontDecrease"
  | "fontIncrease"
  | "fontReset"
  | "fullscreenEnter"
  | "fullscreenExit";

type FloatingControlPolicy = {
  isDisabled: (model: FloatingControlsModel) => boolean;
  resolveIcon: (model: FloatingControlsModel) => FloatingControlIconToken;
  resolveLabel?: (model: FloatingControlsModel, defaultLabel: string) => string;
  resolveTooltip?: (
    model: FloatingControlsModel,
    defaultTooltip: string,
  ) => string;
};

export const FLOATING_CONTROL_POLICY: Record<
  FloatingControlCommand,
  FloatingControlPolicy
> = {
  [TERMINAL_RUNTIME_COMMAND.RECONNECT]: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: () => "reconnect",
  },
  [TERMINAL_RUNTIME_COMMAND.CLEAR]: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: () => "clear",
  },
  [VIEWPORT_UI_COMMAND.DECREASE_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize <= model.fontSizeMin,
    resolveIcon: () => "fontDecrease",
  },
  [VIEWPORT_UI_COMMAND.INCREASE_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize >= model.fontSizeMax,
    resolveIcon: () => "fontIncrease",
  },
  [VIEWPORT_UI_COMMAND.RESET_FONT]: {
    isDisabled: (model) =>
      !model.terminalReady || model.fontSize === model.defaultFontSize,
    resolveIcon: () => "fontReset",
  },
  [VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN]: {
    isDisabled: (model) => !model.terminalReady,
    resolveIcon: (model) =>
      model.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
    resolveLabel: (model, defaultLabel) =>
      model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
    resolveTooltip: (model, defaultTooltip) =>
      model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
  },
};
