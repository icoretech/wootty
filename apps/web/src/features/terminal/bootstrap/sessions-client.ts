import type { SessionsFetchResult } from "../contracts/session/sessions-fetch";
import { TERMINAL_AUTH_POLICY } from "./auth-policy";
import type { AuthTokenProvider } from "./auth-token-provider";

function createSessionFetchHeaders(authToken?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const normalized = authToken?.trim();
  if (TERMINAL_AUTH_POLICY.sessionsHttp === "bearer_header" && normalized) {
    headers.Authorization = `Bearer ${normalized}`;
  }
  return headers;
}

function fetchSessionsFromEndpoint(
  sessionsHttpUrl: string,
  authToken?: string,
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
        return {
          ok: true as const,
          payload: parsed as Record<string, unknown>,
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
    headers: createSessionFetchHeaders(authToken),
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

export function createBrowserSessionsClient(
  authTokenProvider: AuthTokenProvider,
): (
  sessionsHttpUrl: string,
  options?: {
    signal?: AbortSignal;
  },
) => Promise<SessionsFetchResult> {
  return (sessionsHttpUrl, options) => {
    const tokenResolution = authTokenProvider();
    if (tokenResolution.issue) {
      return Promise.resolve({
        ok: false,
        failure: {
          source: "fetch",
          reason: "bootstrap_error",
          issue: tokenResolution.issue,
        },
      });
    }
    return fetchSessionsFromEndpoint(
      sessionsHttpUrl,
      tokenResolution.token,
      options,
    );
  };
}
