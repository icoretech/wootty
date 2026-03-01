import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConnectionCoordinator } from "../../../../../src/features/terminal/app/engine/connection-coordinator";
import type { NoticeDetails } from "../../../../../src/features/terminal/notifications/notice-contract";
import { toUserNotice } from "../../../../../src/features/terminal/notifications/user-notice";
import { browserScheduler } from "../../../../../src/features/terminal/platform/scheduler";

function failIfCalled(name: string): never {
  throw new Error(`${name} should not be called before runtime is ready`);
}

describe("connection coordinator", () => {
  it("exposes a stable pre-runtime state without opening transport", () => {
    const createTransport = vi.fn(() => failIfCalled("createTransport"));
    const loadRuntime = vi.fn(async () => failIfCalled("loadRuntime"));
    const publishSessionNotice = vi.fn();
    const publishNotice = (details: NoticeDetails) => {
      publishSessionNotice(toUserNotice(details));
    };

    const { result } = renderHook(() => {
      return useConnectionCoordinator({
        createTransport,
        loadRuntime,
        wsUrl: "ws://127.0.0.1/api/terminal",
        documentRef: null,
        initialFontSize: 11,
        sessionId: null,
        attachMode: "control",
        hasActiveSession: false,
        transportEnabled: true,
        publishNotice,
        setSessionMode: vi.fn(),
        applyReadySession: vi.fn(),
        clearMissingSession: vi.fn(),
        refreshLiveSessions: async () => ({ ok: true }),
        scheduler: browserScheduler,
      });
    });

    expect(result.current.runtime.terminalReady).toBe(false);
    expect(result.current.transport.status).toBe("connecting");
    expect(result.current.transport.reconnectAttempt).toBe(0);
    expect(result.current.telemetry.outputBytes).toBe(0);
    expect(createTransport).not.toHaveBeenCalled();
    expect(loadRuntime).not.toHaveBeenCalled();
    expect(publishSessionNotice).not.toHaveBeenCalled();
  });
});
