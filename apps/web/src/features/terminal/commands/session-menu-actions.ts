import type { AttachMode } from "../contracts/session/session";

export type SessionMenuAction =
  | { type: "startFresh" }
  | { type: "resumeLast" }
  | { type: "attach"; sessionId: string; mode: AttachMode };
