import { useEffect, useMemo } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { type LogicGraphDetail, type LogicNode, type LogicRunSnapshot, useLogicPageBridge, useLogicStore } from "./logic-store";
import { Badge, Button, Textarea, cn } from "../../components/ui/primitives";

function nodeTitle(nodeId: string, fallback: string): string {
  return fallback || nodeId;
}
function compactText(value: string, max = 28): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function statusForNode(snapshot: LogicRunSnapshot | null, nodeId: string): string {
  return snapshot?.nodes.find((node) => node.nodeId === nodeId)?.status || "";
}

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const value = status.toLowerCase();
  if (/(completed|done|ok)/.test(value)) return "success";
  if (/(running|pending|waiting)/.test(value)) return "primary";
  if (/(failed|error|blocked)/.test(value)) return "destructive";
  if (/(canceled|stale|timeout)/.test(value)) return "warning";
  return status ? "outline" : "default";
}

const SECTION_TITLE = "pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

type CanvasNode = LogicNode & { canvasX: number; canvasY: number; canvasWidth: number; canvasHeight: number; status: string };

function LogicCanvas({ graph, snapshot }: { graph: LogicGraphDetail; snapshot: LogicRunSnapshot | null }) {
  const canvas = useMemo(() => {
    const hasSavedPosition = graph.nodes.some((node) => node.position.x !== 0 || node.position.y !== 0);
    const rawNodes = graph.nodes.map((node, index) => {
      const canvasWidth = Math.max(168, Math.min(260, node.size.width || 188));
      const canvasHeight = Math.max(96, Math.min(160, node.size.height || 112));
      return {
        ...node,
        rawX: hasSavedPosition ? node.position.x : (index % 3) * 280,
        rawY: hasSavedPosition ? node.position.y : Math.floor(index / 3) * 176,
        canvasWidth,
        canvasHeight,
        status: statusForNode(snapshot, node.nodeId)
      };
    });
    const minX = Math.min(0, ...rawNodes.map((node) => node.rawX));
    const minY = Math.min(0, ...rawNodes.map((node) => node.rawY));
    const padding = 44;
    const nodes: CanvasNode[] = rawNodes.map((node) => ({ ...node, canvasX: node.rawX - minX + padding, canvasY: node.rawY - minY + padding }));
    const maxX = Math.max(560, ...nodes.map((node) => node.canvasX + node.canvasWidth + padding));
    const maxY = Math.max(340, ...nodes.map((node) => node.canvasY + node.canvasHeight + padding));
    return { nodes, width: maxX, height: maxY };
  }, [graph.nodes, snapshot]);

  const nodeMap = new Map(canvas.nodes.map((node) => [node.nodeId, node]));

  return (
    <div className="overflow-auto rounded-lg border border-border bg-muted/30 p-2">
      <svg className="h-auto w-full" viewBox={`0 0 ${canvas.width} ${canvas.height}`} role="img" aria-label="Logic graph canvas">
        <defs>
          <marker id="logic-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-border-strong" />
          </marker>
        </defs>
        {graph.edges.map((edge) => {
          const source = nodeMap.get(edge.sourceNodeId);
          const target = nodeMap.get(edge.targetNodeId);
          if (!source || !target) return null;
          const x1 = source.canvasX + source.canvasWidth;
          const y1 = source.canvasY + source.canvasHeight / 2;
          const x2 = target.canvasX;
          const y2 = target.canvasY + target.canvasHeight / 2;
          const handle = Math.max(70, Math.abs(x2 - x1) * 0.42);
          return (
            <path
              key={edge.edgeId || `${edge.sourceNodeId}-${edge.targetNodeId}`}
              className="fill-none stroke-border-strong"
              strokeWidth={1.5}
              d={`M ${x1} ${y1} C ${x1 + handle} ${y1}, ${x2 - handle} ${y2}, ${x2} ${y2}`}
              markerEnd="url(#logic-arrow)"
            />
          );
        })}
        {canvas.nodes.map((node) => (
          <g key={node.nodeId} transform={`translate(${node.canvasX} ${node.canvasY})`} className={node.enabled ? "" : "opacity-50"}>
            <rect width={node.canvasWidth} height={node.canvasHeight} rx="12" className={cn("fill-card stroke-border", node.status === "completed" ? "stroke-success" : node.status === "running" ? "stroke-primary" : node.status === "failed" ? "stroke-destructive" : "")} strokeWidth={1.5} />
            <text x="16" y="28" className="fill-foreground text-[13px] font-semibold">{compactText(nodeTitle(node.nodeId, node.title), 30)}</text>
            <text x="16" y="50" className="fill-muted-foreground text-[11px]">{compactText(node.type || "node", 24)}</text>
            <circle cx="0" cy={node.canvasHeight / 2} r="5" className="fill-primary" />
            <circle cx={node.canvasWidth} cy={node.canvasHeight / 2} r="5" className="fill-primary" />
            {node.status ? <text x="16" y={node.canvasHeight - 16} className="fill-muted-foreground text-[11px]">{compactText(node.status, 20)}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function LogicPage() {
  useLogicPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useLogicStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const graph = store.graph;
  const snapshot = store.runSnapshot;

  useEffect(() => {
    if (canRequest) {
      store.loadGraphs();
      store.loadRecovery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[560px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">로직</h1>
        <p className="text-sm text-muted-foreground">그래프 목록, 노드/엣지 구조, 실행 입력과 run 결과를 실제 WS 계약 기준으로 표시합니다.</p>
      </div>
      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <CardBoundary title="Logic graph 목록" card="navigation" onError={recordCardError}>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={store.loadGraphs} disabled={!canRequest || store.loadingList}>
              {store.loadingList ? "목록 조회 중" : "목록 새로고침"}
            </Button>
            <Button variant="outline" size="sm" onClick={store.loadRecovery} disabled={!canRequest || store.loadingRecovery}>
              {store.loadingRecovery ? "복구 조회 중" : "복구"}
            </Button>
          </div>
          {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
          <div className="rounded-md border border-border bg-muted/30 p-2">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">복구 후보</span>
              <Badge tone={store.recoveryItems.length > 0 ? "warning" : "outline"}>{store.recoveryItems.length}</Badge>
            </div>
            <div className="space-y-1">
              {store.recoveryItems.slice(0, 3).map((item) => (
                <button
                  key={item.runId}
                  type="button"
                  onClick={() => store.openRecoveryRun(item)}
                  disabled={!canRequest}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{item.title || item.graphId}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {`${item.completedNodeCount} done · ${item.pendingNodeCount} pending${item.errorNodeCount ? ` · ${item.errorNodeCount} errors` : ""}`}
                    </span>
                  </span>
                  <Badge tone={statusTone(item.status)}>{item.status || "run"}</Badge>
                </button>
              ))}
              {store.recoveryItems.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">미완료 run 없음</p> : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {store.graphs.map((item) => (
              <button
                key={item.graphId}
                type="button"
                onClick={() => store.openGraph(item.graphId)}
                disabled={!canRequest}
                className={cn("flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors", item.graphId === store.selectedGraphId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60")}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{`${item.nodeCount} nodes · ${item.edgeCount} edges${item.scheduleKind ? ` · ${item.scheduleKind}` : ""}`}</div>
                </div>
                <Badge tone="outline" className="shrink-0">{item.lastStatus || (item.enabled ? "enabled" : "disabled")}</Badge>
              </button>
            ))}
            {store.graphs.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">logic graph 없음</p> : null}
          </div>
        </CardBoundary>

        <CardBoundary title="그래프 구조" card="operations" onError={recordCardError}>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={store.runGraph} disabled={!canRequest || !store.selectedGraphId || store.running}>{store.running ? "실행 중…" : "실행"}</Button>
            <Button variant="outline" size="sm" onClick={store.cancelRun} disabled={!canRequest || !snapshot?.runId || !store.running}>취소</Button>
            <Button variant="outline" size="sm" onClick={store.saveGraph} disabled={!canRequest || !store.graphJson.trim() || store.loadingGraph}>저장</Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={store.deleteGraph} disabled={!canRequest || !store.selectedGraphId || store.loadingGraph}>삭제</Button>
          </div>
          <Textarea rows={2} value={store.runInput} placeholder="logicRunInput 선택 입력" onChange={(event) => store.setRunInput(event.target.value)} />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {store.loadingGraph ? (
              <p className="py-6 text-center text-xs text-muted-foreground">그래프 불러오는 중…</p>
            ) : !graph ? (
              <p className="py-6 text-center text-xs text-muted-foreground">왼쪽에서 graph를 선택하세요.</p>
            ) : (
              <>
                <div className={SECTION_TITLE}>캔버스</div>
                <LogicCanvas graph={graph} snapshot={snapshot} />
                <div className={SECTION_TITLE}>노드 {graph.nodes.length}</div>
                <div className="space-y-2">
                  {graph.nodes.map((node) => (
                    <div key={node.nodeId} className="rounded-md border border-border bg-card/60 p-2.5">
                      <div className="flex items-center gap-2">
                        <Badge tone="primary">{node.type || "node"}</Badge>
                        <strong className="truncate text-sm">{nodeTitle(node.nodeId, node.title)}</strong>
                        {node.enabled ? null : <Badge tone="outline">disabled</Badge>}
                      </div>
                      {Object.keys(node.config).length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {Object.entries(node.config).slice(0, 6).map(([key, value]) => (
                            <span key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              <span className="text-foreground">{key}</span>: {value.length > 60 ? `${value.slice(0, 60)}…` : value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {graph.nodes.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">노드 없음</p> : null}
                </div>
                <div className={SECTION_TITLE}>엣지 {graph.edges.length}</div>
                <div className="space-y-1">
                  {graph.edges.map((edge) => (
                    <div key={edge.edgeId || `${edge.sourceNodeId}-${edge.targetNodeId}`} className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{edge.sourceNodeId}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-mono">{edge.targetNodeId}</span>
                      {edge.sourcePort !== "main" || edge.targetPort !== "main" ? <span className="text-muted-foreground">{`(${edge.sourcePort} → ${edge.targetPort})`}</span> : null}
                    </div>
                  ))}
                  {graph.edges.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">엣지 없음</p> : null}
                </div>
                <div className={SECTION_TITLE}>그래프 JSON</div>
                <Textarea rows={5} className="font-mono text-[11px]" value={store.graphJson} onChange={(event) => store.setGraphJson(event.target.value)} />
              </>
            )}

            {snapshot ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">run</span>
                  <strong className="font-mono">{`${snapshot.runId} · ${snapshot.status}`}</strong>
                </div>
                {snapshot.error ? <p className="text-xs text-destructive">{snapshot.error}</p> : null}
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.nodes.map((node) => (
                    <Badge key={node.nodeId} tone="outline">{`${nodeTitle(node.nodeId, node.title)}: ${node.status}`}</Badge>
                  ))}
                </div>
                {snapshot.resultText ? <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2.5 font-mono text-[11px]">{snapshot.resultText}</pre> : null}
              </div>
            ) : null}
          </div>
        </CardBoundary>
      </section>
    </div>
  );
}
