import { Component, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  readonly children: ReactNode;
};

type AppErrorBoundaryState = {
  readonly failed: boolean;
};

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="shell shell--bootstrap-failure">
          <section className="empty-state" role="alert">
            <p>Unable to start terminal application.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload terminal
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
