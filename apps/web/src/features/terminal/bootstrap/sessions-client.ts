import type {
  SessionsFetchPayload,
  SessionsFetchResult,
} from "../contracts/session/sessions-fetch";
import { SESSIONS_ENVELOPE_FIELD } from "../protocol/generated-wire-contract";

function createSessionFetchHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  return headers;
}

function fetchSessionsFromEndpoint(
  sessionsHttpUrl: string,
  options?: {
    signal?: AbortSignal;
  },
): Promise<SessionsFetchResult> {
  const parseResponse = (response: Response): Promise<SessionsFetchResult> => {
    if (!response.ok) {
      return Promise.resolve({
        ok: false as const,
        failure: {
          source: "fetch" as const,
          reason: "http_error" as const,
          status: response.status,
        },
      });
    }

    return response.text().then((body) => {
      if (body.trim().length === 0) {
        return {
          ok: true as const,
          payload: { sessions: [] },
        };
      }

      try {
        const parsed = JSON.parse(body) as unknown;
        if (!parsed || typeof parsed !== "object") {
          return {
            ok: false as const,
            failure: {
              source: "fetch" as const,
              reason: "json_parse_error" as const,
              cause: new Error("sessions payload must be a JSON object"),
            },
          };
        }
        const payload = parsed as Record<string, unknown>;
        const sessions = payload[SESSIONS_ENVELOPE_FIELD];
        if (!Array.isArray(sessions)) {
          return {
            ok: false as const,
            failure: {
              source: "fetch" as const,
              reason: "json_parse_error" as const,
              cause: new Error(
                "sessions payload must include a sessions array",
              ),
            },
          };
        }
        return {
          ok: true as const,
          payload: {
            ...payload,
            [SESSIONS_ENVELOPE_FIELD]: sessions,
          } as SessionsFetchPayload,
        };
      } catch (error: unknown) {
        return {
          ok: false as const,
          failure: {
            source: "fetch" as const,
            reason: "json_parse_error" as const,
            cause: error,
          },
        };
      }
    });
  };

  return fetch(sessionsHttpUrl, {
    method: "GET",
    headers: createSessionFetchHeaders(),
    credentials: "include",
    cache: "no-store",
    signal: options?.signal,
  })
    .then(parseResponse)
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          ok: false as const,
          failure: {
            source: "lifecycle" as const,
            reason: "request_aborted" as const,
          },
        };
      }
      return {
        ok: false as const,
        failure: {
          source: "fetch" as const,
          reason: "network_error" as const,
          cause: error,
        },
      };
    });
}

export function createBrowserSessionsClient(): (
  sessionsHttpUrl: string,
  options?: {
    signal?: AbortSignal;
  },
) => Promise<SessionsFetchResult> {
  return (sessionsHttpUrl, options) => {
    return fetchSessionsFromEndpoint(sessionsHttpUrl, options);
  };
}
