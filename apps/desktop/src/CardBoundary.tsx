import { Component, type ErrorInfo, type ReactNode } from "react";
import { type ShellCard } from "./shell-store";
import { ShellFault } from "./ShellFault";

type CardBoundaryProps = {
  title: string;
  card: ShellCard;
  children: ReactNode;
  onError: (card: ShellCard, message: string, componentStack?: string | null) => void;
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
    const { title, card, children } = this.props;
    return (
      <article className="card">
        <h2>{title}</h2>
        {this.state.message ? (
          <ShellFault
            label={`${card} 카드 렌더 실패: ${this.state.message}`}
            stack={this.state.componentStack}
            onRetry={this.retry}
          />
        ) : (
          children
        )}
        <p className="card-foot">경계: {card}</p>
      </article>
    );
  }
}
