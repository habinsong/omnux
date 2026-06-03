import { useEffect, useRef } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useSettingsPageBridge, useSettingsStore } from "./settings-store";

export function SettingsPage() {
  useSettingsPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useSettingsStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (canRequest) {
      store.loadMemoryNotes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <section className="grid">
      <CardBoundary title="메모리 노트" card="operations" onError={recordCardError}>
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.loadMemoryNotes} disabled={!canRequest || store.loading}>
            새로고침
          </button>
          <button className="secondary-button" type="button" onClick={store.clearMemory} disabled={!canRequest}>
            비우기
          </button>
          <button className="secondary-button" type="button" onClick={store.searchMemory} disabled={!canRequest}>
            검색
          </button>
        </div>
        <input
          className="otp-input"
          style={{ width: "100%", marginTop: 12 }}
          value={store.memorySearchQuery}
          placeholder="메모리 검색"
          onChange={(event) => store.setMemorySearchQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (canRequest) {
                store.searchMemory();
              }
            }
          }}
        />
        <div className="event-log" style={{ marginTop: 12 }}>
          {store.memoryNotes.map((note) => (
            <button
              key={note.name}
              className={note.name === store.selectedNoteName ? "desktop-tab active" : "desktop-tab"}
              type="button"
              onClick={() => store.readMemoryNote(note.name)}
              disabled={!canRequest}
            >
              <span>{note.name}</span>
              <small>{note.excerpt || note.fullPath}</small>
              <small>{note.sizeBytes} bytes</small>
            </button>
          ))}
          {store.memoryNotes.length === 0 ? <div className="empty">메모리 노트 없음</div> : null}
        </div>
        {store.memorySearchResults.length > 0 ? (
          <div className="event-log">
            {store.memorySearchResults.map((result) => (
              <article key={`${result.path}-${result.score}`} className="desktop-tab">
                <span>{result.path}</span>
                <small>{result.snippet}</small>
                <small>score {result.score}</small>
              </article>
            ))}
          </div>
        ) : null}
        {store.selectedNoteName ? <div className="card-foot">선택: {store.selectedNoteName}</div> : null}
        {store.selectedNoteText ? <pre className="result-pre" style={{ maxHeight: 220 }}>{store.selectedNoteText}</pre> : null}
        <div className="log-toolbar" style={{ marginTop: 12 }}>
          <button className="secondary-button" type="button" onClick={() => store.deleteSelectedMemoryNotes()} disabled={!canRequest || !store.selectedNoteName}>
            삭제
          </button>
          <button className="secondary-button" type="button" onClick={() => store.renameMemoryNote(store.selectedNoteName)} disabled={!canRequest || !store.selectedNoteName}>
            이름 변경
          </button>
        </div>
      </CardBoundary>
      <CardBoundary title="백업" card="logs" onError={recordCardError}>
        <div className="status-list">
          <div><dt>scope</dt><dd>{store.backupIncludeScopes.length}</dd></div>
          <div><dt>last</dt><dd>{store.lastMessage || "-"}</dd></div>
        </div>
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.exportBackup} disabled={!canRequest}>
            내보내기
          </button>
          <button className="secondary-button" type="button" onClick={store.downloadBackupPackage} disabled={!store.backupPackage}>
            다운로드
          </button>
          <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={!canRequest}>
            가져오기
          </button>
          <button className="secondary-button" type="button" onClick={store.applyBackup} disabled={!canRequest || !store.backupPreview}>
            적용
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          hidden
          onChange={(event) => {
            const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
            void store.importBackup(file);
            event.target.value = "";
          }}
        />
        {store.backupPackage ? <div className="section-error">백업 패키지: {store.backupPackage.fileName}</div> : null}
        {store.backupPreview ? (
          <div className="section-error">
            {store.backupPreview.fileName} · 대화 {store.backupPreview.conversationCount} · 파일 {store.backupPreview.fileCount} · 충돌 {store.backupPreview.conflictCount}
            {store.backupPreview.error ? <p>{store.backupPreview.error}</p> : null}
          </div>
        ) : null}
      </CardBoundary>
    </section>
  );
}
