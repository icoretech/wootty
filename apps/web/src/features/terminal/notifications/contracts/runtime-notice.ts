export type FullscreenNotice = {
  context: "fullscreen";
  cause?: unknown;
};

export type RuntimeNotice = {
  context: "runtime";
  reason?: string;
  cause?: unknown;
};
