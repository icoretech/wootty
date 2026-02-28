export const TERMINAL_CLOSE_CODE = {
  MANUAL_RECONNECT: 4101,
  START_FRESH_SESSION: 4102,
  PONG_TIMEOUT: 4103,
} as const;

export const TERMINAL_HEARTBEAT_MS = {
  INTERVAL: 12_000,
  PONG_TIMEOUT: 12_000,
} as const;

export function reconnectDelayMs(attempt: number): number {
  return Math.min(5_000, Math.floor(300 * 1.8 ** attempt));
}
