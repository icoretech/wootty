export const TRANSPORT_FAILURE_REASON_CODES = [
  "send_failed",
  "endpoint_unavailable",
  "endpoint_invalid_format",
  "endpoint_unsupported_protocol",
  "bootstrap_failed",
  "socket_failure",
] as const;

export type TransportFailureReasonCode =
  (typeof TRANSPORT_FAILURE_REASON_CODES)[number];
