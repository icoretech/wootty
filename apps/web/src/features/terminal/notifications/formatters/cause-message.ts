const MAX_CAUSE_MESSAGE_LENGTH = 180;

function redactCauseMessage(value: string): string {
  return value.replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
}

function truncateCauseMessage(value: string): string {
  if (value.length <= MAX_CAUSE_MESSAGE_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_CAUSE_MESSAGE_LENGTH - 3)}...`;
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return truncateCauseMessage(redactCauseMessage(trimmed));
}

export function normalizeCauseToMessage(cause: unknown): string | null {
  if (cause === null || cause === undefined) {
    return null;
  }
  if (typeof cause === "string") {
    return normalizeText(cause);
  }
  if (cause instanceof Error || cause instanceof DOMException) {
    return normalizeText(cause.message);
  }
  if (typeof cause === "number" || typeof cause === "boolean") {
    return String(cause);
  }
  if (typeof cause === "object") {
    try {
      return normalizeText(JSON.stringify(cause));
    } catch {
      return null;
    }
  }
  return null;
}
