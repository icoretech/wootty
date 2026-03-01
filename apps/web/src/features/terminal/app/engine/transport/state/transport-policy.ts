export const TERMINAL_CLOSE_CODE = {
  MANUAL_RECONNECT: 4101,
  START_FRESH_SESSION: 4102,
  PONG_TIMEOUT: 4103,
} as const;

export const TERMINAL_HEARTBEAT_MS = {
  INTERVAL: 12_000,
  PONG_TIMEOUT: 12_000,
} as const;

export const TERMINAL_RECONNECT_POLICY = {
  MAX_ATTEMPTS: 8,
} as const;

const NON_RECOVERABLE_CLOSE_CODES = new Set<number>([
  1000, // normal closure
  1001, // endpoint shutting down
  1002, // protocol error
  1003, // unsupported data
  1007, // invalid payload data
  1008, // policy violation
  1009, // payload too large
  1010, // extension negotiation failed
  1011, // unexpected server error
]);

export function isRecoverableTransportClose(code: number): boolean {
  return !NON_RECOVERABLE_CLOSE_CODES.has(code);
}

export function reconnectDelayMs(attempt: number): number {
  return Math.min(5_000, Math.floor(300 * 1.8 ** attempt));
}
