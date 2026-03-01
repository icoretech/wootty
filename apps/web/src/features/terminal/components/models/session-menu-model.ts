import type { AttachMode } from "../../contracts/session";

export type SessionMenuModel = {
  sessionMenuOpen: boolean;
  terminalReady: boolean;
  canResumeLast: boolean;
  sessionNotice: string;
  liveRows: Array<{
    id: string;
    mode: AttachMode;
    primaryText: string;
    secondaryText: string;
    actionLabel: string;
  }>;
  historyRows: Array<{ id: string; primaryText: string }>;
};
