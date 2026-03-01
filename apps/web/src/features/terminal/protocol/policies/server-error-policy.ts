import type { TerminalServerErrorCode } from "../server-error-codes";

type ServerErrorStatusFlag = "session_not_found" | "protocol_incompatible";

type KnownServerErrorNoticePayload = { reason: TerminalServerErrorCode };
export type ServerErrorNoticePayload =
  | KnownServerErrorNoticePayload
  | { reason: "missing_code" }
  | { reason: "raw_code"; code: string };

type ServerErrorPolicyOutcome = {
  notice: ServerErrorNoticePayload;
  statusFlag?: ServerErrorStatusFlag;
  nextAttachMode?: "watch";
  clearMissingSession?: boolean;
  refreshSessions?: boolean;
};

type ServerErrorSideEffects = Omit<ServerErrorPolicyOutcome, "notice">;

const SERVER_ERROR_SIDE_EFFECTS: Partial<
  Record<TerminalServerErrorCode, ServerErrorSideEffects>
> = {
  session_not_found: {
    statusFlag: "session_not_found",
    clearMissingSession: true,
    refreshSessions: true,
  },
  attach_forbidden: {
    nextAttachMode: "watch",
  },
  incompatible_version: {
    statusFlag: "protocol_incompatible",
  },
};

export function resolveServerErrorPolicy(args: {
  code?: TerminalServerErrorCode;
  rawCode?: string;
}): ServerErrorPolicyOutcome {
  if (args.code) {
    return {
      notice: { reason: args.code },
      ...SERVER_ERROR_SIDE_EFFECTS[args.code],
    };
  }

  if (args.rawCode) {
    return {
      notice: {
        reason: "raw_code",
        code: args.rawCode,
      },
    };
  }

  return {
    notice: {
      reason: "missing_code",
    },
  };
}
