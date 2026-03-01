import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TerminalDomainEnvironment } from "../../environment/terminal-environment-contract";
import { toStorageFailureNoticeDetails } from "../../notifications/mappers/storage-failure-notice";
import type { NoticePublisher } from "../../notifications/notice-contract";
import { toUserNotice } from "../../notifications/user-notice";
import { useSessionOrchestrator } from "../../session/application/session-orchestrator";
import type { StorageAccessFailure } from "../../session/persistence/session-storage";
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

function useControllerUiState(
  getLocalStorage: () => Storage | null,
  onStorageFailure?: (failure: StorageAccessFailure) => void,
): ControllerUiState {
  const initialFontSize = useMemo(() => {
    const result = readInitialFontSizeResult(getLocalStorage());
    if (result.error && onStorageFailure) {
      onStorageFailure(result.error);
    }
    return result.fontSize;
  }, [getLocalStorage, onStorageFailure]);
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
      const storage = getLocalStorage();
      const writeResult = writeFontSizePreferenceResult(storage, normalized);
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
  publishNotice: NoticePublisher,
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
    publishNotice({
      context: "bootstrap",
      reason: "backend_resolution_failed",
      details: backendResolution.issue.details,
      code: backendResolution.issue.code,
    });
  }, [backendResolution, publishNotice]);
}

type TerminalSessionDomain = {
  uiState: ControllerUiState;
  sessionState: ReturnType<typeof useSessionOrchestrator>["state"];
  sessionActions: ReturnType<typeof useSessionOrchestrator>["actions"];
  publishNotice: NoticePublisher;
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
  const publishNotice = sessionActions.publishNotice;

  const reportStorageFailure = useCallback(
    (failure: StorageAccessFailure) => {
      publishNotice(toStorageFailureNoticeDetails(failure));
    },
    [publishNotice],
  );
  const uiState = useControllerUiState(
    environment.getLocalStorage,
    reportStorageFailure,
  );

  useBackendResolutionNotice(platform.backendResolution, publishNotice);

  return {
    uiState,
    sessionState,
    sessionActions,
    publishNotice,
    wsUrl: platform.backendResolution.ok
      ? platform.backendResolution.endpoints.terminalWsUrl
      : null,
  };
}
