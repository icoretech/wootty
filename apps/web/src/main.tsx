import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TerminalBootstrapInvariantError } from "./features/terminal/shared/errors/terminal-bootstrap-invariant";

import "./styles.css";

function bootstrapFailureMessage(error: unknown): string {
  if (error instanceof TerminalBootstrapInvariantError) {
    return `Terminal bootstrap invariant failed: ${error.message}`;
  }
  return "Unable to start terminal application.";
}

async function mountApp(rootElement: HTMLElement): Promise<void> {
  const root = createRoot(rootElement);
  try {
    const { default: App } = await import("./App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    root.render(
      <main className="shell shell--bootstrap-failure">
        <section role="alert" data-testid="bootstrap-failure">
          {bootstrapFailureMessage(error)}
        </section>
      </main>,
    );
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}
void mountApp(rootElement);
