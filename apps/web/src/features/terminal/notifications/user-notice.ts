import type { NoticeDetails } from "../contracts/notice";
import { toBootstrapNotice } from "./formatters/bootstrap-notice";
import { toFullscreenNotice } from "./formatters/fullscreen-notice";
import { toProtocolNotice } from "./formatters/protocol-notice";
import { toRuntimeNotice } from "./formatters/runtime-notice";
import { toServerNotice } from "./formatters/server-notice";
import { toSessionRefreshNotice } from "./formatters/session-refresh-notice";
import { toStorageNotice } from "./formatters/storage-notice";
import { toTransportNotice } from "./formatters/transport-notice";

type NoticeFormatterRegistry = {
  [Context in NoticeDetails["context"]]: (
    details: Extract<NoticeDetails, { context: Context }>,
  ) => string;
};

const NOTICE_FORMATTERS: NoticeFormatterRegistry = {
  sessions_refresh: toSessionRefreshNotice,
  fullscreen: toFullscreenNotice,
  runtime: toRuntimeNotice,
  protocol: toProtocolNotice,
  transport: toTransportNotice,
  server: toServerNotice,
  bootstrap: toBootstrapNotice,
  storage: toStorageNotice,
};

export const NOTICE_CONTEXTS = Object.freeze(
  Object.keys(NOTICE_FORMATTERS) as NoticeDetails["context"][],
);

function formatNoticeByContext<Context extends NoticeDetails["context"]>(
  details: Extract<NoticeDetails, { context: Context }>,
): string {
  return NOTICE_FORMATTERS[details.context](details);
}

export function toUserNotice(details: NoticeDetails): string {
  return formatNoticeByContext(details);
}
