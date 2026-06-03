import { Component, type ErrorInfo, type ReactNode } from "react";
import { ShellFault } from "../../ShellFault";
import { useUiLogStore } from "../ui-log/ui-log-store";
import type { DesktopPageId } from "./DesktopNavigation";

type PageBoundaryProps = {
  page: DesktopPageId;
  children: ReactNode;
};

type PageBoundaryState = {
  message: string | null;
  componentStack: string | null;
};

export class PageBoundary extends Component<PageBoundaryProps, PageBoundaryState> {
  state: PageBoundaryState = {
    message: null,
    componentStack: null
  };

  static getDerivedStateFromError(error: Error): PageBoundaryState {
    return {
      message: error.message,
      componentStack: null
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || null });
    useUiLogStore.getState().recordLog("error", `[page:${this.props.page}] ${error.message}`, {
      source: "navigation",
      componentStack: info.componentStack
    });
    console.error("[omnux-desktop-page]", this.props.page, error, info.componentStack);
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
        <section className="page-fallback">
          <ShellFault
            label={`${this.props.page} 화면 렌더 실패: ${this.state.message}`}
            stack={this.state.componentStack}
            onRetry={this.retry}
            retryLabel="화면 다시 렌더"
          />
        </section>
      );
    }

    return this.props.children;
  }
}
