import type { BootstrapNotice } from "../contracts/bootstrap-notice";

export function toBootstrapNotice(details: BootstrapNotice): string {
  const codeSuffix = details.code ? ` [code=${details.code}]` : "";
  return `Terminal bootstrap configuration error${codeSuffix} (${details.details}).`;
}
