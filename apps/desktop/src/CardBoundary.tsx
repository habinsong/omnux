import { Component, type ErrorInfo, type ReactNode } from "react";
import { type ShellCard } from "./shell-store";
import { ShellFault } from "./ShellFault";
import { Card, CardHeader, CardTitle, cn } from "./components/ui/primitives";

type CardBoundaryProps = {
  title: string;
  card: ShellCard;
  children: ReactNode;
  onError: (card: ShellCard, message: string, componentStack?: string | null) => void;
  hideTitle?: boolean;
};

type CardBoundaryState = {
  message: string | null;
  componentStack: string | null;
};

export class CardBoundary extends Component<CardBoundaryProps, CardBoundaryState> {
  state: CardBoundaryState = {
    message: null,
    componentStack: null
  };

  static getDerivedStateFromError(error: Error): CardBoundaryState {
    return {
      message: error.message,
      componentStack: null
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || null });
    this.props.onError(this.props.card, error.message, info.componentStack);
    console.error("[omnux-desktop-card]", this.props.card, error, info.componentStack);
  }

  retry = () => {
    this.setState({
      message: null,
      componentStack: null
    });
  };

  render() {
    const { title, card, children, hideTitle } = this.props;
    return (
      <Card className="flex h-full min-h-0 flex-col">
        {!hideTitle ? (
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
        ) : null}
        <div className={cn("flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4", hideTitle && "pt-4")}>
          {this.state.message ? (
            <ShellFault
              label={`${card} 카드 렌더 실패: ${this.state.message}`}
              stack={this.state.componentStack}
              onRetry={this.retry}
            />
          ) : (
            children
          )}
        </div>
      </Card>
    );
  }
}
