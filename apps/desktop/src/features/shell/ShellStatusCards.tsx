import { ReadOnlyWsPanel } from "../../ReadOnlyWsPanel";
import { ShellFault } from "../../ShellFault";
import { triggerMiddlewareRuntimeProbe } from "../../use-middleware-runtime-probe";
import { useDesktopShellStore } from "../../shell-store";

export function ShellBoundarySummary() {
  return (
    <section className="grid">
      <article className="card">
        <h2>허용 범위</h2>
        <p>window 관리, deep link, open external, sidecar bootstrap, lifecycle 이벤트.</p>
        <p className="card-foot">경계: runtime</p>
      </article>
      <article className="card">
        <h2>금지 범위</h2>
        <p>LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책, 영속 상태 직접 접근.</p>
        <p className="card-foot">경계: runtime</p>
      </article>
    </section>
  );
}

export function MiddlewareContractCard() {
  const middleware = useDesktopShellStore((state) => state.middleware);
  const markWaiting = useDesktopShellStore((state) => state.markWaiting);

  return (
    <>
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
    </>
  );
}

export function RuntimeContractCard() {
  const runtime = useDesktopShellStore((state) => state.runtime);
  const markReconnectPlanned = useDesktopShellStore((state) => state.markReconnectPlanned);

  return (
    <>
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
    </>
  );
}

export function AuthReadOnlyCard() {
  return <ReadOnlyWsPanel />;
}
