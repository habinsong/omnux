import { Bell, Info, Network, RefreshCcw, Send } from "lucide-react";
import { Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { SELECT_CLASS } from "./OperationsPage.shared";

type OperationsNodesPanelProps = {
  readonly nodes: OpsToolsState["nodes"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsNodesPanel({ nodes, store, canRequest }: OperationsNodesPanelProps) {
  const selectedNodeCommands = (nodes.snapshot?.nodes || []).find((node) => node.nodeId === nodes.selectedNodeId)?.commands || [nodes.invokeCommand].filter(Boolean);

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Network size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">연결 노드</p>
            <p className="truncate text-xs text-muted-foreground">연결된 노드와 페어링 요청을 관리합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="outline" size="sm" onClick={store.loadNodesSnapshot} disabled={!canRequest || nodes.loading}>
            {nodes.loading ? <Spinner size={14} /> : <RefreshCcw size={14} aria-hidden="true" />} 상태
          </Button>
          <Button variant="outline" size="sm" onClick={store.loadNodesPending} disabled={!canRequest || nodes.loading}>
            대기
          </Button>
          <Button variant="ghost" size="sm" onClick={store.describeSelectedNode} disabled={!canRequest || !nodes.selectedNodeId || nodes.loading} title="선택 노드 상세 새로고침">
            <Info size={14} aria-hidden="true" /> 상세
          </Button>
        </div>
      </div>
      {nodes.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{nodes.lastError}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">어댑터</p>
          <p className="truncate text-sm font-semibold">{nodes.snapshot?.adapter || "-"}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">노드</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{nodes.snapshot?.nodes.length || 0}</p>
        </div>
        <div className="rounded-md bg-background/60 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground">대기</p>
          <p className="font-mono text-sm font-semibold tabular-nums">{nodes.snapshot?.pendingRequests.length || 0}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <select className={cn(SELECT_CLASS, "w-full")} value={nodes.selectedNodeId} onChange={(event) => store.setNodesField("selectedNodeId", event.target.value)}>
          {(nodes.snapshot?.nodes || []).map((node) => <option key={node.nodeId} value={node.nodeId}>{node.label || node.nodeId}</option>)}
        </select>
        <select className={cn(SELECT_CLASS, "w-full")} value={nodes.invokeCommand} onChange={(event) => store.setNodesField("invokeCommand", event.target.value)}>
          {selectedNodeCommands.map((command) => (
            <option key={command} value={command}>{command}</option>
          ))}
        </select>
      </div>
      <Textarea rows={3} value={nodes.invokeParamsJson} onChange={(event) => store.setNodesField("invokeParamsJson", event.target.value)} placeholder='{"message":"ok"}' className="font-mono text-xs" />
      <div className="max-h-32 space-y-1 overflow-y-auto pr-1">
        {(nodes.snapshot?.pendingRequests || []).map((request) => (
          <div key={request.requestId} className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono">{request.requestId}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{request.nodeLabel} · {request.status}</span>
            </span>
            <Button variant="outline" size="sm" onClick={() => store.approveNodeRequest(request.requestId)} disabled={!canRequest || nodes.loading}>승인</Button>
            <Button variant="ghost" size="sm" onClick={() => store.rejectNodeRequest(request.requestId)} disabled={!canRequest || nodes.loading}>거절</Button>
          </div>
        ))}
        {nodes.snapshot && nodes.snapshot.pendingRequests.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">대기 요청 없음</p> : null}
      </div>
      <Button variant="destructive" size="sm" onClick={store.invokeSelectedNodeCommand} disabled={!canRequest || !nodes.selectedNodeId || !nodes.invokeCommand || nodes.loading}>
        {nodes.loading ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 명령 호출
      </Button>

      <div className="space-y-2 rounded-md border border-border bg-background/50 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Bell size={13} className="shrink-0 text-primary" aria-hidden="true" /> 선택 노드에 알림 보내기
        </p>
        <Input value={nodes.notifyTitle} placeholder="알림 제목" onChange={(event) => store.setNodesField("notifyTitle", event.target.value)} />
        <Textarea rows={2} value={nodes.notifyBody} placeholder="알림 본문" onChange={(event) => store.setNodesField("notifyBody", event.target.value)} className="text-xs" />
        <div className="grid grid-cols-2 gap-2">
          <select className={cn(SELECT_CLASS, "w-full")} value={nodes.notifyPriority} onChange={(event) => store.setNodesField("notifyPriority", event.target.value)}>
            <option value="passive">낮음</option>
            <option value="active">일반</option>
            <option value="timeSensitive">시간 민감</option>
          </select>
          <select className={cn(SELECT_CLASS, "w-full")} value={nodes.notifyDelivery} onChange={(event) => store.setNodesField("notifyDelivery", event.target.value)}>
            <option value="auto">자동</option>
            <option value="system">시스템</option>
            <option value="overlay">오버레이</option>
          </select>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void store.notifySelectedNode()}
          disabled={!canRequest || !nodes.selectedNodeId || (!nodes.notifyTitle.trim() && !nodes.notifyBody.trim()) || nodes.loading}
        >
          {nodes.loading ? <Spinner size={14} /> : <Bell size={14} aria-hidden="true" />} 알림 전송
        </Button>
      </div>
    </div>
  );
}
