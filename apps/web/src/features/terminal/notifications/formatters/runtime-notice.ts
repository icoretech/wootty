import { normalizeCauseToMessage } from "../../shared/sanitization/normalize-cause-message";
import type { RuntimeNotice } from "../contracts/runtime-notice";

export function toRuntimeNotice(details: RuntimeNotice): string {
  if (details.reason && details.reason.length > 0) {
    return `Unable to start terminal runtime (${details.reason}).`;
  }
  const cause = normalizeCauseToMessage(details.cause);
  return cause
    ? `Unable to start terminal runtime (${cause}).`
    : "Unable to start terminal runtime.";
}
