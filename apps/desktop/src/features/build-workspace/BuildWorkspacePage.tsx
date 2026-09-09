import { useEffect, useRef, useState } from "react";
import { FolderOpen, Hammer, History, SlidersHorizontal } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { BuildComposer, BuildReferences } from "./BuildComposer";
import { BuildResultPanel } from "./BuildResultPanel";
import { BuildSettings } from "./BuildSettings";
import { busyBuild, useBuildWorkspace } from "./build-state";
import { modeNames } from "./build-model";
import "./build-workspace.css";

/* ============================================================================
   빌드 화면.
   빌드 / 설정 / 참고 / 기록 을 캡슐 탭으로 가른다.
   빌드 탭에서는 결과가 남은 높이를 차지하고 작성칸이 아래에 붙는다.
   ============================================================================ */

type TabId = "build" | "settings" | "references" | "history";

export function BuildWorkspacePage() {
  const state = useBuildWorkspace();
  const busy = busyBuild(state);
  const online = useDesktopShellStore((value) => value.bridge.status === "connected");
  const authenticated = useDesktopAuthStore((value) => value.auth.status === "authenticated");
  const connected = online && authenticated;
  const navigation = useDesktopNavigationStore();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<TabId>("build");

  useEffect(() => {
    const payload = navigation.routePayload;
    if (!payload || busy) return;
    if (payload.projectKey && state.activeId && state.settings.projectKey !== payload.projectKey) {
      if (state.input.trim() || state.attachments.length) {
        useBuildWorkspace.setState({ error: "작성 중인 요청이 있습니다. 새 빌드를 시작하면 선택한 프로젝트를 열 수 있습니다." });
        return;
      }
      state.fresh();
    }
    if (payload.input) useBuildWorkspace.setState({ input: payload.input });
    if (payload.conversationId && connected) state.open(payload.conversationId);
    if (payload.projectName || payload.projectKey) {
      state.patchSettings({
        project: payload.projectName || payload.projectKey || "",
        projectKey: payload.projectKey || "",
        projectPath: payload.projectPath || ""
      });
    }
    if (!payload.conversationId || connected) navigation.clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation.routeVersion, connected, busy, state.activeId, state.input]);

  useEffect(() => {
    if (state.confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [state.confirmation]);

  // 다른 화면에서 「모델과 작업 설정」 을 열어 달라고 하면 그 탭으로 옮긴다.
  useEffect(() => {
    if (state.settingsOpen) setTab("settings");
  }, [state.settingsOpen]);

  // 기록 탭을 열 때만 목록을 읽는다. 필요 없는 요청을 미리 보내지 않는다.
  useEffect(() => {
    if (tab === "history" && connected) state.loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, connected]);

  const running = Boolean(state.pending.run || state.pending.execute);
  const drafting = Boolean(state.input.trim() || state.attachments.length);

  const tabs: ScreenTab[] = [
    { id: "build", label: "빌드", icon: Hammer, alert: running },
    { id: "settings", label: "설정", icon: SlidersHorizontal },
    { id: "references", label: "참고", icon: FolderOpen, badge: state.settings.memory.length > 0 ? String(state.settings.memory.length) : undefined },
    { id: "history", label: "기록", icon: History, badge: state.items.length > 0 ? String(state.items.length) : undefined }
  ];

  return (
    <Screen
      title="빌드"
      hint={state.settings.projectKey ? state.settings.project || state.settings.projectKey : "필요한 결과를 만들고 실행합니다."}
      actions={
        <>
          {running ? (
            <Button variant="outline" size="sm" disabled={!connected || state.cancelPending} onClick={state.cancel}>
              작업 중단
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (drafting) useBuildWorkspace.setState({ confirmation: "new" });
              else state.fresh();
              setTab("build");
            }}
          >
            새 빌드
          </Button>
        </>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">서버에 연결하면 작업을 시작할 수 있습니다. 작성한 내용은 그대로 둡니다.</ScreenNotice>
        ) : state.error ? (
          <ScreenNotice tone="danger">{state.error}</ScreenNotice>
        ) : running ? (
          <ScreenNotice>{state.cancelPending ? "작업을 중단하고 있습니다." : state.progress || "작업 중입니다."}</ScreenNotice>
        ) : state.pending.detail ? (
          <ScreenNotice>저장된 결과를 불러오고 있습니다.</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="빌드 보기 종류" />

      {tab === "build" ? (
        <div className="build-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-2" data-surface="build-workspace">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <BuildResultPanel connected={connected} />
          </div>
          <div className="min-w-0 shrink-0">
            <BuildComposer connected={connected} />
          </div>
        </div>
      ) : (
        <div className="build-workspace flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card" data-surface="build-workspace">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="min-w-0 p-3">
              {tab === "settings" ? (
                <BuildSettings connected={connected} />
              ) : tab === "references" ? (
                <BuildReferences connected={connected} />
              ) : (
                <BuildHistory connected={connected} />
              )}
            </div>
          </div>
        </div>
      )}

      <dialog
        ref={dialog}
        className="build-dialog"
        aria-labelledby="build-confirm-title"
        onCancel={() => useBuildWorkspace.setState({ confirmation: null })}
        onClose={() => useBuildWorkspace.setState({ confirmation: null })}
      >
        {state.confirmation ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              state.confirm();
            }}
          >
            <h2 id="build-confirm-title">{state.confirmation === "new" ? "새 빌드 시작" : "빌드 기록 삭제"}</h2>
            <p>
              {state.confirmation === "new"
                ? "작성 중인 요청과 첨부를 비우고 새 빌드를 시작합니다."
                : "이 빌드의 대화와 결과 기록을 지웁니다."}
            </p>
            <div className="build-actions">
              <button type="button" autoFocus className="build-button" onClick={() => useBuildWorkspace.setState({ confirmation: null })}>
                취소
              </button>
              <button type="submit" className="build-button" data-primary>
                {state.confirmation === "new" ? "새로 시작" : "삭제"}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </Screen>
  );
}

/** 저장한 빌드 목록과 이 빌드의 요청 기록. */
function BuildHistory({ connected }: { connected: boolean }) {
  const state = useBuildWorkspace();
  const busy = busyBuild(state);
  const drafting = Boolean(state.input.trim() || state.attachments.length);
  const listing = Object.keys(state.pending).some((key) => key.startsWith("list-") && state.pending[key]);

  return (
    <div className="build-form-fields">
      {listing ? (
        <p role="status" className="build-muted">
          빌드 목록을 불러오고 있습니다.
        </p>
      ) : null}
      <label>
        저장한 빌드
        <select disabled={!connected || busy || drafting} value={state.activeId} onChange={(event) => state.open(event.target.value)}>
          <option value="">선택해 주세요.</option>
          {state.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {modeNames[item.mode]}
            </option>
          ))}
        </select>
      </label>
      {drafting ? <p className="build-muted">작성한 요청을 보내거나 새 빌드에서 비운 뒤 다른 기록을 고를 수 있습니다.</p> : null}
      {state.activeId ? (
        <div className="build-actions">
          <button type="button" className="build-button build-delete" disabled={!connected || busy} onClick={() => useBuildWorkspace.setState({ confirmation: "delete" })}>
            이 빌드 기록 삭제
          </button>
        </div>
      ) : null}

      {state.submitted &&
      (state.pending.run ||
        (state.error && state.active?.messages.filter((message) => message.role === "user").slice(-1)[0]?.text !== state.submitted.input)) ? (
        <div>
          <p className="build-muted">보낸 요청</p>
          <p className="build-sent-request">{state.submitted.input}</p>
        </div>
      ) : null}

      {state.active?.messages.length ? (
        <div>
          <p className="build-muted">이 빌드의 요청 기록</p>
          <ol className="build-request-history">
            {state.active.messages.map((message, index) => (
              <li key={index}>
                <strong>{message.role === "user" ? "요청" : "응답"}</strong>
                <p>{message.text}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
