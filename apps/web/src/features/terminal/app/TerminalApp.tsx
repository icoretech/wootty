import { SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { createTerminalAppEnvironment } from "../bootstrap/terminal-environment";
import { AboutDialog } from "../components/AboutDialog";
import { FloatingControls } from "../components/FloatingControls";
import { SessionMenu } from "../components/SessionMenu";
import { StatusBar } from "../components/StatusBar";
import type { TerminalAppEnvironment } from "../environment/terminal-environment-contract";
import { useTerminalController } from "./controller/use-terminal-controller";

type TerminalAppProps = {
  environment?: TerminalAppEnvironment;
};

export type { TerminalAppEnvironment };

function TerminalAppShell({
  environment,
}: {
  environment: TerminalAppEnvironment;
}) {
  const {
    aboutSession,
    appViewportRef,
    dispatchFloatingControls,
    dispatchSessionMenu,
    dispatchStatusBar,
    floatingControlsModel,
    helpOpen,
    isFullscreen,
    sessionButtonRef,
    sessionMenuModel,
    sessionMenuOpen,
    sessionMenuRef,
    setHelpOpen,
    status,
    statusAnnouncement,
    statusBarModel,
    statusText,
    terminalElementRef,
    terminalReady,
  } = useTerminalController(environment);

  return (
    <main
      className={`shell ${isFullscreen ? "is-fullscreen" : ""}`}
      ref={appViewportRef}
    >
      <div className="shell__background" />

      <output
        className="sr-only"
        aria-live="polite"
        data-testid="status-announcement"
      >
        {statusAnnouncement}
      </output>

      <section className="workspace">
        <section
          className="terminal-wrap"
          ref={terminalElementRef}
          data-testid="terminal-wrap"
          aria-busy={!terminalReady}
          aria-label="Terminal viewport"
        >
          {status !== "connected" && (
            <div className="terminal-overlay" aria-live="polite">
              <div className="empty-state">
                <div className="empty-state__icon" aria-hidden="true">
                  <SquareTerminal size={20} />
                </div>
                <p>{terminalReady ? statusText : "Loading terminal engine"}</p>
                <small>
                  {terminalReady
                    ? status === "reconnecting"
                      ? "Connection lost. Restoring session and replaying output."
                      : "Preparing terminal transport."
                    : "Downloading terminal runtime and preparing renderer."}
                </small>
              </div>
            </div>
          )}
        </section>

        <FloatingControls
          model={floatingControlsModel}
          dispatch={dispatchFloatingControls}
        />

        {sessionMenuOpen && (
          <div className="session-popover-layer" ref={sessionMenuRef}>
            <SessionMenu
              model={sessionMenuModel}
              dispatch={dispatchSessionMenu}
            />
          </div>
        )}
      </section>

      <StatusBar
        model={statusBarModel}
        sessionButtonRef={sessionButtonRef}
        dispatch={dispatchStatusBar}
      />

      <AboutDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        session={aboutSession}
      />
    </main>
  );
}

function TerminalBootstrapState({ message }: { message: string }) {
  return (
    <main className="shell">
      <div className="shell__background" />
      <section className="workspace">
        <section
          className="terminal-wrap"
          data-testid="terminal-wrap"
          aria-busy="true"
          aria-label="Terminal viewport"
        >
          <div className="terminal-overlay" aria-live="polite">
            <div className="empty-state">
              <div className="empty-state__icon" aria-hidden="true">
                <SquareTerminal size={20} />
              </div>
              <p>{message}</p>
              <small>Preparing terminal access.</small>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

export function TerminalApp({ environment }: TerminalAppProps = {}) {
  const [defaultEnvironment] = useState(
    () => environment ?? createTerminalAppEnvironment(),
  );
  const effectiveEnvironment = environment ?? defaultEnvironment;
  const [authBootstrapState, setAuthBootstrapState] = useState<{
    status: "pending" | "ready" | "error";
    message: string;
    environment: TerminalAppEnvironment;
  }>(() => {
    return effectiveEnvironment.bootstrapAuth
      ? {
          status: "pending",
          message: "Establishing terminal authentication",
          environment: effectiveEnvironment,
        }
      : { status: "ready", message: "", environment: effectiveEnvironment };
  });

  useEffect(() => {
    let active = true;
    if (!effectiveEnvironment.bootstrapAuth) {
      return () => {
        active = false;
      };
    }

    void effectiveEnvironment
      .bootstrapAuth()
      .then(() => {
        if (!active) {
          return;
        }
        setAuthBootstrapState({
          status: "ready",
          message: "",
          environment: effectiveEnvironment,
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setAuthBootstrapState({
          status: "error",
          environment: effectiveEnvironment,
          message:
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Unable to establish terminal authentication",
        });
      });

    return () => {
      active = false;
    };
  }, [effectiveEnvironment]);

  if (
    effectiveEnvironment.bootstrapAuth &&
    authBootstrapState.environment !== effectiveEnvironment
  ) {
    return (
      <TerminalBootstrapState message="Establishing terminal authentication" />
    );
  }

  if (
    effectiveEnvironment.bootstrapAuth &&
    authBootstrapState.status !== "ready"
  ) {
    return <TerminalBootstrapState message={authBootstrapState.message} />;
  }

  return <TerminalAppShell environment={effectiveEnvironment} />;
}
