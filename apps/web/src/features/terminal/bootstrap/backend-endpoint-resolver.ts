import { TERMINAL_BACKEND_ROUTE } from "../protocol/generated-wire-contract";
import { TERMINAL_AUTH_POLICY } from "./auth-policy";
import type {
  TerminalBackendResolution,
  TerminalBackendResolutionIssue,
} from "./backend-resolution-contract";
import { redactTokenInUrlForNotice } from "./url/redact-token-in-url";
import { resolveSocketUrl } from "./url/socket-url-resolution";

function toIssue(
  code: TerminalBackendResolutionIssue["code"],
  details: string,
): TerminalBackendResolutionIssue {
  return {
    code,
    details,
  };
}

function resolveSessionUrlFromSocket(
  socketUrl: string,
): { ok: true; sessionsHttpUrl: string } | { ok: false; issue: string } {
  try {
    const parsedSocketUrl = new URL(socketUrl);
    if (
      parsedSocketUrl.protocol !== "ws:" &&
      parsedSocketUrl.protocol !== "wss:"
    ) {
      return {
        ok: false,
        issue: `unsupported websocket protocol (${parsedSocketUrl.protocol})`,
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
      issue: "invalid websocket URL format",
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
  if (socketPathname.endsWith("/terminal")) {
    return `${socketPathname.slice(0, -"/terminal".length)}/sessions`;
  }
  return TERMINAL_BACKEND_ROUTE.SESSIONS_HTTP;
}

function withAuthQueryParam(socketUrl: string, authToken?: string): string {
  if (TERMINAL_AUTH_POLICY.websocket !== "query_token") {
    return socketUrl;
  }
  const normalized = authToken?.trim();
  if (!normalized) {
    return socketUrl;
  }
  try {
    const parsed = new URL(socketUrl);
    parsed.searchParams.set("token", normalized);
    return parsed.toString();
  } catch {
    return socketUrl;
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

  const terminalWsUrl = withAuthQueryParam(
    socketResolution.socketUrl,
    authToken,
  );
  const sessionsResolution = resolveSessionUrlFromSocket(terminalWsUrl);
  if (!sessionsResolution.ok) {
    const issueCode =
      sessionsResolution.issue === "invalid websocket URL format"
        ? "socket_url_invalid_format"
        : "socket_url_unsupported_protocol";
    return {
      ok: false,
      issue: toIssue(
        issueCode,
        `Derived websocket endpoint is invalid: ${redactTokenInUrlForNotice(terminalWsUrl)} (${sessionsResolution.issue})`,
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
