import { SquareTerminal } from "lucide-react";
import { useRef } from "react";
import { createTerminalAppEnvironment } from "../bootstrap/terminal-environment";
import { FloatingControls } from "../components/FloatingControls";
import { SessionMenu } from "../components/SessionMenu";
import { StatusBar } from "../components/StatusBar";
import type { TerminalAppEnvironment } from "../environment/terminal-environment-contract";
import { useTerminalController } from "./use-terminal-controller";

type TerminalAppProps = {
  environment?: TerminalAppEnvironment;
};

export type { TerminalAppEnvironment };

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
  const controller = useTerminalController(effectiveEnvironment);

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
    </main>
  );
}
