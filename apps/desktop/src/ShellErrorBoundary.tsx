import { Component, ErrorInfo, ReactNode } from "react";

type ShellErrorBoundaryProps = {
  children: ReactNode;
};

type ShellErrorBoundaryState = {
  message: string | null;
};

class ShellErrorBoundary extends Component<ShellErrorBoundaryProps, ShellErrorBoundaryState> {
  state: ShellErrorBoundaryState = {
    message: null
  };

  static getDerivedStateFromError(error: Error): ShellErrorBoundaryState {
    return {
      message: error.message
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[omnux-desktop-shell]", error, info.componentStack);
  }

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
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ShellErrorBoundary;
