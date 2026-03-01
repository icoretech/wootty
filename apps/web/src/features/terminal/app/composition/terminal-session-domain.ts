import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { StorageAccessFailure } from "../../contracts/storage-access";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import { toBackendResolutionNotice } from "../../notifications/mappers/backend-resolution-notice";
import type { SessionNoticePublisher } from "../../notifications/notice-contract";
import { toUserNotice } from "../../notifications/user-notice";
import { useSessionOrchestrator } from "../../session/application/session-orchestrator";
import {
  clampFontSize,
  readInitialFontSizeResult,
  writeFontSizePreferenceResult,
} from "../preferences/font-size-preferences";
import type { TerminalPlatformContext } from "./terminal-platform-composition";

export type ControllerUiState = {
  initialFontSize: number;
  fontSize: number;
  controlsOpen: boolean;
  isFullscreen: boolean;
  setControlsOpen: (value: boolean | ((previous: boolean) => boolean)) => void;
  setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  readFontSize: () => number;
  applyFontSize: (
    next: number,
    applyToRuntime: (size: number, onResized: () => void) => void,
    onResized: () => void,
  ) => void;
};

type InitialFontSizeState = {
  initialFontSize: number;
  bootstrapStorageFailures: StorageAccessFailure[];
};

function readInitialFontSizeState(
  getLocalStorage: TerminalDomainEnvironment["getLocalStorage"],
): InitialFontSizeState {
  const bootstrapStorageFailures: StorageAccessFailure[] = [];
  const access = getLocalStorage();
  if (access.error) {
    bootstrapStorageFailures.push(access.error);
  }
  const result = readInitialFontSizeResult(access.storage);
  if (result.error) {
    bootstrapStorageFailures.push(result.error);
  }
  return {
    initialFontSize: result.fontSize,
    bootstrapStorageFailures,
  };
}

function useControllerUiState(
  getLocalStorage: TerminalDomainEnvironment["getLocalStorage"],
  onStorageFailure?: (failure: StorageAccessFailure) => void,
): ControllerUiState {
  const { initialFontSize, bootstrapStorageFailures } =
    useMemo<InitialFontSizeState>(() => {
      return readInitialFontSizeState(getLocalStorage);
    }, [getLocalStorage]);

  useEffect(() => {
    if (!onStorageFailure) {
      return;
    }
    for (const failure of bootstrapStorageFailures) {
      onStorageFailure(failure);
    }
  }, [bootstrapStorageFailures, onStorageFailure]);

  const fontSizeRef = useRef(initialFontSize);
  const [fontSize, setFontSize] = useState<number>(initialFontSize);
  const [controlsOpen, setControlsOpen] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const applyFontSize = useCallback(
    (
      next: number,
      applyToRuntime: (size: number, onResized: () => void) => void,
      onResized: () => void,
    ) => {
      const normalized = clampFontSize(next);
      fontSizeRef.current = normalized;
      setFontSize(normalized);
      const access = getLocalStorage();
      if (access.error && onStorageFailure) {
        onStorageFailure(access.error);
      }
      const writeResult = writeFontSizePreferenceResult(
        access.storage,
        normalized,
      );
      if (writeResult.error && onStorageFailure) {
        onStorageFailure(writeResult.error);
      }
      applyToRuntime(normalized, onResized);
    },
    [getLocalStorage, onStorageFailure],
  );

  return {
    initialFontSize,
    fontSize,
    controlsOpen,
    isFullscreen,
    setControlsOpen,
    setIsFullscreen,
    readFontSize: () => fontSizeRef.current,
    applyFontSize,
  };
}

function useBackendResolutionNotice(
  backendResolution: TerminalPlatformContext["backendResolution"],
  publishNotice: SessionNoticePublisher,
): void {
  const lastBootstrapIssueRef = useRef<string | null>(null);

  useEffect(() => {
    if (backendResolution.ok) {
      lastBootstrapIssueRef.current = null;
      return;
    }
    const issueKey = `${backendResolution.issue.code}:${backendResolution.issue.details}`;
    if (lastBootstrapIssueRef.current === issueKey) {
      return;
    }
    lastBootstrapIssueRef.current = issueKey;
    publishNotice(toBackendResolutionNotice(backendResolution.issue));
  }, [backendResolution, publishNotice]);
}

export type TerminalSessionDomain = {
  uiState: ControllerUiState;
  sessionState: ReturnType<typeof useSessionOrchestrator>["state"];
  sessionActions: ReturnType<typeof useSessionOrchestrator>["actions"];
  wsUrl: string | null;
};

export function useTerminalSessionDomain({
  environment,
  platform,
}: {
  environment: TerminalDomainEnvironment;
  platform: TerminalPlatformContext;
}): TerminalSessionDomain {
  const session = useSessionOrchestrator({
    fetchSessions: platform.fetchSessions,
    scheduler: platform.scheduler,
    getLocalStorage: environment.getLocalStorage,
    getSessionStorage: environment.getSessionStorage,
    formatNotice: toUserNotice,
  });
  const sessionState = session.state;
  const sessionActions = session.actions;
  const uiState = useControllerUiState(
    environment.getLocalStorage,
    sessionActions.reportStorageFailure,
  );

  useBackendResolutionNotice(
    platform.backendResolution,
    sessionActions.publishSessionNoticeDetails,
  );

  return {
    uiState,
    sessionState,
    sessionActions,
    wsUrl: platform.backendResolution.ok
      ? platform.backendResolution.endpoints.terminalWsUrl
      : null,
  };
}
