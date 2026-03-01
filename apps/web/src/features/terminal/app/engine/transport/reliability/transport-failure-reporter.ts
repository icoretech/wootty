import type { Scheduler } from "../../../../platform/scheduler";
import {
  type FailureNoticeState,
  notifyWithFailureThrottle,
} from "../../../../shared/reliability/failure-notice-throttle";
import type {
  TransportFailure,
  TransportFailureSink,
} from "../contracts/transport-failure-contract";

const SOCKET_FAILURE_NOTICE_COOLDOWN_MS = 15_000;

type TransportFailureReporterDeps = {
  scheduler: Scheduler;
  dispatchSocketFailure: (context: string) => void;
  onSocketFailure: TransportFailureSink;
};

function socketFailureContext(failure: TransportFailure): string {
  const contextParts: string[] = [failure.source];
  if (failure.reasonCode) {
    contextParts.push(`reason=${failure.reasonCode}`);
  }
  if (typeof failure.code === "number" || typeof failure.code === "string") {
    contextParts.push(`code=${failure.code}`);
  }
  if (
    typeof failure.technicalDetail === "string" &&
    failure.technicalDetail.length > 0
  ) {
    contextParts.push(`detail=${failure.technicalDetail}`);
  }
  return contextParts.join(" ");
}

function stableFailureCode(code: TransportFailure["code"]): string {
  if (typeof code === "number") {
    return String(code);
  }
  if (typeof code === "string") {
    return code.trim().toLowerCase().slice(0, 64);
  }
  return "";
}

export class TransportFailureReporter {
  private readonly deps: TransportFailureReporterDeps;
  private socketFailureNotice: FailureNoticeState = null;
  private onSocketFailure: TransportFailureSink;

  constructor(deps: TransportFailureReporterDeps) {
    this.deps = deps;
    this.onSocketFailure = deps.onSocketFailure;
  }

  reset(): void {
    this.socketFailureNotice = null;
  }

  setOnSocketFailure(next: TransportFailureSink): void {
    this.onSocketFailure = next;
  }

  report(failure: Omit<TransportFailure, "noticeMessage">): void {
    const context = socketFailureContext(failure);
    this.deps.dispatchSocketFailure(context);

    const noticeKey = [
      failure.source,
      failure.reasonCode ?? "socket_failure",
      stableFailureCode(failure.code),
    ].join("|");
    const baseReason =
      failure.technicalDetail && failure.technicalDetail.length > 0
        ? failure.technicalDetail
        : (failure.reasonCode ?? "transport failure");
    const nextNoticeState = notifyWithFailureThrottle({
      current: this.socketFailureNotice,
      key: noticeKey,
      nowMs: this.deps.scheduler.now(),
      cooldownMs: SOCKET_FAILURE_NOTICE_COOLDOWN_MS,
      baseMessage: baseReason,
      notify: (message) => {
        this.onSocketFailure({
          ...failure,
          noticeMessage: message,
        });
      },
    });
    this.socketFailureNotice = nextNoticeState.next;
  }
}
