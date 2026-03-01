import { createTerminalAppEnvironment } from "../../../src/features/terminal/bootstrap/terminal-environment";
import type { TerminalTransport } from "../../../src/features/terminal/contracts/transport";
import type { TerminalAppEnvironment } from "../../../src/features/terminal/environment/terminal-environment-contract";
import type { TerminalRuntime } from "../../../src/features/terminal/runtime/xterm-runtime-contract";

export interface TerminalRuntimeBoundary {
  loadRuntime: () => Promise<TerminalRuntime>;
  reset: () => void;
}

export interface TerminalTransportBoundary {
  createTransport: (url: string) => TerminalTransport;
  reset: () => void;
}

export function createTerminalEnvironment(
  transportBoundary: TerminalTransportBoundary,
  runtimeBoundary: TerminalRuntimeBoundary,
): TerminalAppEnvironment {
  const environment = createTerminalAppEnvironment();
  return {
    platform: environment.platform,
    domain: {
      ...environment.domain,
      createTransport: transportBoundary.createTransport,
      loadRuntime: runtimeBoundary.loadRuntime,
    },
  };
}
