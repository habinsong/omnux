import { Component, type ErrorInfo, type ReactNode } from "react";
import { useUiLogStore } from "./features/ui-log/ui-log-store";

type ShellErrorBoundaryProps = {
  children: ReactNode;
};

type ShellErrorBoundaryState = {
  message: string | null;
  componentStack: string | null;
};

class ShellErrorBoundary extends Component<ShellErrorBoundaryProps, ShellErrorBoundaryState> {
  state: ShellErrorBoundaryState = {
    message: null,
    componentStack: null
  };

  static getDerivedStateFromError(error: Error): ShellErrorBoundaryState {
    return {
      message: error.message,
      componentStack: null
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || null });
    useUiLogStore.getState().recordShellError(error.message, info.componentStack);
    console.error("[omnux-desktop-shell]", error, info.componentStack);
  }

  retry = () => {
    this.setState({
      message: null,
      componentStack: null
    });
  };

  render() {
    if (this.state.message) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <section className="w-full max-w-lg space-y-4 rounded-md border border-border bg-card p-6">
            <p className="text-xs font-medium text-primary">Omnux Desktop</p>
            <h1 className="text-xl font-semibold tracking-tight">화면을 그리지 못했습니다</h1>
            <p className="text-sm text-muted-foreground">
              화면이 깨져서 여기까지 막았습니다. 아래 내용을 보고 다시 시도해 보세요.
            </p>
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{this.state.message}</p>
            {this.state.componentStack ? (
              <pre className="error-stack max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">{this.state.componentStack}</pre>
            ) : null}
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90"
            >
              다시 시도
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ShellErrorBoundary;
