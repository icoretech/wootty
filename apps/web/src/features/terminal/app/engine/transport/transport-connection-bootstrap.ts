import { redactTokenInUrlForNotice } from "../../../bootstrap/url/redact-token-in-url";
import type { TerminalTransport } from "../../../contracts/transport/transport";
import { validateWebsocketEndpoint } from "../../../validation/websocket-endpoint";

export type TransportBootstrapFailureReasonCode =
  | "endpoint_unavailable"
  | "endpoint_invalid_format"
  | "endpoint_unsupported_protocol"
  | "bootstrap_failed";

export type TransportBootstrapResult =
  | { ok: true; socket: TerminalTransport }
  | {
      ok: false;
      reasonCode: TransportBootstrapFailureReasonCode;
      debugDetail: string;
      cause?: unknown;
    };

type TransportConnectionBootstrapDeps = {
  createTransport: (url: string) => TerminalTransport;
  getWsUrl: () => string | null;
};

export class TransportConnectionBootstrap {
  private readonly deps: TransportConnectionBootstrapDeps;

  constructor(deps: TransportConnectionBootstrapDeps) {
    this.deps = deps;
  }

  createSocket(): TransportBootstrapResult {
    const endpoint = this.deps.getWsUrl();
    const validation = validateWebsocketEndpoint(endpoint);
    if (!validation.ok) {
      return this.endpointFailure(
        endpoint,
        validation.reason,
        validation.protocol,
      );
    }

    try {
      return {
        ok: true,
        socket: this.deps.createTransport(validation.endpoint),
      };
    } catch (error) {
      const reason =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "transport bootstrap failed";
      return {
        ok: false,
        reasonCode: "bootstrap_failed",
        debugDetail: reason,
        cause: error,
      };
    }
  }

  private endpointFailure(
    endpoint: string | null,
    reason: "unavailable" | "unsupported_protocol" | "invalid_format",
    protocol?: string,
  ): TransportBootstrapResult {
    if (reason === "unavailable") {
      return {
        ok: false,
        reasonCode: "endpoint_unavailable",
        debugDetail: "websocket endpoint unavailable",
      };
    }
    if (reason === "unsupported_protocol") {
      return {
        ok: false,
        reasonCode: "endpoint_unsupported_protocol",
        debugDetail: `invalid websocket endpoint protocol '${protocol}'`,
      };
    }
    return {
      ok: false,
      reasonCode: "endpoint_invalid_format",
      debugDetail:
        typeof endpoint === "string" && endpoint.length > 0
          ? `invalid websocket endpoint '${redactTokenInUrlForNotice(endpoint)}'`
          : "invalid websocket endpoint format",
    };
  }
}
