import type { TerminalTransportFailureCode } from "../../../contracts/transport";
import type { TransportFailureReasonCode } from "../../../contracts/transport-failure-reason";
import {
  type FailureNoticeState,
  notifyWithFailureThrottle,
} from "../../../notifications/failure-notice-throttle";
import type { Scheduler } from "../../../platform/scheduler";

const SOCKET_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

export type SocketFailureSource = "error" | "close";

type TransportFailureReporterDeps = {
  scheduler: Scheduler;
  dispatchSocketFailure: (context: string) => void;
  onSocketFailure: (
    source: SocketFailureSource,
    code?: TerminalTransportFailureCode,
    reasonCode?: TransportFailureReasonCode,
    debugDetail?: string,
    cause?: unknown,
  ) => void;
};

function socketFailureContext(
  source: SocketFailureSource,
  reasonCode?: TransportFailureReasonCode,
  code?: TerminalTransportFailureCode,
  debugDetail?: string,
): string {
  const contextParts: string[] = [source];
  if (reasonCode) {
    contextParts.push(`reason=${reasonCode}`);
  }
  if (typeof code === "number" || typeof code === "string") {
    contextParts.push(`code=${code}`);
  }
  if (typeof debugDetail === "string" && debugDetail.length > 0) {
    contextParts.push(`detail=${debugDetail}`);
  }
  return contextParts.join(" ");
}

export class TransportFailureReporter {
  private readonly deps: TransportFailureReporterDeps;
  private socketFailureNotice: FailureNoticeState = null;

  constructor(deps: TransportFailureReporterDeps) {
    this.deps = deps;
  }

  reset(): void {
    this.socketFailureNotice = null;
  }

  report(
    source: SocketFailureSource,
    code?: TerminalTransportFailureCode,
    reasonCode?: TransportFailureReasonCode,
    debugDetail?: string,
    cause?: unknown,
  ): void {
    const context = socketFailureContext(source, reasonCode, code, debugDetail);
    this.deps.dispatchSocketFailure(context);

    const noticeKey = `${source}|${String(code ?? "")}|${reasonCode ?? ""}|${debugDetail ?? ""}`;
    const baseReason =
      debugDetail && debugDetail.length > 0
        ? debugDetail
        : (reasonCode ?? "transport failure");
    const nextNoticeState = notifyWithFailureThrottle({
      current: this.socketFailureNotice,
      key: noticeKey,
      nowMs: this.deps.scheduler.now(),
      cooldownMs: SOCKET_FAILURE_NOTICE_COOLDOWN_MS,
      baseMessage: baseReason,
      notify: (message) => {
        this.deps.onSocketFailure(source, code, reasonCode, message, cause);
      },
    });
    this.socketFailureNotice = nextNoticeState.next;
  }
}
