const ONE_KIBIBYTE = 2 ** 10;
const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null) {
    return "-";
  }

  if (latencyMs < 1_000) {
    return `${latencyMs}ms`;
  }

  return `${(latencyMs / 1_000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  const normalized = Math.max(0, Math.floor(bytes));
  if (normalized < ONE_KIBIBYTE) {
    return `${normalized} B`;
  }

  let value = normalized;
  let unitIndex = 0;
  while (value >= ONE_KIBIBYTE && unitIndex < BYTE_UNITS.length - 1) {
    value /= ONE_KIBIBYTE;
    unitIndex += 1;
  }

  const precision = value < 10 ? 1 : 0;
  return `${value.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`;
}
