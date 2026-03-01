import type { TransportFailureReasonCode } from "../../../contracts/transport/failure-reason";
import type { TerminalTransportFailureCode } from "../../../contracts/transport/transport";
import type { Scheduler } from "../../../platform/scheduler";
import {
  type FailureNoticeState,
  notifyWithFailureThrottle,
} from "../../../shared/reliability/failure-notice-throttle";

const SOCKET_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

export type SocketFailureSource = "error" | "close";

type TransportFailureReporterDeps = {
  scheduler: Scheduler;
  dispatchSocketFailure: (context: string) => void;
  onSocketFailure: (
    source: SocketFailureSource,
    code?: TerminalTransportFailureCode,
    reasonCode?: TransportFailureReasonCode,
    technicalDetail?: string,
    cause?: unknown,
    noticeMessage?: string,
  ) => void;
};

function socketFailureContext(
  source: SocketFailureSource,
  reasonCode?: TransportFailureReasonCode,
  code?: TerminalTransportFailureCode,
  technicalDetail?: string,
): string {
  const contextParts: string[] = [source];
  if (reasonCode) {
    contextParts.push(`reason=${reasonCode}`);
  }
  if (typeof code === "number" || typeof code === "string") {
    contextParts.push(`code=${code}`);
  }
  if (typeof technicalDetail === "string" && technicalDetail.length > 0) {
    contextParts.push(`detail=${technicalDetail}`);
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
    technicalDetail?: string,
    cause?: unknown,
  ): void {
    const context = socketFailureContext(
      source,
      reasonCode,
      code,
      technicalDetail,
    );
    this.deps.dispatchSocketFailure(context);

    const noticeKey = `${source}|${String(code ?? "")}|${reasonCode ?? ""}|${technicalDetail ?? ""}`;
    const baseReason =
      technicalDetail && technicalDetail.length > 0
        ? technicalDetail
        : (reasonCode ?? "transport failure");
    const nextNoticeState = notifyWithFailureThrottle({
      current: this.socketFailureNotice,
      key: noticeKey,
      nowMs: this.deps.scheduler.now(),
      cooldownMs: SOCKET_FAILURE_NOTICE_COOLDOWN_MS,
      baseMessage: baseReason,
      notify: (message) => {
        this.deps.onSocketFailure(
          source,
          code,
          reasonCode,
          technicalDetail,
          cause,
          message,
        );
      },
    });
    this.socketFailureNotice = nextNoticeState.next;
  }
}
