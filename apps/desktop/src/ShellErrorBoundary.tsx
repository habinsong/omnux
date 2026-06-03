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
        <main className="shell shell-fallback">
          <section className="panel">
            <p className="eyebrow">Omnux Desktop</p>
            <h1>데스크톱 셸 렌더링을 중단했다</h1>
            <p className="lede">
              React 화면 오류가 전체 앱 화이트 스크린으로 번지지 않도록 셸 경계에서 차단했다. 카드 단위 경계가 무너졌을 때만 이 화면이 뜬다.
            </p>
            <p className="error-text">{this.state.message}</p>
            {this.state.componentStack ? <pre className="error-stack">{this.state.componentStack}</pre> : null}
            <button className="secondary-button" type="button" onClick={this.retry}>
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
