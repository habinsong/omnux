import { useEffect, useRef, useState } from "react";
import { ListChecks, PenLine, Plus, RefreshCcw } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { useDesktopShellStore } from "../../shell-store";
import { useAutomationWorkspace } from "./automation-state";
import { AutomationFormPanel, AutomationListPanel, AutomationResultPanel } from "./AutomationPanels";

/* ============================================================================
   자동화 화면.
   목록 / 작성 / 결과 를 캡슐 탭으로 가른다.
   결과 탭은 고른 자동화가 있을 때만 나온다 — 빈 칸을 보여 주지 않는다.
   ============================================================================ */

type TabId = "list" | "editor" | "result";

export function AutomationWorkspacePage() {
  const state = useAutomationWorkspace();
  const navigation = useDesktopNavigationStore();
  const authenticated = useDesktopAuthStore((value) => value.auth.status === "authenticated");
  const online = useDesktopShellStore((value) => value.bridge.status === "connected");
  const connected = authenticated && online;
  const selected = state.items.find((item) => item.id === state.selectedId);
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<TabId>("list");

  useEffect(() => {
    if (!connected) return;
    state.refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden && !useAutomationWorkspace.getState().pending.list) state.refresh();
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    const payload = navigation.routePayload;
    if (!payload || state.pending.change) return;
    const request = payload.input?.trim() || "";
    if (payload.create || request) {
      if (state.editor && state.form.request.trim() && (state.editId || (request && request !== state.form.request))) {
        useAutomationWorkspace.setState({ error: "작성 중인 자동화가 있습니다. 저장하거나 취소하면 전달받은 요청을 열 수 있습니다." });
        return;
      }
      if (!state.editor) state.create();
      if (request) state.patch({ request });
      if (payload.scheduleKind) state.patch({ kind: payload.scheduleKind });
      if (payload.scheduleTime) state.patch({ time: payload.scheduleTime });
      if (payload.scheduleWeekdays) state.patch({ weekdays: payload.scheduleWeekdays });
      if (payload.scheduleDayOfMonth) state.patch({ day: payload.scheduleDayOfMonth });
    }
    navigation.clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation.routeVersion, state.editor, state.pending.change]);

  useEffect(() => {
    if (state.confirmation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [state.confirmation]);

  // 작성이 열리면 작성 탭, 자동화를 고르면 결과 탭으로 옮긴다.
  useEffect(() => {
    if (state.editor) setTab("editor");
  }, [state.editor]);
  useEffect(() => {
    if (state.selectedId && !state.editor) setTab("result");
  }, [state.selectedId, state.editor]);

  const tabs: ScreenTab[] = [
    { id: "list", label: "목록", icon: ListChecks, badge: state.items.length > 0 ? String(state.items.length) : undefined },
    ...(state.editor ? [{ id: "editor", label: state.editId ? "편집" : "새 자동화", icon: PenLine } as ScreenTab] : []),
    ...(selected && !state.editor ? [{ id: "result", label: "결과", icon: RefreshCcw } as ScreenTab] : [])
  ];
  const active: TabId = tabs.some((entry) => entry.id === tab) ? tab : "list";

  const schedulerFault = state.scheduler && (!state.scheduler.enabled || state.scheduler.error);

  return (
    <Screen
      title="자동화"
      hint="반복할 일과 시간을 정해 두면 그때마다 알아서 실행합니다."
      actions={
        !state.editor ? (
          <Button variant="primary" size="sm" disabled={!connected || Boolean(state.pending.change)} onClick={state.create}>
            <Plus size={14} aria-hidden="true" /> 새 자동화
          </Button>
        ) : null
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">서버에 연결하면 자동화를 불러올 수 있습니다.</ScreenNotice>
        ) : state.error ? (
          <ScreenNotice tone="danger">{state.error}</ScreenNotice>
        ) : schedulerFault ? (
          <ScreenNotice tone="warning">{state.scheduler?.error || "예약 실행이 멈춰 있습니다. 서버 상태를 확인하세요."}</ScreenNotice>
        ) : state.pending.change ? (
          <ScreenNotice>
            {state.progress || (state.pending.change.type === "run_routine" ? "실행 결과를 기다리고 있습니다." : "변경을 저장하고 있습니다.")}
          </ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={active} onChange={(id) => setTab(id as TabId)} label="자동화 보기 종류" />

      {active === "editor" && state.editor ? (
        <AutomationFormPanel connected={connected} />
      ) : active === "result" && selected ? (
        <AutomationResultPanel key={selected.id} item={selected} connected={connected} />
      ) : (
        <AutomationListPanel connected={connected} />
      )}

      <dialog
        ref={dialog}
        className="max-w-sm rounded-xl border border-border bg-card p-4 text-foreground backdrop:bg-black/40"
        aria-labelledby="automation-confirm-title"
        onCancel={() => useAutomationWorkspace.setState({ confirmation: null })}
        onClose={() => useAutomationWorkspace.setState({ confirmation: null })}
      >
        {state.confirmation ? (
          <form
            className="min-w-0 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              state.accept();
            }}
          >
            <h2 id="automation-confirm-title" className="text-sm font-semibold">
              {state.confirmation.title}
            </h2>
            <p className="min-w-0 break-words text-xs text-muted-foreground">{state.confirmation.message}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" autoFocus onClick={() => useAutomationWorkspace.setState({ confirmation: null })}>
                취소
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!connected}>
                {state.confirmation.action === "delete" ? "삭제" : "보내기"}
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>
    </Screen>
  );
}
