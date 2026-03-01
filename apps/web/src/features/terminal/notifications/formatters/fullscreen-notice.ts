import type { FullscreenNotice } from "../notice-contract";
import { normalizeCauseToMessage } from "./cause-message";

export function toFullscreenNotice(details: FullscreenNotice): string {
  const cause = normalizeCauseToMessage(details.cause);
  return cause
    ? `Unable to toggle fullscreen mode (${cause}).`
    : "Unable to toggle fullscreen mode.";
}
