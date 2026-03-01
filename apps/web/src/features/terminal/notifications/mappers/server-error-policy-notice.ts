import type { ServerErrorNoticePayload } from "../../protocol/policies/server-error-policy";
import type { ServerNotice } from "../contracts/server-notice";

export function toServerPolicyNotice(
  payload: ServerErrorNoticePayload,
): ServerNotice {
  return {
    context: "server",
    ...payload,
  };
}
