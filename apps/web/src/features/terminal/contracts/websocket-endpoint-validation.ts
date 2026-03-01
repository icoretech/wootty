type WebsocketEndpointValidation =
  | {
      ok: true;
      endpoint: string;
    }
  | {
      ok: false;
      reason: "unavailable" | "invalid_format" | "unsupported_protocol";
      protocol?: string;
    };

export function validateWebsocketEndpoint(
  endpoint: string | null | undefined,
): WebsocketEndpointValidation {
  const normalized = endpoint?.trim();
  if (!normalized) {
    return {
      ok: false,
      reason: "unavailable",
    };
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return {
        ok: true,
        endpoint: normalized,
      };
    }
    return {
      ok: false,
      reason: "unsupported_protocol",
      protocol: parsed.protocol,
    };
  } catch {
    return {
      ok: false,
      reason: "invalid_format",
    };
  }
}
