import type { ServerErrorNoticePayload } from "../../protocol/policies/server-error-policy";
import type { ServerNotice } from "../notice-contract";

export function toServerPolicyNotice(
  payload: ServerErrorNoticePayload,
): ServerNotice {
  return {
    context: "server",
    ...payload,
  };
}
