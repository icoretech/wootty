import type { CommandManifestFloatingControlMetadataKey } from "../definitions/command-manifest";
import type { FloatingControlCommand } from "./actions";
import type { FloatingControlMetadata } from "./floating-control-metadata";

export type FloatingControlMetadataKey =
  CommandManifestFloatingControlMetadataKey;

export type FloatingControlIconToken =
  | "reconnect"
  | "clear"
  | "fontDecrease"
  | "fontIncrease"
  | "fontReset"
  | "fullscreenEnter"
  | "fullscreenExit";

export type FloatingControlPolicyState = {
  terminalReady: boolean;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  defaultFontSize: number;
  isFullscreen: boolean;
};

export type FloatingControlPolicy = {
  isDisabled: (model: FloatingControlPolicyState) => boolean;
  resolveIcon: (model: FloatingControlPolicyState) => FloatingControlIconToken;
  resolveLabel?: (
    model: FloatingControlPolicyState,
    defaultLabel: string,
  ) => string;
  resolveTooltip?: (
    model: FloatingControlPolicyState,
    defaultTooltip: string,
  ) => string;
};

export type FloatingControlDefinition = {
  testId: string;
  metadataKey: FloatingControlMetadataKey;
  metadata: FloatingControlMetadata;
  policy: FloatingControlPolicy;
};

export type FloatingControlCatalogEntry = FloatingControlDefinition & {
  action: FloatingControlCommand;
};

export type FloatingControlRegistryEntry = Pick<
  FloatingControlCatalogEntry,
  "testId" | "metadataKey" | "action"
>;
