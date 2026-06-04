import { Activity, ClipboardCheck, Megaphone, Send } from "lucide-react";
import { Badge, Button, Input, Spinner, Textarea } from "../../components/ui/primitives";
import { useAgentsStore } from "./agents-store";

export function AgentBusWritePanel({ canRequest }: { canRequest: boolean }) {
  const store = useAgentsStore();
  const draft = store.draft;
  const messageDisabled = !canRequest || store.submitting !== "" || !draft.messageFrom.trim() || !draft.messageBody.trim();
  const boardDisabled = !canRequest || store.submitting !== "" || !draft.boardAgentId.trim() || !draft.boardKey.trim() || !draft.boardValue.trim();
  const lifecycleDisabled = !canRequest || store.submitting !== "" || !draft.lifecycleAgentId.trim() || !draft.lifecycleState.trim();
  const commandDisabled = !canRequest || store.submitting !== "" || !draft.commandFrom.trim() || !draft.command.trim() || (!draft.commandGroupId.trim() && !draft.commandRunId.trim());

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">agent bus</Badge>
        <Badge tone="outline">write-through snapshot</Badge>
        {store.submitting ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Spinner size={13} /> 저장 중</span> : null}
        {store.lastAction ? <Badge tone="success">{store.lastAction}</Badge> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">from</span>
              <Input value={draft.messageFrom} onChange={(event) => store.setDraft({ messageFrom: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">to</span>
              <Input value={draft.messageTo} onChange={(event) => store.setDraft({ messageTo: event.target.value })} placeholder="all" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">kind</span>
            <Input value={draft.messageKind} onChange={(event) => store.setDraft({ messageKind: event.target.value })} placeholder="message" />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">message</span>
            <Textarea value={draft.messageBody} rows={2} onChange={(event) => store.setDraft({ messageBody: event.target.value })} placeholder="에이전트 버스에 남길 메시지" />
          </label>
          <Button variant="outline" size="sm" onClick={store.postMessage} disabled={messageDisabled}>
            <Send size={14} aria-hidden="true" /> 메시지 기록
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">agent</span>
              <Input value={draft.boardAgentId} onChange={(event) => store.setDraft({ boardAgentId: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">status</span>
              <Input value={draft.boardStatus} onChange={(event) => store.setDraft({ boardStatus: event.target.value })} placeholder="running" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">key</span>
              <Input value={draft.boardKey} onChange={(event) => store.setDraft({ boardKey: event.target.value })} placeholder="progress" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">priority</span>
              <Input value={draft.boardPriority} onChange={(event) => store.setDraft({ boardPriority: event.target.value })} placeholder="normal" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">value</span>
            <Textarea value={draft.boardValue} rows={2} onChange={(event) => store.setDraft({ boardValue: event.target.value })} placeholder="공유 보드에 저장할 상태" />
          </label>
          <Button variant="outline" size="sm" onClick={store.putBoard} disabled={boardDisabled}>
            <ClipboardCheck size={14} aria-hidden="true" /> 보드 저장
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">agent</span>
              <Input value={draft.lifecycleAgentId} onChange={(event) => store.setDraft({ lifecycleAgentId: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">state</span>
              <Input value={draft.lifecycleState} onChange={(event) => store.setDraft({ lifecycleState: event.target.value })} placeholder="running" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">detail</span>
            <Textarea value={draft.lifecycleDetail} rows={2} onChange={(event) => store.setDraft({ lifecycleDetail: event.target.value })} placeholder="생명주기 이벤트 상세" />
          </label>
          <Button variant="outline" size="sm" onClick={store.emitLifecycle} disabled={lifecycleDisabled}>
            <Activity size={14} aria-hidden="true" /> 생명주기 기록
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">from</span>
              <Input value={draft.commandFrom} onChange={(event) => store.setDraft({ commandFrom: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">command</span>
              <Input value={draft.command} onChange={(event) => store.setDraft({ command: event.target.value })} placeholder="stop" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">group</span>
              <Input value={draft.commandGroupId} onChange={(event) => store.setDraft({ commandGroupId: event.target.value })} placeholder="group-id" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">run</span>
              <Input value={draft.commandRunId} onChange={(event) => store.setDraft({ commandRunId: event.target.value })} placeholder="run-id" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">body</span>
            <Textarea value={draft.commandBody} rows={2} onChange={(event) => store.setDraft({ commandBody: event.target.value })} placeholder="명령 메시지 상세" />
          </label>
          <Button variant="outline" size="sm" onClick={store.postGroupCommand} disabled={commandDisabled}>
            <Megaphone size={14} aria-hidden="true" /> 명령 기록
          </Button>
        </div>
      </div>
    </>
  );
}
