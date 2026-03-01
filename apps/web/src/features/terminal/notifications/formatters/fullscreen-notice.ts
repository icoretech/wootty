import { normalizeCauseToMessage } from "../../shared/sanitization/normalize-cause-message";
import type { FullscreenNotice } from "../contracts/runtime-notice";

export function toFullscreenNotice(details: FullscreenNotice): string {
  const cause = normalizeCauseToMessage(details.cause);
  return cause
    ? `Unable to toggle fullscreen mode (${cause}).`
    : "Unable to toggle fullscreen mode.";
}
