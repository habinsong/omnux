import { useEffect, useRef, useState } from "react";
import { RefreshCcw, Send } from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { statusLabel, statusTone } from "../../components/ui/status-tone";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useAgentsPageBridge, useAgentsStore } from "./agents-store";
import {
  AGENT_TABS,
  AGENT_WRITE_KINDS,
  countFailedAgentSlices,
  describeAgentSlice,
  describeWriteBlock,
  formatAgentTime,
  writeKindLabel,
  type AgentSliceId,
  type AgentWriteKind
} from "./agents-view";

/* ============================================================================
   에이전트 화면.
   캡슐 탭 넷(실행 중·흐름·공유 기록·작업 폴더) + 기록 남기기 탭 하나.
   탭을 고를 때 그 조회만 보낸다. 목록은 남은 높이 안에서만 스크롤한다.
   ============================================================================ */

type TabId = AgentSliceId | "write";

export function AgentsPage() {
  useAgentsPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const slices = useAgentsStore((state) => state.slices);
  const gatewayNotice = useAgentsStore((state) => state.gatewayNotice);
  const load = useAgentsStore((state) => state.load);

  const [tab, setTab] = useState<TabId>("watchdog");
  const requested = useRef<Set<AgentSliceId>>(new Set());

  useEffect(() => {
    if (!connected || tab === "write") return;
    const id = tab;
    if (requested.current.has(id)) return;
    if (slices[id].status !== "idle") return;
    requested.current.add(id);
    load(id);
  }, [connected, tab, slices, load]);

  const failed = countFailedAgentSlices(slices);

  const tabs: ScreenTab[] = [
    ...AGENT_TABS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      badge: slices[entry.id].status === "failed" ? "실패" : undefined,
      alert: slices[entry.id].status === "failed"
    })),
    { id: "write", label: "기록 남기기", icon: Send }
  ];

  const active = tab === "write" ? null : slices[tab];

  return (
    <Screen
      title="에이전트"
      hint="작업자끼리 주고받은 기록과 실행 상태를 봅니다."
      actions={
        tab !== "write" ? (
          <Button variant="outline" size="sm" onClick={() => load(tab)} disabled={!connected || active?.status === "loading"}>
            {active?.status === "loading" ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 다시 조회
          </Button>
        ) : null
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다. 조회와 기록을 할 수 없습니다.</ScreenNotice>
        ) : gatewayNotice ? (
          <ScreenNotice tone="danger">{gatewayNotice}</ScreenNotice>
        ) : failed > 0 ? (
          <ScreenNotice tone="danger">조회하지 못한 탭이 {failed}개 있습니다.</ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="에이전트 보기 종류" />

      {tab === "write" ? <WritePanel connected={connected} /> : <SliceBody id={tab} />}
    </Screen>
  );
}

function Frame({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <p className="shrink-0 truncate border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">{head}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  // 칸 전체를 쓰고 가운데 둔다. 위쪽에만 한 줄 띄우면 아래가 통째로 빈 칸으로 남는다.
  return <p className="flex h-full min-h-[200px] items-center justify-center px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

function Row({ name, detail, status }: { name: string; detail?: string; status?: string }) {
  const tone = status ? statusTone(status) : "default";
  return (
    <li className="flex min-w-0 items-start gap-2 px-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 break-words text-xs">{name}</span>
        {detail ? <span className="block min-w-0 break-words text-[11px] text-muted-foreground">{detail}</span> : null}
      </span>
      {status ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
            tone === "destructive" && "bg-destructive/15 text-destructive",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "success" && "bg-success/15 text-success",
            (tone === "default" || tone === "primary") && "bg-muted text-muted-foreground"
          )}
        >
          {statusLabel(status)}
        </span>
      ) : null}
    </li>
  );
}

function SliceBody({ id }: { id: AgentSliceId }) {
  const state = useAgentsStore((store) => store.slices[id]);
  const load = useAgentsStore((store) => store.load);
  const watchdog = useAgentsStore((store) => store.watchdog);
  const trace = useAgentsStore((store) => store.trace);
  const bus = useAgentsStore((store) => store.bus);
  const worktree = useAgentsStore((store) => store.worktree);

  const definition = AGENT_TABS.find((entry) => entry.id === id);
  const head =
    state.status === "failed"
      ? state.error
      : state.status === "loading"
        ? "조회 중"
        : state.updatedAt
          ? `${formatAgentTime(state.updatedAt)} 기준`
          : (definition?.hint ?? "");

  return (
    <>
      {state.status === "failed" ? (
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2">
          <span className="min-w-0 break-words text-xs text-destructive">{state.error}</span>
          <Button size="sm" variant="outline" onClick={() => load(id)}>
            다시 조회
          </Button>
        </div>
      ) : null}

      <Frame head={`${definition?.hint ?? ""} · ${describeAgentSlice(state)}${head && state.status === "ready" ? ` · ${head}` : ""}`}>
        {id === "watchdog" ? (
          watchdog === null ? (
            <Empty>탭을 열면 조회합니다.</Empty>
          ) : watchdog.runs.length === 0 ? (
            <Empty>지금 돌고 있는 작업자가 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {watchdog.runs.map((run) => (
                <Row
                  key={run.runId}
                  name={run.runId}
                  detail={`${run.backend} · ${run.ageSeconds}초 경과`}
                  status={run.health || run.state}
                />
              ))}
            </ul>
          )
        ) : null}

        {id === "trace" ? (
          trace === null ? (
            <Empty>탭을 열면 조회합니다.</Empty>
          ) : trace.agents.length === 0 && trace.interventions.length === 0 ? (
            <Empty>기록된 작업 흐름이 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {trace.interventions.map((item) => (
                <Row key={item.interventionId} name={item.title || item.interventionId} detail={item.reason} status={item.severity} />
              ))}
              {trace.agents.map((agent) => (
                <Row
                  key={agent.agentId}
                  name={agent.agentId}
                  detail={`${agent.role || "역할 없음"} · 메시지 ${agent.messageCount}`}
                  status={agent.state}
                />
              ))}
              {trace.threads.map((thread) => (
                <Row key={thread.threadId} name={thread.title || thread.threadId} detail={`메시지 ${thread.messageCount}`} />
              ))}
            </ul>
          )
        ) : null}

        {id === "bus" ? (
          bus === null ? (
            <Empty>탭을 열면 조회합니다.</Empty>
          ) : bus.messages.length === 0 && bus.board.length === 0 ? (
            <Empty>주고받은 기록이 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {bus.messages.map((message, index) => (
                <Row key={`m-${index}`} name={`${message.from || "?"} → ${message.to || "모두"}`} detail={message.body} />
              ))}
              {bus.board.map((entry, index) => (
                <Row key={`b-${index}`} name={`${entry.agentId} · ${entry.key}`} detail={entry.value} status={entry.status} />
              ))}
            </ul>
          )
        ) : null}

        {id === "worktree" ? (
          worktree === null ? (
            <Empty>탭을 열면 조회합니다.</Empty>
          ) : worktree.worktrees.length === 0 ? (
            <Empty>갈라 쓴 작업 폴더가 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {worktree.worktrees.map((entry) => (
                <Row
                  key={entry.name}
                  name={entry.name}
                  detail={entry.branch || entry.headShortHash || "브랜치 정보 없음"}
                  status={entry.hasChanges ? "dirty" : entry.status}
                />
              ))}
            </ul>
          )
        ) : null}
      </Frame>
    </>
  );
}

function WritePanel({ connected }: { connected: boolean }) {
  const draft = useAgentsStore((state) => state.draft);
  const submitting = useAgentsStore((state) => state.submitting);
  const lastAction = useAgentsStore((state) => state.lastAction);
  const lastError = useAgentsStore((state) => state.lastError);
  const store = useAgentsStore;

  const [kind, setKind] = useState<AgentWriteKind>("message");
  const blocked = describeWriteBlock(kind, draft);
  const busy = submitting === kind;

  const submit = () => {
    const actions = store.getState();
    if (kind === "message") actions.postMessage();
    else if (kind === "board") actions.putBoard();
    else if (kind === "lifecycle") actions.emitLifecycle();
    else actions.postGroupCommand();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {AGENT_WRITE_KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={kind === entry.kind}
            onClick={() => setKind(entry.kind)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              kind === entry.kind ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        <p className="text-[11px] text-muted-foreground">
          실제 프로세스를 움직이지 않습니다. 작업자들이 같이 보는 기록에 내용만 저장합니다.
        </p>

        {lastError ? (
          <p className="min-w-0 break-words rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{lastError}</p>
        ) : null}
        {lastAction ? <p className="min-w-0 break-words text-[11px] text-success">{lastAction}</p> : null}

        {kind === "message" ? (
          <>
            <Field label="보낸 쪽" value={draft.messageFrom} onChange={(v) => store.getState().setDraft({ messageFrom: v })} />
            <Field label="받는 쪽" value={draft.messageTo} onChange={(v) => store.getState().setDraft({ messageTo: v })} placeholder="비우면 모두" />
            <Field label="종류" value={draft.messageKind} onChange={(v) => store.getState().setDraft({ messageKind: v })} />
            <Area label="내용" value={draft.messageBody} onChange={(v) => store.getState().setDraft({ messageBody: v })} />
          </>
        ) : null}

        {kind === "board" ? (
          <>
            <Field label="대상 작업자" value={draft.boardAgentId} onChange={(v) => store.getState().setDraft({ boardAgentId: v })} />
            <Field label="항목" value={draft.boardKey} onChange={(v) => store.getState().setDraft({ boardKey: v })} />
            <Field label="상태" value={draft.boardStatus} onChange={(v) => store.getState().setDraft({ boardStatus: v })} />
            <Area label="내용" value={draft.boardValue} onChange={(v) => store.getState().setDraft({ boardValue: v })} />
          </>
        ) : null}

        {kind === "lifecycle" ? (
          <>
            <Field label="대상 작업자" value={draft.lifecycleAgentId} onChange={(v) => store.getState().setDraft({ lifecycleAgentId: v })} />
            <Field label="상태" value={draft.lifecycleState} onChange={(v) => store.getState().setDraft({ lifecycleState: v })} />
            <Area label="상세" value={draft.lifecycleDetail} onChange={(v) => store.getState().setDraft({ lifecycleDetail: v })} />
          </>
        ) : null}

        {kind === "command" ? (
          <>
            <Field label="보낸 쪽" value={draft.commandFrom} onChange={(v) => store.getState().setDraft({ commandFrom: v })} />
            <Field label="명령" value={draft.command} onChange={(v) => store.getState().setDraft({ command: v })} />
            <Field label="그룹 ID" value={draft.commandGroupId} onChange={(v) => store.getState().setDraft({ commandGroupId: v })} />
            <Field label="실행 ID" value={draft.commandRunId} onChange={(v) => store.getState().setDraft({ commandRunId: v })} />
            <Area label="상세" value={draft.commandBody} onChange={(v) => store.getState().setDraft({ commandBody: v })} />
          </>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={submit} disabled={!connected || busy || blocked.length > 0}>
            {busy ? <Spinner size={12} /> : <Send size={12} aria-hidden="true" />} {writeKindLabel(kind)} 남기기
          </Button>
          {blocked ? <span className="min-w-0 break-words text-[11px] text-muted-foreground">{blocked}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px]">
      {label}
      <Input className="h-8 text-xs" value={value} aria-label={label} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px]">
      {label}
      <Textarea rows={3} className="text-xs" value={value} aria-label={label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
