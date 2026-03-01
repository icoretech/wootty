import type { FloatingControlDescriptors } from "../../view/floating-controls/descriptors";

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
