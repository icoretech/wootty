import { type RefObject, useEffect } from "react";
import type { ConnectionStatus } from "../../contracts/connection";
import type { AttachMode } from "../../contracts/session";
import { buildDocumentTitle } from "../../presentation/document-title";

type SessionMenuDismissBindingArgs = {
  documentRef: Document | null;
  sessionMenuOpen: boolean;
  sessionMenuRef: RefObject<HTMLDivElement | null>;
  sessionButtonRef: RefObject<HTMLDivElement | null>;
  closeSessionMenu: () => void;
};

export function useSessionMenuDismissBinding({
  documentRef,
  sessionMenuOpen,
  sessionMenuRef,
  sessionButtonRef,
  closeSessionMenu,
}: SessionMenuDismissBindingArgs): void {
  useEffect(() => {
    if (!sessionMenuOpen || !documentRef) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sessionMenuRef.current?.contains(target)) {
        return;
      }
      if (sessionButtonRef.current?.contains(target)) {
        return;
      }
      closeSessionMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSessionMenu();
      }
    };

    documentRef.addEventListener("mousedown", onPointerDown);
    documentRef.addEventListener("keydown", onKeyDown);
    return () => {
      documentRef.removeEventListener("mousedown", onPointerDown);
      documentRef.removeEventListener("keydown", onKeyDown);
    };
  }, [
    closeSessionMenu,
    documentRef,
    sessionButtonRef,
    sessionMenuOpen,
    sessionMenuRef,
  ]);
}

type DocumentTitleBindingArgs = {
  documentRef: Document | null;
  attachMode: AttachMode;
  sessionId: string | null;
  status: ConnectionStatus;
};

export function useDocumentTitleBinding({
  documentRef,
  attachMode,
  sessionId,
  status,
}: DocumentTitleBindingArgs): void {
  useEffect(() => {
    if (!documentRef) {
      return;
    }

    documentRef.title = buildDocumentTitle({
      attachMode,
      sessionId,
      status,
    });
  }, [attachMode, documentRef, sessionId, status]);
}
