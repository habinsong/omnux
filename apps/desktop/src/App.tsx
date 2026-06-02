import { Component, type ErrorInfo, useMemo, type ReactNode } from "react";
import { useDesktopShellStore, type ShellCard } from "./shell-store";
import { useMiddlewareBootstrapEvents } from "./use-middleware-bootstrap-events";
import { triggerMiddlewareRuntimeProbe, useMiddlewareRuntimeProbe } from "./use-middleware-runtime-probe";

type CardBoundaryProps = {
  title: string;
  card: ShellCard;
  children: ReactNode;
  onError: (card: ShellCard, message: string) => void;
};

type CardBoundaryState = {
  message: string | null;
};

class CardBoundary extends Component<CardBoundaryProps, CardBoundaryState> {
  state: CardBoundaryState = {
    message: null
  };

  static getDerivedStateFromError(error: Error): CardBoundaryState {
    return {
      message: error.message
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(this.props.card, error.message);
    console.error("[omnux-desktop-card]", this.props.card, error, info.componentStack);
  }

  render() {
    const { title, card, children } = this.props;
    return (
      <article className="card">
        <h2>{title}</h2>
        {this.state.message ? (
          <ShellFault label={`${card} 카드 렌더 실패: ${this.state.message}`} />
        ) : (
          children
        )}
        <p className="card-foot">경계: {card}</p>
      </article>
    );
  }
}

function ShellFault({ label }: { label: string }) {
  return (
    <p className="section-error" role="alert">
      {label}
    </p>
  );
}

function App() {
  useMiddlewareBootstrapEvents();
  useMiddlewareRuntimeProbe();

  const middleware = useDesktopShellStore((state) => state.middleware);
  const runtime = useDesktopShellStore((state) => state.runtime);
  const logs = useDesktopShellStore((state) => state.logs);
  const markWaiting = useDesktopShellStore((state) => state.markWaiting);
  const markReconnectPlanned = useDesktopShellStore((state) => state.markReconnectPlanned);
  const recordCardError = useDesktopShellStore((state) => state.recordCardError);

  const shellNotes = useMemo(
    () => [
      "Rust 셸은 창과 생명주기만 담당",
      ".NET 미들웨어가 LLM, 코딩, 루틴, 리팩터 전담",
      "desktop shell boundary contract로 경계 검사"
    ],
    []
  );

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Omnux Desktop</p>
          <h1>앱 셸만 맡는 Tauri 데스크톱</h1>
          <p className="lede">
            Rust는 창과 앱 생명주기만 다루고, 실제 비즈니스 로직은 .NET 미들웨어가 전담한다.
          </p>
        </div>
        <aside className="panel">
          <h2>경계 요약</h2>
          <ul>
            {shellNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </aside>
      </section>
      <section className="grid">
        <CardBoundary title="허용 범위" card="runtime" onError={recordCardError}>
          <p>window 관리, deep link, open external, sidecar bootstrap, lifecycle 이벤트.</p>
        </CardBoundary>
        <CardBoundary title="금지 범위" card="runtime" onError={recordCardError}>
          <p>LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책, 영속 상태 직접 접근.</p>
        </CardBoundary>
      </section>
      <section className="grid">
        <CardBoundary title=".NET 미들웨어 연결 계약" card="middleware" onError={recordCardError}>
          {middleware.status === "error" ? <ShellFault label={middleware.lastError || "연결 실패"} /> : null}
          <dl className="status-list">
            <div>
              <dt>WebSocket</dt>
              <dd>{middleware.endpoint}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                <span className={`status-pill status-${middleware.status}`}>{middleware.status}</span>
              </dd>
            </div>
            <div>
              <dt>sidecar</dt>
              <dd>{middleware.sidecarBootstrap}</dd>
            </div>
          </dl>
          <button className="secondary-button" type="button" onClick={markWaiting}>
            연결 대기 표시
          </button>
          <button className="secondary-button" type="button" onClick={triggerMiddlewareRuntimeProbe}>
            ping/pong 재확인
          </button>
        </CardBoundary>
        <CardBoundary title="UI 로그 경계" card="logs" onError={recordCardError}>
          <ul className="event-log">
            {logs.map((log) => (
              <li key={log.id} className={`log-${log.level}`}>
                <span>{log.level}</span>
                {log.message}
              </li>
            ))}
          </ul>
        </CardBoundary>
        <CardBoundary title="런타임 부트 계약" card="runtime" onError={recordCardError}>
          {runtime.phase === "error" ? <ShellFault label={runtime.lastError || "runtime probe 실패"} /> : null}
          <dl className="status-list">
            <div>
              <dt>transport</dt>
              <dd>tauri-shell</dd>
            </div>
            <div>
              <dt>bootstrap</dt>
              <dd>{runtime.bootstrapPhase}</dd>
            </div>
            <div>
              <dt>pid</dt>
              <dd>{runtime.bootstrapPid ?? "none"}</dd>
            </div>
            <div>
              <dt>healthz</dt>
              <dd>
                <span className={`status-pill status-${runtime.healthStatus}`}>{runtime.healthStatus}</span>
                <span className="status-detail">{runtime.healthUrl}</span>
                {runtime.healthDetail ? <span className="status-detail">{runtime.healthDetail}</span> : null}
              </dd>
            </div>
            <div>
              <dt>readyz</dt>
              <dd>
                <span className={`status-pill status-${runtime.readyStatus}`}>{runtime.readyStatus}</span>
                <span className="status-detail">{runtime.readyUrl}</span>
                {runtime.readyDetail ? <span className="status-detail">{runtime.readyDetail}</span> : null}
              </dd>
            </div>
            <div>
              <dt>재연결</dt>
              <dd>{runtime.reconnectPolicy.mode}</dd>
            </div>
            <div>
              <dt>시도</dt>
              <dd>
                {runtime.reconnectAttempts}/{runtime.reconnectPolicy.maxAttempts}
              </dd>
            </div>
            <div>
              <dt>last probe</dt>
              <dd>{runtime.lastProbeAt || "not yet"}</dd>
            </div>
            <div>
              <dt>last error</dt>
              <dd>{runtime.lastError || "none"}</dd>
            </div>
          </dl>
          <button className="secondary-button" type="button" onClick={markReconnectPlanned}>
            재연결 예약
          </button>
        </CardBoundary>
      </section>
      <p className="footer-note">데스크톱 셸은 healthz/readyz와 WebSocket ping/pong까지만 확인하고, 도메인 작업은 .NET 미들웨어에 위임한다.</p>
    </main>
  );
}

export default App;
