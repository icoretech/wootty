import { SquareTerminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const controller = useTerminalController(environment);

  return (
    <main
      className={`shell ${controller.isFullscreen ? "is-fullscreen" : ""}`}
      ref={controller.appViewportRef}
    >
      <div className="shell__background" />

      <output
        className="sr-only"
        aria-live="polite"
        data-testid="status-announcement"
      >
        {controller.statusAnnouncement}
      </output>

      <section className="workspace">
        <section
          className="terminal-wrap"
          ref={controller.terminalElementRef}
          data-testid="terminal-wrap"
          aria-busy={!controller.terminalReady}
          aria-label="Terminal viewport"
        >
          {controller.status !== "connected" && (
            <div className="terminal-overlay" aria-live="polite">
              <div className="empty-state">
                <div className="empty-state__icon" aria-hidden="true">
                  <SquareTerminal size={20} />
                </div>
                <p>
                  {controller.terminalReady
                    ? controller.statusText
                    : "Loading terminal engine"}
                </p>
                <small>
                  {controller.terminalReady
                    ? controller.status === "reconnecting"
                      ? "Connection lost. Restoring session and replaying output."
                      : "Preparing terminal transport."
                    : "Downloading terminal runtime and preparing renderer."}
                </small>
              </div>
            </div>
          )}
        </section>

        <FloatingControls
          model={controller.floatingControlsModel}
          dispatch={controller.dispatchFloatingControls}
        />

        {controller.sessionMenuOpen && (
          <div
            className="session-popover-layer"
            ref={controller.sessionMenuRef}
          >
            <SessionMenu
              model={controller.sessionMenuModel}
              dispatch={controller.dispatchSessionMenu}
            />
          </div>
        )}
      </section>

      <StatusBar
        model={controller.statusBarModel}
        sessionButtonRef={controller.sessionButtonRef}
        dispatch={controller.dispatchStatusBar}
      />

      <AboutDialog
        open={controller.helpOpen}
        onClose={() => controller.setHelpOpen(false)}
        session={controller.aboutSession}
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
  const defaultEnvironmentRef = useRef<TerminalAppEnvironment | null>(null);
  const effectiveEnvironment = (() => {
    if (environment) {
      return environment;
    }
    if (!defaultEnvironmentRef.current) {
      defaultEnvironmentRef.current = createTerminalAppEnvironment();
    }
    return defaultEnvironmentRef.current;
  })();
  const [authBootstrapState, setAuthBootstrapState] = useState<{
    status: "pending" | "ready" | "error";
    message: string;
  }>(() => {
    return effectiveEnvironment.bootstrapAuth
      ? { status: "pending", message: "Establishing terminal authentication" }
      : { status: "ready", message: "" };
  });

  useEffect(() => {
    let active = true;
    if (!effectiveEnvironment.bootstrapAuth) {
      return () => {
        active = false;
      };
    }

    setAuthBootstrapState({
      status: "pending",
      message: "Establishing terminal authentication",
    });
    void effectiveEnvironment
      .bootstrapAuth()
      .then(() => {
        if (!active) {
          return;
        }
        setAuthBootstrapState({ status: "ready", message: "" });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setAuthBootstrapState({
          status: "error",
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

  if (authBootstrapState.status !== "ready") {
    return <TerminalBootstrapState message={authBootstrapState.message} />;
  }

  return <TerminalAppShell environment={effectiveEnvironment} />;
}
