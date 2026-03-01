import type { TerminalServerErrorCode } from "../server-error-codes";

type ServerErrorStatusFlag =
  | "session_not_found"
  | "attach_forbidden"
  | "protocol_incompatible";

export type ServerErrorNoticePayload =
  | { reason: "session_not_found" }
  | { reason: "attach_forbidden" }
  | { reason: "incompatible_version" }
  | { reason: "attach_required" }
  | { reason: "read_only_forbidden" }
  | { reason: "session_not_writable" }
  | { reason: "session_not_resizable" }
  | { reason: "missing_code" }
  | { reason: "raw_code"; code: string };

type ServerErrorPolicyOutcome = {
  notice: ServerErrorNoticePayload;
  statusFlag?: ServerErrorStatusFlag;
  nextAttachMode?: "watch";
  clearMissingSession?: boolean;
  refreshSessions?: boolean;
};

export function resolveServerErrorPolicy(args: {
  code?: TerminalServerErrorCode;
  rawCode?: string;
}): ServerErrorPolicyOutcome {
  if (args.code === "session_not_found") {
    return {
      notice: { reason: "session_not_found" },
      statusFlag: "session_not_found",
      clearMissingSession: true,
      refreshSessions: true,
    };
  }

  if (args.code === "attach_forbidden") {
    return {
      notice: { reason: "attach_forbidden" },
      statusFlag: "attach_forbidden",
      nextAttachMode: "watch",
    };
  }

  if (args.code === "incompatible_version") {
    return {
      notice: { reason: "incompatible_version" },
      statusFlag: "protocol_incompatible",
    };
  }

  if (args.code === "attach_required") {
    return {
      notice: { reason: "attach_required" },
    };
  }

  if (args.code === "read_only_forbidden") {
    return {
      notice: { reason: "read_only_forbidden" },
    };
  }

  if (args.code === "session_not_writable") {
    return {
      notice: { reason: "session_not_writable" },
    };
  }

  if (args.code === "session_not_resizable") {
    return {
      notice: { reason: "session_not_resizable" },
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
