import type { TerminalBackendResolutionIssue } from "../../contracts/backend-resolution";
import { validateWebsocketEndpoint } from "../../contracts/websocket-endpoint-validation";
import { TERMINAL_BACKEND_ROUTE } from "../../protocol/generated-wire-contract";
import { redactTokenInUrlForNotice } from "./redact-token-in-url";

function toIssue(
  code: TerminalBackendResolutionIssue["code"],
  details: string,
): TerminalBackendResolutionIssue {
  return {
    code,
    details,
  };
}

type SocketUrlResolutionResult =
  | {
      ok: true;
      socketUrl: string;
    }
  | {
      ok: false;
      issue: TerminalBackendResolutionIssue;
    };

export function resolveSocketUrl(
  windowRef: Window | null,
  envUrl?: string,
): SocketUrlResolutionResult {
  const configured = envUrl?.trim();
  if (configured && configured.length > 0) {
    if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
      const validated = validateWebsocketEndpoint(configured);
      if (!validated.ok) {
        return {
          ok: false,
          issue: toIssue(
            validated.reason === "unsupported_protocol"
              ? "env_socket_url_unsupported_protocol"
              : "env_socket_url_invalid_format",
            validated.reason === "unsupported_protocol"
              ? `VITE_WOOTTY_WS_URL uses an unsupported protocol: ${redactTokenInUrlForNotice(configured)}`
              : `VITE_WOOTTY_WS_URL is not a valid URL: ${redactTokenInUrlForNotice(configured)}`,
          ),
        };
      }
      return {
        ok: true,
        socketUrl: validated.endpoint,
      };
    }
    if (configured.startsWith("http://") || configured.startsWith("https://")) {
      try {
        const parsedHttpUrl = new URL(configured);
        const protocol = parsedHttpUrl.protocol === "https:" ? "wss:" : "ws:";
        return {
          ok: true,
          socketUrl: `${protocol}//${parsedHttpUrl.host}${parsedHttpUrl.pathname}${parsedHttpUrl.search}`,
        };
      } catch {
        return {
          ok: false,
          issue: toIssue(
            "env_socket_url_invalid_format",
            `VITE_WOOTTY_WS_URL is not a valid URL: ${redactTokenInUrlForNotice(configured)}`,
          ),
        };
      }
    }
    if (configured.includes("://")) {
      return {
        ok: false,
        issue: toIssue(
          "env_socket_url_unsupported_protocol",
          `VITE_WOOTTY_WS_URL uses an unsupported protocol: ${redactTokenInUrlForNotice(configured)}`,
        ),
      };
    }
    if (windowRef) {
      const protocol =
        windowRef.location.protocol === "https:" ? "wss:" : "ws:";
      const pathname = configured.startsWith("/")
        ? configured
        : `/${configured}`;
      return {
        ok: true,
        socketUrl: `${protocol}//${windowRef.location.host}${pathname}`,
      };
    }
    return {
      ok: false,
      issue: toIssue(
        "env_socket_url_requires_window_host",
        "VITE_WOOTTY_WS_URL requires a browser host to resolve relative path values.",
      ),
    };
  }
  if (!windowRef) {
    return {
      ok: true,
      socketUrl: `ws://127.0.0.1${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
    };
  }
  const protocol = windowRef.location.protocol === "https:" ? "wss:" : "ws:";
  return {
    ok: true,
    socketUrl: `${protocol}//${windowRef.location.host}${TERMINAL_BACKEND_ROUTE.TERMINAL_WS}`,
  };
}
