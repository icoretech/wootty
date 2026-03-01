import type { FloatingControlsModel } from "../../view-models/floating-controls-model";
import { TERMINAL_RUNTIME_COMMAND } from "../runtime-commands";
import { VIEWPORT_UI_COMMAND } from "../viewport-commands";
import type { FloatingControlCommand } from "./actions";
import type { FloatingControlMetadata } from "./floating-control-metadata";

export type FloatingControlMetadataKey =
  | "reconnect"
  | "clear"
  | "decreaseFont"
  | "increaseFont"
  | "resetFont"
  | "fullscreen";

export type FloatingControlIconToken =
  | "reconnect"
  | "clear"
  | "fontDecrease"
  | "fontIncrease"
  | "fontReset"
  | "fullscreenEnter"
  | "fullscreenExit";

export type FloatingControlPolicy = {
  isDisabled: (model: FloatingControlsModel) => boolean;
  resolveIcon: (model: FloatingControlsModel) => FloatingControlIconToken;
  resolveLabel?: (model: FloatingControlsModel, defaultLabel: string) => string;
  resolveTooltip?: (
    model: FloatingControlsModel,
    defaultTooltip: string,
  ) => string;
};

type FloatingControlCatalogEntry = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  action: FloatingControlCommand;
  metadata: FloatingControlMetadata;
  policy: FloatingControlPolicy;
};

export const FLOATING_CONTROL_CATALOG: readonly FloatingControlCatalogEntry[] =
  [
    {
      testId: "reconnect-button",
      metadataKey: "reconnect",
      action: TERMINAL_RUNTIME_COMMAND.RECONNECT,
      metadata: {
        tooltip: "Reconnect",
        ariaLabel: "Reconnect terminal session",
        ariaKeyShortcuts: "Control+Shift+R Meta+Shift+R",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: () => "reconnect",
      },
    },
    {
      testId: "clear-button",
      metadataKey: "clear",
      action: TERMINAL_RUNTIME_COMMAND.CLEAR,
      metadata: {
        tooltip: "Clear",
        ariaLabel: "Clear terminal viewport",
        ariaKeyShortcuts: "Control+Shift+K Meta+Shift+K",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: () => "clear",
      },
    },
    {
      testId: "font-decrease-button",
      metadataKey: "decreaseFont",
      action: VIEWPORT_UI_COMMAND.DECREASE_FONT,
      metadata: {
        tooltip: "Font down",
        ariaLabel: "Decrease terminal font size",
        ariaKeyShortcuts: "Control+Shift+- Meta+Shift+-",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize <= model.fontSizeMin,
        resolveIcon: () => "fontDecrease",
      },
    },
    {
      testId: "font-increase-button",
      metadataKey: "increaseFont",
      action: VIEWPORT_UI_COMMAND.INCREASE_FONT,
      metadata: {
        tooltip: "Font up",
        ariaLabel: "Increase terminal font size",
        ariaKeyShortcuts: "Control+Shift+= Meta+Shift+=",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize >= model.fontSizeMax,
        resolveIcon: () => "fontIncrease",
      },
    },
    {
      testId: "font-reset-button",
      metadataKey: "resetFont",
      action: VIEWPORT_UI_COMMAND.RESET_FONT,
      metadata: {
        tooltip: "Reset font",
        ariaLabel: "Reset terminal font size",
        ariaKeyShortcuts: "Control+Shift+0 Meta+Shift+0",
      },
      policy: {
        isDisabled: (model) =>
          !model.terminalReady || model.fontSize === model.defaultFontSize,
        resolveIcon: () => "fontReset",
      },
    },
    {
      testId: "fullscreen-button",
      metadataKey: "fullscreen",
      action: VIEWPORT_UI_COMMAND.TOGGLE_FULLSCREEN,
      metadata: {
        tooltip: "Fullscreen",
        ariaLabel: "Toggle fullscreen terminal",
      },
      policy: {
        isDisabled: (model) => !model.terminalReady,
        resolveIcon: (model) =>
          model.isFullscreen ? "fullscreenExit" : "fullscreenEnter",
        resolveLabel: (model, defaultLabel) =>
          model.isFullscreen ? "Exit fullscreen terminal" : defaultLabel,
        resolveTooltip: (model, defaultTooltip) =>
          model.isFullscreen ? "Exit fullscreen" : defaultTooltip,
      },
    },
  ] as const;

type FloatingControlRegistryEntry = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  action: FloatingControlCommand;
};

export const FLOATING_CONTROL_REGISTRY: readonly FloatingControlRegistryEntry[] =
  FLOATING_CONTROL_CATALOG.map((entry) => ({
    testId: entry.testId,
    metadataKey: entry.metadataKey,
    action: entry.action,
  })) as readonly FloatingControlRegistryEntry[];

export type FloatingControlDescriptors = Record<
  FloatingControlMetadataKey,
  FloatingControlMetadata
>;

export const FLOATING_CONTROL_DESCRIPTORS = Object.fromEntries(
  FLOATING_CONTROL_CATALOG.map((entry) => [entry.metadataKey, entry.metadata]),
) as FloatingControlDescriptors;

const FLOATING_CONTROL_METADATA_BY_ACTION = Object.fromEntries(
  FLOATING_CONTROL_CATALOG.map((entry) => [entry.action, entry.metadata]),
) as Record<FloatingControlCommand, FloatingControlMetadata>;

export function floatingControlMetadata(
  command: FloatingControlCommand,
): FloatingControlMetadata {
  return FLOATING_CONTROL_METADATA_BY_ACTION[command];
}

export const FLOATING_CONTROL_POLICY = Object.fromEntries(
  FLOATING_CONTROL_CATALOG.map((entry) => [entry.action, entry.policy]),
) as Record<FloatingControlCommand, FloatingControlPolicy>;
