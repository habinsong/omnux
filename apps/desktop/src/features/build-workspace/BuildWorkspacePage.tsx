import { useEffect, useRef, useState } from "react";
import { FolderOpen, Hammer, History, SlidersHorizontal } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopNavigationStore, workModeFromRoute } from "../shell/navigation-store";
import { useBuildNotebookSave } from "./build-notebook-save";
import { BuildComposer, BuildReferences } from "./BuildComposer";
import { BuildResultPanel } from "./BuildResultPanel";
import { BuildSettings } from "./BuildSettings";
import { busyBuild, useBuildWorkspace } from "./build-state";
import { modeNames } from "./build-model";
import { useHomeRecentStore } from "../home/home-recent-store";
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
  const notebook = useBuildNotebookSave();
  const dialog = useRef<HTMLDialogElement>(null);
  const attachRule = useRef(false);
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
    const nextMode = workModeFromRoute(payload.mode);
    if (nextMode && !payload.conversationId && !useBuildWorkspace.getState().activeId) {
      useBuildWorkspace.getState().patchSettings({ mode: nextMode });
      if (nextMode !== "single") useBuildWorkspace.setState({ settingsOpen: true });
    }
    if (payload.conversationId && connected) state.open(payload.conversationId);
    if (payload.projectName || payload.projectKey) {
      attachRule.current = true;
      state.patchSettings({
        project: payload.projectName || payload.projectKey || "",
        projectKey: payload.projectKey || "",
        projectPath: payload.projectPath || ""
      });
      if (connected) state.loadReferences();
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

  useEffect(() => {
    if (!attachRule.current || !state.memory.some((note) => note.name === "작업 규칙.md")) return;
    if (!state.settings.memory.includes("작업 규칙.md")) {
      state.patchSettings({ memory: [...state.settings.memory, "작업 규칙.md"] });
    }
    attachRule.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.memory, state.settings.memory]);

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
      surface="build-workspace"
      title="빌드"
      hint={state.settings.projectKey ? state.settings.project || state.settings.projectKey : ""}
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
        state.error ? (
          <ScreenNotice tone="danger">{state.error}</ScreenNotice>
        ) : !connected ? (
          <ScreenNotice tone="warning">서버에 연결하면 작업을 시작할 수 있습니다. 작성한 내용은 그대로 둡니다.</ScreenNotice>
        ) : running ? (
          <ScreenNotice>{state.cancelPending ? "작업을 중단하고 있습니다." : state.progress || "작업 중입니다."}</ScreenNotice>
        ) : state.pending.detail ? (
          <ScreenNotice>저장된 결과를 불러오고 있습니다.</ScreenNotice>
        ) : notebook.notice ? (
          <ScreenNotice tone={notebook.failed ? "danger" : "info"}>{notebook.notice}</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id as TabId);
          if (id !== "settings" && useBuildWorkspace.getState().settingsOpen) useBuildWorkspace.setState({ settingsOpen: false });
        }}
        label="빌드 보기 종류"
      />

      <div className="build-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {tab === "build" ? (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            <BuildThread />
            <BuildResultPanel connected={connected} />
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
            <div className="min-h-0 h-full overflow-y-auto overflow-x-hidden">
              {state.currentResult ? (
                <div className="min-w-0 p-3">
                  <BuildResultPanel connected={connected} />
                </div>
              ) : null}
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
        <div className="min-w-0 shrink-0">
          <BuildComposer connected={connected} />
        </div>
      </div>

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

function BuildThread() {
  const state = useBuildWorkspace();
  const messages = state.active?.messages ?? [];
  const pendingUser = state.pending.run && state.submitted?.input ? state.submitted.input : "";
  if (messages.length === 0 && !pendingUser) {
    return <BuildEmptyContinue />;
  }
  return (
    <div className="build-thread" aria-label="빌드 대화">
      {messages.map((message, index) => (
        <p key={index} className="build-bubble" data-role={message.role === "user" ? "user" : "ai"}>
          {message.text}
        </p>
      ))}
      {pendingUser && !messages.some((message) => message.role === "user" && message.text === pendingUser) ? (
        <p className="build-bubble" data-role="user">
          {pendingUser}
        </p>
      ) : null}
    </div>
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
        빌드 선택
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

function BuildEmptyContinue() {
  const recent = useHomeRecentStore((state) => state.items);
  const items = recent.filter((item) => item.kind === "build").slice(0, 3);
  const open = useBuildWorkspace((state) => state.open);
  if (items.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">아직 주고받은 요청이 없습니다.</p>;
  }
  return (
    <div className="min-w-0 space-y-2 px-3 py-4">
      <p className="text-center text-xs text-muted-foreground">아직 이 칸은 비어 있습니다. 아래에서 이어서 열 수 있습니다.</p>
      <ul className="mx-auto flex max-w-md min-w-0 flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <button type="button" className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent" onClick={() => open(item.id)}>
              <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
              {item.preview ? <span className="hidden min-w-0 max-w-[40%] truncate text-muted-foreground sm:inline">{item.preview}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
