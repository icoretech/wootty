import { useCallback, useEffect, useRef, useState } from "react";
import type { Scheduler, SchedulerTimerHandle } from "../../platform/scheduler";
import {
  type FailureNoticeState,
  notifyWithFailureThrottle,
} from "../../shared/reliability/failure-notice-throttle";

type UseSessionNoticeChannelArgs = {
  scheduler: Scheduler;
};

type PublishThrottledSessionNoticeArgs = {
  stateRef: { current: FailureNoticeState };
  failureKey: string;
  message: string;
  cooldownMs: number;
};

type SessionNoticeChannel = {
  sessionNotice: string;
  publishSessionNotice: (message: string) => void;
  clearSessionNotice: () => void;
  publishThrottledSessionNotice: (
    args: PublishThrottledSessionNoticeArgs,
  ) => void;
};

export function useSessionNoticeChannel({
  scheduler,
}: UseSessionNoticeChannelArgs): SessionNoticeChannel {
  const sessionNoticeTimerRef = useRef<SchedulerTimerHandle | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string>("");

  const clearSessionNotice = useCallback(() => {
    if (sessionNoticeTimerRef.current !== null) {
      scheduler.clearTimeout(sessionNoticeTimerRef.current);
      sessionNoticeTimerRef.current = null;
    }
    setSessionNotice("");
  }, [scheduler]);

  const publishSessionNotice = useCallback(
    (message: string) => {
      setSessionNotice(message);
      if (sessionNoticeTimerRef.current !== null) {
        scheduler.clearTimeout(sessionNoticeTimerRef.current);
      }
      sessionNoticeTimerRef.current = scheduler.setTimeout(() => {
        setSessionNotice("");
        sessionNoticeTimerRef.current = null;
      }, 4_000);
    },
    [scheduler],
  );

  const publishThrottledSessionNotice = useCallback(
    ({
      stateRef,
      failureKey,
      message,
      cooldownMs,
    }: PublishThrottledSessionNoticeArgs) => {
      const nextNoticeState = notifyWithFailureThrottle({
        current: stateRef.current,
        key: failureKey,
        nowMs: scheduler.now(),
        cooldownMs,
        baseMessage: message,
        notify: publishSessionNotice,
      });
      stateRef.current = nextNoticeState.next;
    },
    [publishSessionNotice, scheduler],
  );

  useEffect(() => {
    return () => {
      if (sessionNoticeTimerRef.current !== null) {
        scheduler.clearTimeout(sessionNoticeTimerRef.current);
        sessionNoticeTimerRef.current = null;
      }
    };
  }, [scheduler]);

  return {
    sessionNotice,
    publishSessionNotice,
    clearSessionNotice,
    publishThrottledSessionNotice,
  };
}
