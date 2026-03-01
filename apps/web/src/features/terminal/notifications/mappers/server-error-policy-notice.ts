import type { ServerNotice } from "../../contracts/notice";
import type { ServerErrorNoticePayload } from "../../protocol/policies/server-error-policy";

export function toServerPolicyNotice(
  payload: ServerErrorNoticePayload,
): ServerNotice {
  return {
    context: "server",
    ...payload,
  };
}
