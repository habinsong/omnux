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
        <Badge tone="primary">공유 기록</Badge>
        <Badge tone="outline">즉시 반영</Badge>
        {store.submitting ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Spinner size={13} /> 저장 중</span> : null}
        {store.lastAction ? <Badge tone="success">{store.lastAction}</Badge> : null}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">보낸 쪽</span>
              <Input value={draft.messageFrom} onChange={(event) => store.setDraft({ messageFrom: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">받는 쪽</span>
              <Input value={draft.messageTo} onChange={(event) => store.setDraft({ messageTo: event.target.value })} placeholder="all" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">종류</span>
            <Input value={draft.messageKind} onChange={(event) => store.setDraft({ messageKind: event.target.value })} placeholder="message" />
          </label>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">메시지</span>
            <Textarea value={draft.messageBody} rows={2} onChange={(event) => store.setDraft({ messageBody: event.target.value })} placeholder="공유 기록에 남길 메시지" />
          </label>
          <Button variant="outline" size="sm" onClick={store.postMessage} disabled={messageDisabled}>
            <Send size={14} aria-hidden="true" /> 메시지 기록
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">대상</span>
              <Input value={draft.boardAgentId} onChange={(event) => store.setDraft({ boardAgentId: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">상태</span>
              <Input value={draft.boardStatus} onChange={(event) => store.setDraft({ boardStatus: event.target.value })} placeholder="running" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">항목</span>
              <Input value={draft.boardKey} onChange={(event) => store.setDraft({ boardKey: event.target.value })} placeholder="progress" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">우선순위</span>
              <Input value={draft.boardPriority} onChange={(event) => store.setDraft({ boardPriority: event.target.value })} placeholder="normal" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">내용</span>
            <Textarea value={draft.boardValue} rows={2} onChange={(event) => store.setDraft({ boardValue: event.target.value })} placeholder="공유 상태에 저장할 내용" />
          </label>
          <Button variant="outline" size="sm" onClick={store.putBoard} disabled={boardDisabled}>
            <ClipboardCheck size={14} aria-hidden="true" /> 상태 저장
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">대상</span>
              <Input value={draft.lifecycleAgentId} onChange={(event) => store.setDraft({ lifecycleAgentId: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">상태</span>
              <Input value={draft.lifecycleState} onChange={(event) => store.setDraft({ lifecycleState: event.target.value })} placeholder="running" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">상세</span>
            <Textarea value={draft.lifecycleDetail} rows={2} onChange={(event) => store.setDraft({ lifecycleDetail: event.target.value })} placeholder="상태 변경 상세" />
          </label>
          <Button variant="outline" size="sm" onClick={store.emitLifecycle} disabled={lifecycleDisabled}>
            <Activity size={14} aria-hidden="true" /> 상태 기록
          </Button>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">보낸 쪽</span>
              <Input value={draft.commandFrom} onChange={(event) => store.setDraft({ commandFrom: event.target.value })} placeholder="human" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">명령</span>
              <Input value={draft.command} onChange={(event) => store.setDraft({ command: event.target.value })} placeholder="stop" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">그룹</span>
              <Input value={draft.commandGroupId} onChange={(event) => store.setDraft({ commandGroupId: event.target.value })} placeholder="group-id" />
            </label>
            <label className="min-w-0 space-y-1">
              <span className="block text-xs text-muted-foreground">실행</span>
              <Input value={draft.commandRunId} onChange={(event) => store.setDraft({ commandRunId: event.target.value })} placeholder="run-id" />
            </label>
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="block text-xs text-muted-foreground">내용</span>
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
