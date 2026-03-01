const SESSION_REFRESH_INTERVAL_MS = 4_000;
const SESSION_REFRESH_MAX_BACKOFF_MS = 32_000;
export const SESSION_REFRESH_FAILURE_LIMIT = 6;
export const SESSION_REFRESH_CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

export function nextSessionRefreshDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return SESSION_REFRESH_INTERVAL_MS;
  }
  return Math.min(
    SESSION_REFRESH_MAX_BACKOFF_MS,
    SESSION_REFRESH_INTERVAL_MS * 2 ** Math.min(consecutiveFailures - 1, 3),
  );
}
