import { type RefObject, useEffect } from "react";
import type { Scheduler, SchedulerTimerHandle } from "../../platform/scheduler";

type FullscreenBindingArgs = {
  documentRef: Document | null;
  windowRef: Window | null;
  scheduler: Scheduler;
  fitAndSyncSize: () => void;
  setIsFullscreen: (value: boolean) => void;
};

export function useFullscreenBinding({
  documentRef,
  windowRef,
  scheduler,
  fitAndSyncSize,
  setIsFullscreen,
}: FullscreenBindingArgs): void {
  useEffect(() => {
    if (!documentRef) {
      return;
    }
    let fullscreenTimer: SchedulerTimerHandle | null = null;

    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(documentRef.fullscreenElement));
      if (!windowRef) {
        fitAndSyncSize();
        return;
      }
      if (fullscreenTimer !== null) {
        scheduler.clearTimeout(fullscreenTimer);
        fullscreenTimer = null;
      }
      fullscreenTimer = scheduler.setTimeout(() => {
        fitAndSyncSize();
        fullscreenTimer = null;
      }, 40);
    };

    documentRef.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      if (fullscreenTimer !== null) {
        scheduler.clearTimeout(fullscreenTimer);
        fullscreenTimer = null;
      }
      documentRef.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [documentRef, fitAndSyncSize, scheduler, setIsFullscreen, windowRef]);
}

type TerminalResizeBindingArgs = {
  documentRef: Document | null;
  windowRef: Window | null;
  terminalReady: boolean;
  terminalElementRef: RefObject<HTMLDivElement | null>;
  fitAndSyncSize: () => void;
};

export function useTerminalResizeBinding({
  documentRef,
  windowRef,
  terminalReady,
  terminalElementRef,
  fitAndSyncSize,
}: TerminalResizeBindingArgs): void {
  useEffect(() => {
    if (!terminalReady || !windowRef || !documentRef) {
      return;
    }

    const terminalRoot = terminalElementRef.current;
    if (!terminalRoot) {
      return;
    }

    let resizeFrame = 0;
    const ResizeObserverCtor = (
      windowRef as Window & { ResizeObserver?: typeof ResizeObserver }
    ).ResizeObserver;
    const observer = new (ResizeObserverCtor ?? ResizeObserver)(() => {
      windowRef.cancelAnimationFrame(resizeFrame);
      resizeFrame = windowRef.requestAnimationFrame(() => {
        fitAndSyncSize();
      });
    });
    observer.observe(terminalRoot);

    const mediaQuery = windowRef.matchMedia(
      `(resolution: ${windowRef.devicePixelRatio}dppx)`,
    );
    mediaQuery.addEventListener("change", fitAndSyncSize);

    const visibilityHandler = () => {
      if (documentRef.visibilityState === "visible") {
        fitAndSyncSize();
      }
    };

    documentRef.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      observer.disconnect();
      windowRef.cancelAnimationFrame(resizeFrame);
      mediaQuery.removeEventListener("change", fitAndSyncSize);
      documentRef.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [
    documentRef,
    fitAndSyncSize,
    terminalElementRef,
    terminalReady,
    windowRef,
  ]);
}
