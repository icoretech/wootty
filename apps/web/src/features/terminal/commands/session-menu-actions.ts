import type { AttachMode } from "../contracts/session";

export type SessionMenuAction =
  | { type: "startFresh" }
  | { type: "resumeLast" }
  | { type: "attach"; sessionId: string; mode: AttachMode };
