import {
  defaultTerminalAppEnvironment,
  type TerminalAppEnvironment,
} from "../../../src/features/terminal/app/environment";
import type { TerminalTransport } from "../../../src/features/terminal/contracts/transport";
import type { TerminalRuntime } from "../../../src/features/terminal/runtime/xterm-runtime";

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
  return {
    ...defaultTerminalAppEnvironment,
    createTransport: transportBoundary.createTransport,
    loadRuntime: runtimeBoundary.loadRuntime,
  };
}
