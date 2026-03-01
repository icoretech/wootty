import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalController } from "../../../src/features/terminal/app/use-terminal-controller";
import type { TerminalAppEnvironment } from "../../../src/features/terminal/environment/terminal-environment-contract";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";
import type { SessionsFetchResult } from "../../../src/features/terminal/session/protocol/sessions-fetch-contract";

type HookProbeProps = {
  environment: TerminalAppEnvironment;
  children?: ReactNode;
};

function HookProbe({ environment }: HookProbeProps) {
  const controller = useTerminalController(environment);
  return (
    <output data-testid="announcement">{controller.statusAnnouncement}</output>
  );
}

function throwTransportCalled(): never {
  throw new Error("transport should not be created before runtime is ready");
}

function throwRuntimeCalled(): Promise<never> {
  return Promise.reject(
    new Error("runtime should not load without terminal root"),
  );
}

const fetchSessionsStub = vi.fn(
  async (_sessionsHttpUrl: string): Promise<SessionsFetchResult> => {
    return {
      ok: true,
      payload: [],
    };
  },
);

function createStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function createEnvironmentStub(): TerminalAppEnvironment {
  const storage = createStorageStub();
  return {
    platform: {
      resolveBackendEndpoints: () => ({
        ok: true,
        endpoints: {
          sessionsHttpUrl: "/api/sessions",
          terminalWsUrl: "ws://127.0.0.1/api/terminal",
        },
      }),
      fetchSessionsPayload: fetchSessionsStub,
      documentRef: document,
      windowRef: window,
      scheduler: browserScheduler,
    },
    domain: {
      createTransport: throwTransportCalled,
      loadRuntime: throwRuntimeCalled,
      getLocalStorage: () => ({ storage, error: null }),
      getSessionStorage: () => ({ storage, error: null }),
    },
  };
}

describe("useTerminalController", () => {
  it("exposes a loading announcement before runtime initialization", () => {
    render(<HookProbe environment={createEnvironmentStub()} />);
    expect(screen.getByTestId("announcement").textContent).toBe(
      "Loading terminal runtime.",
    );
  });
});
