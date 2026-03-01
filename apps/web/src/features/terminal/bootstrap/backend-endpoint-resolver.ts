import type {
  TerminalBackendResolution,
  TerminalBackendResolutionIssue,
} from "../contracts/backend-resolution";
import { TERMINAL_BACKEND_ROUTE } from "../protocol/generated-wire-contract";
import { TERMINAL_AUTH_POLICY } from "./auth-policy";
import { createBackendResolutionIssue } from "./url/backend-resolution-issue";
import { redactTokenInUrlForNotice } from "./url/redact-token-in-url";
import { resolveSocketUrl } from "./url/socket-url-resolution";

function resolveSessionUrlFromSocket(
  socketUrl: string,
):
  | { ok: true; sessionsHttpUrl: string }
  | { ok: false; issue: TerminalBackendResolutionIssue } {
  try {
    const parsedSocketUrl = new URL(socketUrl);
    if (
      parsedSocketUrl.protocol !== "ws:" &&
      parsedSocketUrl.protocol !== "wss:"
    ) {
      return {
        ok: false,
        issue: createBackendResolutionIssue(
          "socket_url_unsupported_protocol",
          `unsupported websocket protocol (${parsedSocketUrl.protocol})`,
        ),
      };
    }
    const httpProtocol =
      parsedSocketUrl.protocol === "wss:" ? "https:" : "http:";
    const sessionsPath = deriveSessionsPath(parsedSocketUrl.pathname);
    return {
      ok: true,
      sessionsHttpUrl: `${httpProtocol}//${parsedSocketUrl.host}${sessionsPath}`,
    };
  } catch {
    return {
      ok: false,
      issue: createBackendResolutionIssue(
        "socket_url_invalid_format",
        "invalid websocket URL format",
      ),
    };
  }
}

function deriveSessionsPath(socketPathname: string): string {
  if (socketPathname.endsWith(TERMINAL_BACKEND_ROUTE.TERMINAL_WS)) {
    return `${socketPathname.slice(
      0,
      -TERMINAL_BACKEND_ROUTE.TERMINAL_WS.length,
    )}${TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP}`;
  }
  return TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP;
}

type SocketUrlMutationResult =
  | { ok: true; socketUrl: string }
  | { ok: false; issue: TerminalBackendResolutionIssue };

function withAuthQueryParam(
  socketUrl: string,
  authToken?: string,
): SocketUrlMutationResult {
  if (TERMINAL_AUTH_POLICY.websocket !== "query_token_legacy") {
    return {
      ok: true,
      socketUrl,
    };
  }
  const normalized = authToken?.trim();
  if (!normalized) {
    return {
      ok: true,
      socketUrl,
    };
  }
  try {
    const parsed = new URL(socketUrl);
    parsed.searchParams.set("token", normalized);
    return {
      ok: true,
      socketUrl: parsed.toString(),
    };
  } catch {
    return {
      ok: false,
      issue: createBackendResolutionIssue(
        "socket_url_invalid_format",
        `unable to apply auth token query param to websocket URL (${redactTokenInUrlForNotice(socketUrl)})`,
      ),
    };
  }
}

export function resolveTerminalBackendEndpoints(
  windowRef: Window | null,
  envSocketUrl?: string,
  authToken?: string,
): TerminalBackendResolution {
  const socketResolution = resolveSocketUrl(windowRef, envSocketUrl);
  if (!socketResolution.ok) {
    return {
      ok: false,
      issue: socketResolution.issue,
    };
  }

  const authSocketResolution = withAuthQueryParam(
    socketResolution.socketUrl,
    authToken,
  );
  if (!authSocketResolution.ok) {
    return {
      ok: false,
      issue: authSocketResolution.issue,
    };
  }
  const terminalWsUrl = authSocketResolution.socketUrl;
  const sessionsResolution = resolveSessionUrlFromSocket(terminalWsUrl);
  if (!sessionsResolution.ok) {
    return {
      ok: false,
      issue: createBackendResolutionIssue(
        sessionsResolution.issue.code,
        `Derived websocket endpoint is invalid: ${redactTokenInUrlForNotice(terminalWsUrl)} (${sessionsResolution.issue.details})`,
      ),
    };
  }

  return {
    ok: true,
    endpoints: {
      terminalWsUrl,
      sessionsHttpUrl: sessionsResolution.sessionsHttpUrl,
    },
  };
}
