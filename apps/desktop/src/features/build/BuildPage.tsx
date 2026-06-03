import { useMemo } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { renderMarkdownToSafeHtml } from "../ask/markdown";
import { useBuildPageBridge, useBuildStore } from "./build-store";

function CodingBubble({ role, text }: { role: string; text: string }) {
  const html = useMemo(() => (role === "user" ? "" : renderMarkdownToSafeHtml(text)), [role, text]);
  if (role === "user") {
    return <div className="bubble-user">{text}</div>;
  }
  return <div className="bubble-ai markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function BuildPage() {
  useBuildPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useBuildStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const rollback = store.rollbackStatus;

  return (
    <section className="grid single-column">
      <CardBoundary title="코딩 실행" card="operations" onError={recordCardError}>
        <p className="routine-wizard-intro">
          코딩 요청을 .NET 미들웨어 코딩 오케스트레이션(coding_run_single)으로 실행하고, 결과를 마크다운으로 표시합니다.
        </p>
        {store.lastError ? <div className="section-error">{store.lastError}</div> : null}
        <textarea
          className="field"
          style={{ width: "100%", minHeight: 96 }}
          value={store.codingInput}
          placeholder="예: main.ts의 타입 오류를 고쳐줘"
          onChange={(event) => store.setCodingInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (canRequest) {
                store.runCoding();
              }
            }
          }}
        />
        <div className="log-toolbar" style={{ marginTop: 12 }}>
          <button className="secondary-button" type="button" onClick={store.runCoding} disabled={!canRequest || store.running || !store.codingInput.trim()}>
            {store.running ? "실행 중…" : "코딩 실행 (⌘/Ctrl+Enter)"}
          </button>
          <button className="secondary-button" type="button" onClick={store.clearResult} disabled={store.running}>
            결과 비우기
          </button>
        </div>
        <dl className="status-list compact-list">
          <div>
            <dt>session</dt>
            <dd>{store.conversationId || "-"}</dd>
          </div>
          <div>
            <dt>progress</dt>
            <dd>{store.progress || (store.running ? "실행 중…" : "idle")}</dd>
          </div>
        </dl>
        <div className="event-log" style={{ maxHeight: 360, overflow: "auto" }}>
          {store.messages.map((message, index) => (
            <CodingBubble key={`${index}-${message.role}`} role={message.role} text={message.text} />
          ))}
          {store.messages.length === 0 ? <div className="empty">코딩 결과 없음</div> : null}
        </div>
      </CardBoundary>

      <CardBoundary title="Safe Refactor 롤백 복원" card="navigation" onError={recordCardError}>
        <p className="routine-wizard-intro">
          코딩/리팩터가 만든 workspace 변경을 rollbackId로 되돌립니다(refactor_restore, 결함 #6 안전벨트).
        </p>
        <div className="field-row">
          <input
            className="field"
            value={store.rollbackId}
            placeholder="rollbackId"
            onChange={(event) => store.setRollbackId(event.target.value)}
          />
          <button className="secondary-button" type="button" onClick={store.restoreRollback} disabled={!canRequest || rollback.pending || !store.rollbackId.trim()}>
            {rollback.pending ? "복원 중…" : "복원"}
          </button>
        </div>
        {rollback.message ? (
          <div className={rollback.ok === false ? "section-error" : "routine-wizard-preview"} style={{ marginTop: 12 }}>
            <div>
              <span>상태</span>
              <strong>{rollback.ok === false ? "실패" : rollback.ok ? "복원 완료" : "진행"}</strong>
            </div>
            <div style={{ display: "block" }}>{rollback.message}</div>
            {rollback.changedPaths.length > 0 ? (
              <div style={{ display: "block", marginTop: 6 }}>
                {rollback.changedPaths.map((path) => (
                  <span key={path} className="chip" style={{ marginRight: 6 }}>
                    {path}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardBoundary>
    </section>
  );
}
