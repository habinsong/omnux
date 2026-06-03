import { useEffect } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useAutomatePageBridge, useAutomateStore } from "./automate-store";

export function AutomatePage() {
  useAutomatePageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useAutomateStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const selectedRoutine = store.routines.find((routine) => routine.id === store.selectedRoutineId) || null;

  useEffect(() => {
    if (canRequest) {
      store.loadRoutines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <section className="grid single-column">
      <CardBoundary title="루틴" card="operations" onError={recordCardError}>
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.loadRoutines} disabled={!canRequest || store.pending}>
            {store.pending ? "조회 중" : "새로고침"}
          </button>
          <button className="secondary-button" type="button" onClick={() => store.runRoutine(store.selectedRoutineId)} disabled={!canRequest || !store.selectedRoutineId || store.pending}>
            실행
          </button>
        </div>
        {store.lastMessage ? <div className="section-error">{store.lastMessage}</div> : null}
        <div className="event-log" style={{ marginTop: 12 }}>
          {store.routines.map((routine) => (
            <button
              key={routine.id}
              className={routine.id === store.selectedRoutineId ? "desktop-tab active" : "desktop-tab"}
              type="button"
              onClick={() => store.selectRoutine(routine.id)}
            >
              <span>{routine.title}</span>
              <small>{routine.preview || routine.scheduleSummary || routine.toolProfile}</small>
              <small>{routine.enabled ? "enabled" : "disabled"}</small>
            </button>
          ))}
          {store.routines.length === 0 ? <div className="empty">루틴 없음</div> : null}
        </div>
        {selectedRoutine ? (
          <dl className="status-list compact-list">
            <div><dt>id</dt><dd>{selectedRoutine.id}</dd></div>
            <div><dt>profile</dt><dd>{selectedRoutine.toolProfile || "-"}</dd></div>
            <div><dt>schedule</dt><dd>{selectedRoutine.scheduleSummary || "-"}</dd></div>
          </dl>
        ) : null}
        <div className="log-toolbar" style={{ marginTop: 12 }}>
          <button className="secondary-button" type="button" onClick={() => store.deleteRoutine(store.selectedRoutineId)} disabled={!canRequest || !store.selectedRoutineId || store.pending}>
            삭제
          </button>
        </div>
      </CardBoundary>
    </section>
  );
}
