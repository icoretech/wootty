export type FailureNoticeState = {
  key: string;
  count: number;
  lastNoticeAt: number;
} | null;

type RegisterFailureNoticeArgs = {
  current: FailureNoticeState;
  key: string;
  nowMs: number;
  cooldownMs: number;
};

type RegisterFailureNoticeResult = {
  next: FailureNoticeState;
  shouldNotify: boolean;
  count: number;
};

type NotifyWithFailureThrottleArgs = {
  current: FailureNoticeState;
  key: string;
  nowMs: number;
  cooldownMs: number;
  baseMessage: string;
  notify: (message: string) => void;
  repeatedMessage?: (baseMessage: string, count: number) => string;
};

type FailureNoticeNotifyResult = {
  next: FailureNoticeState;
  count: number;
};

export function registerFailureNotice({
  current,
  key,
  nowMs,
  cooldownMs,
}: RegisterFailureNoticeArgs): RegisterFailureNoticeResult {
  const repeatedFailure = current?.key === key;
  const count = repeatedFailure ? current.count + 1 : 1;
  const lastNoticeAt = repeatedFailure ? current.lastNoticeAt : 0;
  const shouldNotify = !(repeatedFailure && nowMs - lastNoticeAt < cooldownMs);
  return {
    next: {
      key,
      count,
      lastNoticeAt: shouldNotify ? nowMs : lastNoticeAt,
    },
    shouldNotify,
    count,
  };
}

function defaultRepeatedMessage(baseMessage: string, count: number): string {
  return `${baseMessage} (repeated ${count} times)`;
}

export function notifyWithFailureThrottle({
  current,
  key,
  nowMs,
  cooldownMs,
  baseMessage,
  notify,
  repeatedMessage = defaultRepeatedMessage,
}: NotifyWithFailureThrottleArgs): FailureNoticeNotifyResult {
  const notice = registerFailureNotice({
    current,
    key,
    nowMs,
    cooldownMs,
  });
  if (notice.shouldNotify) {
    notify(
      notice.count > 1
        ? repeatedMessage(baseMessage, notice.count)
        : baseMessage,
    );
  }
  return {
    next: notice.next,
    count: notice.count,
  };
}
