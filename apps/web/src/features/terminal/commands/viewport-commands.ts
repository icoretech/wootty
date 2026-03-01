export const VIEWPORT_UI_COMMAND = {
  DECREASE_FONT: "decreaseFont",
  INCREASE_FONT: "increaseFont",
  RESET_FONT: "resetFont",
  TOGGLE_FULLSCREEN: "toggleFullscreen",
  TOGGLE_CONTROLS: "toggleControls",
} as const;

export type ViewportUiCommand =
  (typeof VIEWPORT_UI_COMMAND)[keyof typeof VIEWPORT_UI_COMMAND];
