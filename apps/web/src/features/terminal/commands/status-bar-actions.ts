import type { VIEWPORT_UI_COMMAND } from "./viewport-commands";

export type StatusBarAction =
  | { type: (typeof VIEWPORT_UI_COMMAND)["TOGGLE_CONTROLS"] }
  | { type: "toggleSessionMenu" }
  | { type: "downloadTranscript" }
  | { type: "renameSession"; name: string };
