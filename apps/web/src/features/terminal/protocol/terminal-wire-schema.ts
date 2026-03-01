export {
  TERMINAL_CLIENT_MESSAGE_TYPE,
  TERMINAL_DIMENSION_LIMIT,
  TERMINAL_SERVER_MESSAGE_TYPE,
  TERMINAL_WIRE_CONTRACT_VERSION,
} from "./generated-wire-contract";

import type {
  TERMINAL_CLIENT_MESSAGE_TYPE,
  TERMINAL_WIRE_CONTRACT_VERSION,
} from "./generated-wire-contract";

export type TerminalClientMessage =
  | {
      type: typeof TERMINAL_CLIENT_MESSAGE_TYPE.ATTACH;
      version: typeof TERMINAL_WIRE_CONTRACT_VERSION;
      cols: number;
      rows: number;
      sessionId?: string;
      watch?: boolean;
    }
  | { type: typeof TERMINAL_CLIENT_MESSAGE_TYPE.INPUT; data: string }
  | {
      type: typeof TERMINAL_CLIENT_MESSAGE_TYPE.RESIZE;
      cols: number;
      rows: number;
    }
  | { type: typeof TERMINAL_CLIENT_MESSAGE_TYPE.PING };
