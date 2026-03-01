import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTerminalDomainController } from "../../../src/features/terminal/app/composition/terminal-domain-composition";
import type { TerminalPlatformContext } from "../../../src/features/terminal/app/composition/terminal-platform-composition";
import type { TerminalAppEnvironment } from "../../../src/features/terminal/environment/terminal-environment-contract";
import { browserScheduler } from "../../../src/features/terminal/platform/scheduler";

function createEnvironment(): TerminalAppEnvironment {
  const storage = new Map<string, string>();
  const asStorage = {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  } as Storage;
  return {
    platform: {
      resolveBackendEndpoints: () => ({
        ok: true,
        endpoints: {
          sessionsHttpUrl: "/api/sessions",
          terminalWsUrl: "ws://127.0.0.1/api/terminal",
        },
      }),
      fetchSessionsPayload: async () => ({
        ok: true,
        payload: {},
      }),
      documentRef: document,
      windowRef: window,
      scheduler: browserScheduler,
    },
    domain: {
      createTransport: () => {
        throw new Error("transport should be disabled when bootstrap fails");
      },
      loadRuntime: async () => {
        throw new Error(
          "runtime should not load without a mounted terminal ref",
        );
      },
      getLocalStorage: () => asStorage,
      getSessionStorage: () => asStorage,
    },
  };
}

function DomainProbe() {
  const environment = createEnvironment();
  const platform: TerminalPlatformContext = {
    windowRef: window,
    documentRef: document,
    scheduler: browserScheduler,
    backendResolution: {
      ok: false,
      issue: "invalid endpoint",
    },
    fetchSessions: vi.fn(async () => ({ ok: true, payload: {} })),
  };
  const appViewportRef = useRef<HTMLDivElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionButtonRef = useRef<HTMLDivElement | null>(null);

  const domain = useTerminalDomainController({
    environment: environment.domain,
    platform,
    appViewportRef,
    sessionMenuRef,
    sessionButtonRef,
  });

  return (
    <output data-testid="notice">{domain.sessionState.sessionNotice}</output>
  );
}

describe("terminal domain composition", () => {
  it("publishes bootstrap resolution failures through session notices", () => {
    render(<DomainProbe />);
    expect(screen.getByTestId("notice").textContent).toContain(
      "bootstrap configuration error",
    );
  });
});
