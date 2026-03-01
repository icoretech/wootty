import type { FloatingControlDescriptors } from "../commands/floating-controls/catalog";

export type FloatingControlsModel = {
  controlsOpen: boolean;
  terminalReady: boolean;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  defaultFontSize: number;
  isFullscreen: boolean;
  metadata: FloatingControlDescriptors;
};
