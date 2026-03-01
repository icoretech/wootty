import type { FloatingControlMetadata } from "../../commands/floating-control-metadata-contract";

export type FloatingControlsModel = {
  controlsOpen: boolean;
  terminalReady: boolean;
  fontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  defaultFontSize: number;
  isFullscreen: boolean;
  metadata: {
    reconnect: FloatingControlMetadata;
    clear: FloatingControlMetadata;
    decreaseFont: FloatingControlMetadata;
    increaseFont: FloatingControlMetadata;
    resetFont: FloatingControlMetadata;
    fullscreen: FloatingControlMetadata;
  };
};
