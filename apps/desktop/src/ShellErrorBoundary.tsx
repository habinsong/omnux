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
          <section className="w-full max-w-lg space-y-4 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Omnux Desktop</p>
            <h1 className="text-xl font-semibold tracking-tight">데스크톱 셸 렌더링을 중단했다</h1>
            <p className="text-sm text-muted-foreground">
              React 화면 오류가 전체 앱 화이트 스크린으로 번지지 않도록 셸 경계에서 차단했다. 카드 단위 경계가 무너졌을 때만 이 화면이 뜬다.
            </p>
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{this.state.message}</p>
            {this.state.componentStack ? (
              <pre className="error-stack max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground">{this.state.componentStack}</pre>
            ) : null}
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
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
