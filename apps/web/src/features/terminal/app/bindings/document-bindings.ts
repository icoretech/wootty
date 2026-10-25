import { type RefObject, useEffect } from "react";
import type { ConnectionStatus } from "../../contracts/connection";
import type { AttachMode } from "../../contracts/session/session";
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

    const menuElement = sessionMenuRef.current;
    const previousFocus = documentRef.activeElement;
    menuElement
      ?.querySelector<HTMLInputElement>("input[type='search']")
      ?.focus();

    return () => {
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        (documentRef.activeElement === documentRef.body ||
          menuElement?.contains(documentRef.activeElement))
      ) {
        previousFocus.focus();
      }
    };
  }, [documentRef, sessionMenuOpen, sessionMenuRef]);

  useEffect(() => {
    if (!sessionMenuOpen || !documentRef) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
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
        event.preventDefault();
        closeSessionMenu();
      }
    };

    documentRef.addEventListener("pointerdown", onPointerDown);
    documentRef.addEventListener("keydown", onKeyDown);
    return () => {
      documentRef.removeEventListener("pointerdown", onPointerDown);
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

function updateDocumentTitle(document: Document, title: string): void {
  document.title = title;
}

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

    updateDocumentTitle(
      documentRef,
      buildDocumentTitle({ attachMode, sessionId, status }),
    );
  }, [attachMode, documentRef, sessionId, status]);
}
