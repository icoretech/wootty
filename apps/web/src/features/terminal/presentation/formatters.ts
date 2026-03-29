import type { ConnectionStatus } from "../contracts/connection";
import { assertNever } from "../lib/assert-never";

type LatencyTone = "neutral" | "good" | "warn" | "bad";

export function statusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "closed":
      return "Closed";
    case "error":
      return "Error";
    default:
      return assertNever(status);
  }
}

export function latencyTone(
  status: ConnectionStatus,
  latencyMs: number | null,
): LatencyTone {
  if (status !== "connected" || latencyMs === null) {
    return "neutral";
  }
  if (latencyMs <= 90) {
    return "good";
  }
  if (latencyMs <= 250) {
    return "warn";
  }
  return "bad";
}

export function ageLabel(timestampMs: number): string {
  if (timestampMs <= 0) {
    return "activity unknown";
  }

  const elapsed = Date.now() - timestampMs;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return "active recently";
  }

  const seconds = Math.floor(elapsed / 1_000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function shortSessionId(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function sessionDisplayName(name: string | null, id: string): string {
  return name ?? shortSessionId(id);
}
