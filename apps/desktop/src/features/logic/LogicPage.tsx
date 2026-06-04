import { useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  FolderOpen,
  FileText,
  Link2,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Square,
  Trash2,
  Workflow,
  X
} from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import {
  type EditableEdge,
  type EditableGraph,
  type EditableNode,
  type LogicPathEntry,
  type LogicPathSnapshot,
  type LogicRunSnapshot,
  useLogicPageBridge,
  useLogicStore
} from "./logic-store";
import {
  LOGIC_BASE_REFERENCES,
  LOGIC_NODE_DEFS,
  LOGIC_NODE_GROUPS,
  LOGIC_NODE_TYPE_LABELS,
  LOGIC_OPERATOR_OPTIONS,
  getLogicNodeDef
} from "./logic-node-library";
import { Badge, Button, Input, Textarea, cn } from "../../components/ui/primitives";
import { ContextPickerPanel } from "../context-picker/ContextPickerPanel";
import { appendContextSelectionBundle, type ContextPickerSelection } from "../context-picker/context-picker-store";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const SECTION_TITLE = "text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

function statusTone(status: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const value = status.toLowerCase();
  if (/(completed|done|ok)/.test(value)) return "success";
  if (/(running|pending|waiting)/.test(value)) return "primary";
  if (/(failed|error|blocked)/.test(value)) return "destructive";
  if (/(canceled|stale|timeout)/.test(value)) return "warning";
  return status ? "outline" : "default";
}

function statusForNode(snapshot: LogicRunSnapshot | null, nodeId: string): string {
  return snapshot?.nodes.find((node) => node.nodeId === nodeId)?.status || "";
}

function applyContextToLogicSelection(items: ContextPickerSelection[]) {
  const state = useLogicStore.getState();
  const target = state.editor?.nodes.find((node) => node.nodeId === state.selectedNodeId) || null;
  const primary = items[0];
  if (!primary) return;
  if (!target) {
    state.setRunInput(appendContextSelectionBundle(state.runInput, items));
    return;
  }
  const value = primary.path || primary.title;
  const def = getLogicNodeDef(target.type);
  const hasField = (key: string) => !!def?.fields.some((field) => field.key === key) || key in target.config;

  if (primary.kind === "memory" && hasField("noteName")) {
    state.setNodeConfig(target.nodeId, "noteName", value);
  } else if ((primary.kind === "workspace" || primary.kind === "path") && hasField("path")) {
    state.setNodeConfig(target.nodeId, "path", value);
  } else if (hasField("query")) {
    state.setNodeConfig(target.nodeId, "query", primary.detail || value);
  } else if (hasField("input")) {
    state.setNodeConfig(target.nodeId, "input", appendContextSelectionBundle(target.config.input || "", items));
  } else if (hasField("task")) {
    state.setNodeConfig(target.nodeId, "task", appendContextSelectionBundle(target.config.task || "", items));
  } else {
    state.setRunInput(appendContextSelectionBundle(state.runInput, items));
  }
}

/* ============================ 캔버스 기하 ============================ */

function clampSize(node: EditableNode) {
  return {
    width: Math.max(160, Math.min(360, node.size.width || 188)),
    height: Math.max(92, Math.min(260, node.size.height || 120))
  };
}

function outputPortPosition(node: EditableNode, port: string) {
  const def = getLogicNodeDef(node.type);
  const ports = def?.sourcePorts.length ? def.sourcePorts : ["main"];
  const size = clampSize(node);
  const index = Math.max(0, ports.indexOf(port));
  const y = node.position.y + (size.height * (index + 1)) / (ports.length + 1);
  return { x: node.position.x + size.width, y };
}

function inputPortPosition(node: EditableNode) {
  const size = clampSize(node);
  return { x: node.position.x, y: node.position.y + size.height / 2 };
}

function bezierPath(sx: number, sy: number, tx: number, ty: number) {
  const handle = Math.max(60, Math.abs(tx - sx) * 0.45);
  return `M ${sx} ${sy} C ${sx + handle} ${sy}, ${tx - handle} ${ty}, ${tx} ${ty}`;
}

type DragState = { nodeId: string; grabDX: number; grabDY: number; x: number; y: number };
type ResizeState = { nodeId: string; startX: number; startY: number; startWidth: number; startHeight: number; width: number; height: number };
type LinkState = { sourceNodeId: string; sourcePort: string; x: number; y: number };

function LogicCanvas({
  graph,
  snapshot,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onMoveNode,
  onResizeNode,
  onConnect
}: {
  graph: EditableGraph;
  snapshot: LogicRunSnapshot | null;
  selectedNodeId: string;
  selectedEdgeId: string;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  onClearSelection: () => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onResizeNode: (nodeId: string, width: number, height: number) => void;
  onConnect: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const linkRef = useRef<LinkState | null>(null);
  const [session, setSession] = useState<"none" | "drag" | "resize" | "link">("none");
  const [, tick] = useReducer((x: number) => x + 1, 0);

  function toSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const mapped = point.matrixTransform(ctm.inverse());
    return { x: mapped.x, y: mapped.y };
  }

  useEffect(() => {
    if (session === "none") return;
    function move(event: PointerEvent) {
      const point = toSvg(event.clientX, event.clientY);
      if (dragRef.current) {
        dragRef.current = { ...dragRef.current, x: point.x - dragRef.current.grabDX, y: point.y - dragRef.current.grabDY };
        tick();
      } else if (resizeRef.current) {
        const nextWidth = Math.max(160, Math.min(360, resizeRef.current.startWidth + point.x - resizeRef.current.startX));
        const nextHeight = Math.max(92, Math.min(260, resizeRef.current.startHeight + point.y - resizeRef.current.startY));
        resizeRef.current = { ...resizeRef.current, width: nextWidth, height: nextHeight };
        tick();
      } else if (linkRef.current) {
        linkRef.current = { ...linkRef.current, x: point.x, y: point.y };
        tick();
      }
    }
    function up(event: PointerEvent) {
      if (dragRef.current) {
        onMoveNode(dragRef.current.nodeId, dragRef.current.x, dragRef.current.y);
        dragRef.current = null;
      } else if (resizeRef.current) {
        onResizeNode(resizeRef.current.nodeId, resizeRef.current.width, resizeRef.current.height);
        resizeRef.current = null;
      } else if (linkRef.current) {
        const element = document.elementFromPoint(event.clientX, event.clientY) as Element | null;
        const portEl = element?.closest("[data-input-node]") as Element | null;
        const targetNodeId = portEl?.getAttribute("data-input-node") || "";
        const targetPort = portEl?.getAttribute("data-input-port") || "main";
        if (targetNodeId) onConnect(linkRef.current.sourceNodeId, linkRef.current.sourcePort, targetNodeId, targetPort);
        linkRef.current = null;
      }
      setSession("none");
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function startNodeDrag(event: ReactPointerEvent, node: EditableNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelectNode(node.nodeId);
    const point = toSvg(event.clientX, event.clientY);
    dragRef.current = { nodeId: node.nodeId, grabDX: point.x - node.position.x, grabDY: point.y - node.position.y, x: node.position.x, y: node.position.y };
    setSession("drag");
  }

  function startLink(event: ReactPointerEvent, node: EditableNode, port: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const point = toSvg(event.clientX, event.clientY);
    linkRef.current = { sourceNodeId: node.nodeId, sourcePort: port, x: point.x, y: point.y };
    setSession("link");
  }

  function startResize(event: ReactPointerEvent, node: EditableNode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    onSelectNode(node.nodeId);
    const point = toSvg(event.clientX, event.clientY);
    const size = clampSize(node);
    resizeRef.current = {
      nodeId: node.nodeId,
      startX: point.x,
      startY: point.y,
      startWidth: size.width,
      startHeight: size.height,
      width: size.width,
      height: size.height
    };
    setSession("resize");
  }

  // 드래그 중인 노드는 ref 위치로 렌더.
  const renderNodes = graph.nodes.map((node) =>
    dragRef.current && dragRef.current.nodeId === node.nodeId
      ? { ...node, position: { x: dragRef.current.x, y: dragRef.current.y } }
      : resizeRef.current && resizeRef.current.nodeId === node.nodeId
        ? { ...node, size: { width: resizeRef.current.width, height: resizeRef.current.height } }
      : node
  );
  const nodeMap = new Map(renderNodes.map((node) => [node.nodeId, node]));

  const padding = 48;
  const width = Math.max(720, ...renderNodes.map((node) => node.position.x + clampSize(node).width + padding));
  const height = Math.max(420, ...renderNodes.map((node) => node.position.y + clampSize(node).height + padding));

  const link = linkRef.current;
  const linkSource = link ? nodeMap.get(link.sourceNodeId) : null;
  const linkStart = linkSource ? outputPortPosition(linkSource, link!.sourcePort) : null;

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/20 [background-image:radial-gradient(circle,_color-mix(in_oklab,var(--color-border)_70%,transparent)_1px,transparent_1px)] [background-size:22px_22px]">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label="Logic graph 편집 캔버스"
        onPointerDown={() => onClearSelection()}
      >
        <defs>
          <marker id="logic-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
        </defs>

        {graph.edges.map((edge) => {
          const source = nodeMap.get(edge.sourceNodeId);
          const target = nodeMap.get(edge.targetNodeId);
          if (!source || !target) return null;
          const start = outputPortPosition(source, edge.sourcePort);
          const end = inputPortPosition(target);
          const selected = edge.edgeId === selectedEdgeId;
          return (
            <g key={edge.edgeId} className="cursor-pointer" onPointerDown={(event) => { event.stopPropagation(); onSelectEdge(edge.edgeId); }}>
              <path d={bezierPath(start.x, start.y, end.x, end.y)} className="fill-none stroke-transparent" strokeWidth={14} />
              <path
                d={bezierPath(start.x, start.y, end.x, end.y)}
                className={cn("pointer-events-none fill-none", selected ? "stroke-primary" : "stroke-muted-foreground")}
                strokeWidth={selected ? 2.5 : 1.5}
                markerEnd="url(#logic-arrow)"
              />
              {edge.sourcePort !== "main" ? (
                <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 6} textAnchor="middle" className="pointer-events-none fill-muted-foreground text-[10px] font-medium">
                  {edge.sourcePort}
                </text>
              ) : null}
            </g>
          );
        })}

        {link && linkStart ? (
          <path d={bezierPath(linkStart.x, linkStart.y, link.x, link.y)} className="pointer-events-none fill-none stroke-primary" strokeWidth={2} strokeDasharray="5 4" />
        ) : null}

        {renderNodes.map((node) => {
          const def = getLogicNodeDef(node.type);
          const size = clampSize(node);
          const status = statusForNode(snapshot, node.nodeId);
          const selected = node.nodeId === selectedNodeId;
          const ports = def?.sourcePorts.length ? def.sourcePorts : node.type === "end" || node.type === "output" ? [] : ["main"];
          const showInput = node.type !== "start";
          return (
            <g key={node.nodeId} transform={`translate(${node.position.x} ${node.position.y})`} className={node.enabled ? "" : "opacity-50"}>
              <rect
                width={size.width}
                height={size.height}
                rx="12"
                className={cn(
                  "cursor-grab fill-card",
                  selected ? "stroke-primary" : status === "completed" ? "stroke-success" : status === "running" ? "stroke-primary" : status === "failed" ? "stroke-destructive" : "stroke-border"
                )}
                strokeWidth={selected ? 2.5 : 1.5}
                onPointerDown={(event) => startNodeDrag(event, node)}
              />
              <text x={14} y={26} className="pointer-events-none fill-foreground text-[13px] font-semibold">
                {(node.title || node.nodeId).slice(0, 26)}
              </text>
              <text x={14} y={45} className="pointer-events-none fill-muted-foreground text-[10px]">
                {LOGIC_NODE_TYPE_LABELS[node.type] || node.type} · {node.nodeId.slice(0, 18)}
              </text>
              {status ? (
                <text x={14} y={size.height - 14} className="pointer-events-none fill-muted-foreground text-[10px]">
                  {status}
                </text>
              ) : null}

              {showInput ? (
                <circle
                  cx={0}
                  cy={size.height / 2}
                  r={7}
                  className="fill-primary/30 stroke-primary/70 transition-colors hover:fill-primary/60"
                  strokeWidth={1.5}
                  data-input-node={node.nodeId}
                  data-input-port="main"
                />
              ) : null}

              {ports.map((port) => {
                const pos = outputPortPosition(node, port);
                const localY = pos.y - node.position.y;
                return (
                  <g key={port}>
                    <circle
                      cx={size.width}
                      cy={localY}
                      r={7}
                      className="cursor-crosshair fill-primary stroke-card transition-transform hover:scale-110"
                      strokeWidth={1.5}
                      onPointerDown={(event) => startLink(event, node, port)}
                    />
                    {port !== "main" ? (
                      <text x={size.width - 10} y={localY + 3} textAnchor="end" className="pointer-events-none fill-muted-foreground text-[9px] font-medium">
                        {port}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {selected ? (
                <g
                  className="cursor-nwse-resize"
                  onPointerDown={(event) => startResize(event, node)}
                  aria-label="노드 크기 조절"
                >
                  <rect x={size.width - 17} y={size.height - 17} width={17} height={17} rx={5} className="fill-primary/15 stroke-primary/40 hover:fill-primary/25" />
                  <path d={`M ${size.width - 12} ${size.height - 6} L ${size.width - 6} ${size.height - 12} M ${size.width - 8} ${size.height - 5} L ${size.width - 5} ${size.height - 8}`} className="pointer-events-none stroke-primary" strokeWidth={1.5} />
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ============================ 경로 브라우저 ============================ */

function bestPathField(node: EditableNode | null): string {
  if (!node) return "";
  const def = getLogicNodeDef(node.type);
  const keys = new Set([...(def?.fields.map((field) => field.key) || []), ...Object.keys(node.config)]);
  for (const key of ["path", "noteName", "url", "targetUrl", "input", "task", "query"]) {
    if (keys.has(key)) return key;
  }
  return "";
}

function LogicPathBrowserPanel({
  snapshot,
  selectedNode,
  canRequest
}: {
  snapshot: LogicPathSnapshot | null;
  selectedNode: EditableNode | null;
  canRequest: boolean;
}) {
  const store = useLogicStore();
  const pathState = store.pathBrowser;
  const targetField = bestPathField(selectedNode);
  const currentRoot = pathState.rootKey || snapshot?.rootKey || (pathState.scope === "workspace" ? "workspace" : "");

  function applyPath(entry: LogicPathEntry) {
    const value = entry.selectPath || entry.browsePath || entry.name;
    if (!value) return;
    if (selectedNode && targetField) {
      store.setNodeConfig(selectedNode.nodeId, targetField, value);
    } else {
      store.setRunInput(`${store.runInput}${store.runInput.trim() ? "\n" : ""}${value}`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        <select
          className={SELECT_CLASS}
          value={pathState.scope}
          onChange={(event) => {
            const nextScope = event.target.value;
            store.setPathScope(nextScope);
            store.loadLogicPath("", nextScope === "workspace" ? "workspace" : "", nextScope);
          }}
        >
          <option value="workspace">workspace</option>
          <option value="memory">memory</option>
        </select>
        <select
          className={SELECT_CLASS}
          value={currentRoot}
          onChange={(event) => store.loadLogicPath("", event.target.value, pathState.scope)}
          disabled={!snapshot?.roots.length && pathState.scope === "workspace"}
        >
          {snapshot?.roots.length ? snapshot.roots.map((root) => <option key={root.key} value={root.key}>{root.label || root.key}</option>) : <option value={currentRoot}>{currentRoot || "root"}</option>}
        </select>
        <Button variant="outline" size="sm" disabled={!canRequest || pathState.loading} onClick={() => store.loadLogicPath()}>
          <RefreshCcw size={13} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Badge tone="outline" className="max-w-full truncate">{snapshot?.displayPath || pathState.browsePath || "/"}</Badge>
        {targetField ? <Badge tone="primary">{selectedNode?.nodeId}.{targetField}</Badge> : <Badge tone="outline">run input</Badge>}
      </div>
      {pathState.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{pathState.lastError}</p> : null}
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canRequest || !snapshot?.parentBrowsePath}
          onClick={() => store.loadLogicPath(snapshot?.parentBrowsePath || "", snapshot?.rootKey || currentRoot, snapshot?.scope || pathState.scope)}
        >
          <ChevronUp size={13} aria-hidden="true" /> 상위
        </Button>
        {snapshot?.directorySelectPath ? (
          <Button variant="outline" size="sm" onClick={() => store.setRunInput(`${store.runInput}${store.runInput.trim() ? "\n" : ""}${snapshot.directorySelectPath}`)}>
            현재 폴더 삽입
          </Button>
        ) : null}
      </div>
      <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
        {pathState.loading ? <p className="py-4 text-center text-xs text-muted-foreground">경로를 조회 중입니다.</p> : null}
        {(snapshot?.items || []).map((entry) => (
          <div key={`${entry.isDirectory ? "d" : "f"}-${entry.browsePath || entry.selectPath || entry.name}`} className="flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2 py-1.5">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => entry.isDirectory ? store.loadLogicPath(entry.browsePath, snapshot?.rootKey || currentRoot, snapshot?.scope || pathState.scope) : applyPath(entry)}
            >
              {entry.isDirectory ? <FolderOpen size={14} className="shrink-0 text-primary" aria-hidden="true" /> : <FileText size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">{entry.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{entry.description || entry.selectPath || entry.browsePath}</span>
              </span>
            </button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => applyPath(entry)}>
              삽입
            </Button>
          </div>
        ))}
        {snapshot && snapshot.items.length === 0 && !pathState.loading ? <p className="py-4 text-center text-xs text-muted-foreground">표시할 경로가 없습니다.</p> : null}
        {!snapshot && !pathState.loading ? <p className="py-4 text-center text-xs text-muted-foreground">새로고침하면 workspace/memory 경로가 표시됩니다.</p> : null}
      </div>
    </div>
  );
}

/* ============================ 실행 I/O 상세 ============================ */

function formatRunTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function RunIoDetailPanel({ snapshot, selectedNodeId }: { snapshot: LogicRunSnapshot | null; selectedNodeId: string }) {
  if (!snapshot) return <p className="py-8 text-center text-xs text-muted-foreground">그래프를 실행하면 노드별 입력·출력 상세가 표시됩니다.</p>;
  const selected = snapshot.nodes.find((node) => node.nodeId === selectedNodeId) || snapshot.nodes[0] || null;
  if (!selected) return <p className="py-8 text-center text-xs text-muted-foreground">실행 노드 결과가 없습니다.</p>;
  const result = selected.result;
  const dataEntries = Object.entries(result?.data || {});
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Badge tone={statusTone(snapshot.status)}>{snapshot.status || "run"}</Badge>
        <Badge tone="outline" className="max-w-full truncate font-mono">{snapshot.runId}</Badge>
      </div>
      <div className="space-y-1">
        {snapshot.nodes.map((node) => (
          <button
            key={node.nodeId}
            type="button"
            onClick={() => useLogicStore.getState().selectNode(node.nodeId)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
              node.nodeId === selected.nodeId ? "border-primary/50 bg-primary/10" : "border-border bg-card/60 hover:bg-accent"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{node.title || node.nodeId}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{node.type} · {formatRunTime(node.startedAtUtc)} → {formatRunTime(node.completedAtUtc)}</span>
            </span>
            <Badge tone={statusTone(node.status)}>{node.status || "-"}</Badge>
          </button>
        ))}
      </div>
      <div className="rounded-md border border-border bg-muted/25 p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold">{selected.title || selected.nodeId}</p>
          <Badge tone={result?.ok === false ? "destructive" : statusTone(selected.status)}>{result?.type || selected.status || "result"}</Badge>
        </div>
        {selected.error ? <p className="mb-2 rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">{selected.error}</p> : null}
        {result?.text ? (
          <div className="space-y-1">
            <p className={SECTION_TITLE}>출력 텍스트</p>
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[11px]">{result.text}</pre>
          </div>
        ) : <p className="py-2 text-center text-xs text-muted-foreground">출력 텍스트 없음</p>}
      </div>
      {dataEntries.length > 0 ? (
        <div className="space-y-1">
          <p className={SECTION_TITLE}>데이터</p>
          {dataEntries.slice(0, 12).map(([key, value]) => (
            <div key={key} className="rounded-md border border-border bg-card/60 p-2">
              <p className="truncate font-mono text-[10px] text-muted-foreground">{key}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {result?.artifacts.length || result?.links.length || result?.conversationId || result?.sessionKey ? (
        <div className="flex flex-wrap gap-1">
          {result.conversationId ? <Badge tone="outline" className="max-w-full truncate">conversation {result.conversationId}</Badge> : null}
          {result.sessionKey ? <Badge tone="outline" className="max-w-full truncate">session {result.sessionKey}</Badge> : null}
          {result.artifacts.slice(0, 6).map((item) => <Badge key={`artifact-${item}`} tone="primary" className="max-w-full truncate">{item}</Badge>)}
          {result.links.slice(0, 6).map((item) => <Badge key={`link-${item}`} tone="outline" className="max-w-full truncate">{item}</Badge>)}
        </div>
      ) : null}
      {snapshot.logs.length > 0 ? (
        <div className="space-y-1">
          <p className={SECTION_TITLE}>최근 로그</p>
          <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-background/60 p-2 font-mono text-[10px]">{snapshot.logs.slice(-8).join("\n")}</pre>
        </div>
      ) : null}
    </div>
  );
}

/* ============================ 노드 팔레트 ============================ */

function NodePalette({ onAdd, onClose }: { onAdd: (type: string) => void; onClose: () => void }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-64 overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-[var(--shadow-card)] backdrop-blur-xl">
      {LOGIC_NODE_GROUPS.map((group) => (
        <div key={group.key} className="mb-2 last:mb-0">
          <p className={cn(SECTION_TITLE, "px-1.5 py-1")}>{group.label}</p>
          <div className="space-y-0.5">
            {group.types.map((type) => {
              const def = LOGIC_NODE_DEFS[type];
              return (
                <button
                  key={type}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  onClick={() => {
                    onAdd(type);
                    onClose();
                  }}
                >
                  <span className="truncate font-medium">{def.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{type}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================ 인스펙터: 노드 ============================ */

function NodeInspector({ node }: { node: EditableNode }) {
  const store = useLogicStore();
  const def = getLogicNodeDef(node.type);
  const [focusedKey, setFocusedKey] = useState("");
  const [newKey, setNewKey] = useState("");
  const referenceTokens = [
    ...LOGIC_BASE_REFERENCES,
    ...store.editor?.nodes.filter((other) => other.nodeId !== node.nodeId).map((other) => ({ token: `{{nodes.${other.nodeId}.text}}`, label: other.title || other.nodeId })) || []
  ];
  const schemaKeys = new Set((def?.fields || []).map((field) => field.key));
  const extraKeys = Object.keys(node.config).filter((key) => !schemaKeys.has(key));

  function insertReference(token: string) {
    if (!focusedKey) return;
    store.setNodeConfig(node.nodeId, focusedKey, `${node.config[focusedKey] || ""}${token}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="primary">{def?.label || node.type}</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={store.deleteSelectedNode}
          disabled={node.type === "start"}
          title={node.type === "start" ? "시작 노드는 삭제할 수 없습니다" : "노드 삭제"}
        >
          <Trash2 size={14} aria-hidden="true" /> 삭제
        </Button>
      </div>
      {def?.description ? <p className="text-xs text-muted-foreground">{def.description}</p> : null}

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">이름</span>
        <Input value={node.title} onChange={(event) => store.setNodeTitle(node.nodeId, event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={node.enabled} onChange={(event) => store.setNodeEnabled(node.nodeId, event.target.checked)} /> 사용
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={node.continueOnError} onChange={(event) => store.setNodeContinueOnError(node.nodeId, event.target.checked)} /> 오류 무시하고 계속
        </label>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{node.nodeId}</span>
      </div>

      {referenceTokens.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">참조 삽입 {focusedKey ? `→ ${focusedKey}` : "(필드를 먼저 클릭)"}</p>
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
            {referenceTokens.slice(0, 16).map((ref) => (
              <button
                key={ref.token}
                type="button"
                disabled={!focusedKey}
                title={ref.token}
                className="rounded bg-background/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                onClick={() => insertReference(ref.token)}
              >
                {ref.label.length > 14 ? `${ref.label.slice(0, 13)}…` : ref.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {(def?.fields || []).map((field) => {
          const value = node.config[field.key] ?? "";
          const onChange = (next: string) => store.setNodeConfig(node.nodeId, field.key, next);
          return (
            <label key={field.key} className="block">
              <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{field.label}</span>
              {field.control === "textarea" ? (
                <Textarea
                  rows={field.rows || 3}
                  value={value}
                  placeholder={field.placeholder}
                  onFocus={() => setFocusedKey(field.key)}
                  onChange={(event) => onChange(event.target.value)}
                  className="text-xs"
                />
              ) : field.control === "select" ? (
                <select className={SELECT_CLASS} value={value} onFocus={() => setFocusedKey(field.key)} onChange={(event) => onChange(event.target.value)}>
                  {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.control === "number" ? "number" : "text"}
                  value={value}
                  placeholder={field.placeholder}
                  onFocus={() => setFocusedKey(field.key)}
                  onChange={(event) => onChange(event.target.value)}
                />
              )}
            </label>
          );
        })}
      </div>

      <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
        <p className={SECTION_TITLE}>추가 설정 (고급)</p>
        {extraKeys.map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={key}>
              {key}
            </span>
            <Input
              value={node.config[key]}
              onFocus={() => setFocusedKey(key)}
              onChange={(event) => store.setNodeConfig(node.nodeId, key, event.target.value)}
              className="h-8 text-xs"
            />
            <button type="button" aria-label="설정 제거" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => store.removeNodeConfigKey(node.nodeId, key)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <Input value={newKey} placeholder="새 설정 키" onChange={(event) => setNewKey(event.target.value)} className="h-8 text-xs" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              store.addNodeConfigKey(node.nodeId, newKey);
              setNewKey("");
            }}
            disabled={!newKey.trim()}
          >
            <Plus size={13} aria-hidden="true" /> 추가
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================ 인스펙터: 엣지 ============================ */

function EdgeInspector({ edge, graph }: { edge: EditableEdge; graph: EditableGraph }) {
  const store = useLogicStore();
  const sourceNode = graph.nodes.find((node) => node.nodeId === edge.sourceNodeId);
  const targetNode = graph.nodes.find((node) => node.nodeId === edge.targetNodeId);
  const sourceDef = sourceNode ? getLogicNodeDef(sourceNode.type) : null;
  const sourcePorts = sourceDef?.sourcePorts.length ? sourceDef.sourcePorts : ["main"];
  const targetDef = targetNode ? getLogicNodeDef(targetNode.type) : null;
  const targetPorts = ["main", ...(targetDef?.bindablePorts || [])];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="primary">연결</Badge>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={store.deleteSelectedEdge}>
          <Trash2 size={14} aria-hidden="true" /> 삭제
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs">
        <span className="truncate font-medium">{sourceNode?.title || edge.sourceNodeId}</span>
        <span className="text-muted-foreground">→</span>
        <span className="truncate font-medium">{targetNode?.title || edge.targetNodeId}</span>
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">출력 포트</span>
          <select className={SELECT_CLASS} value={edge.sourcePort} onChange={(event) => store.setEdgePort(edge.edgeId, "sourcePort", event.target.value)}>
            {(sourcePorts.includes(edge.sourcePort) ? sourcePorts : [edge.sourcePort, ...sourcePorts]).map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">입력 포트</span>
          <select className={SELECT_CLASS} value={edge.targetPort} onChange={(event) => store.setEdgePort(edge.edgeId, "targetPort", event.target.value)}>
            {(targetPorts.includes(edge.targetPort) ? targetPorts : [edge.targetPort, ...targetPorts]).map((port) => (
              <option key={port} value={port}>
                {port}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={edge.condition !== null}
            onChange={(event) => store.setEdgeCondition(edge.edgeId, event.target.checked ? {} : null)}
          />
          조건부 연결
        </label>
        {edge.condition ? (
          <div className="mt-2 space-y-2">
            <Input value={edge.condition.leftRef} placeholder="비교할 값 / 참조" onChange={(event) => store.setEdgeCondition(edge.edgeId, { leftRef: event.target.value })} />
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <select className={SELECT_CLASS} value={edge.condition.operator} onChange={(event) => store.setEdgeCondition(edge.edgeId, { operator: event.target.value })}>
                {LOGIC_OPERATOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Input value={edge.condition.rightValue} placeholder="비교 대상" onChange={(event) => store.setEdgeCondition(edge.edgeId, { rightValue: event.target.value })} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ============================ 그래프 설정 ============================ */

function GraphSettings({ graph }: { graph: EditableGraph }) {
  const store = useLogicStore();
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">제목</span>
        <Input value={graph.title} onChange={(event) => store.setGraphField("title", event.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-muted-foreground">설명</span>
        <Textarea rows={2} value={graph.description} onChange={(event) => store.setGraphField("description", event.target.value)} className="text-xs" />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={graph.enabled} onChange={(event) => store.setGraphEnabled(event.target.checked)} /> 그래프 활성화
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">스케줄 모드</span>
          <select className={SELECT_CLASS} value={graph.schedule.scheduleSourceMode} onChange={(event) => store.setScheduleField("scheduleSourceMode", event.target.value)}>
            <option value="manual">수동</option>
            <option value="auto">자동</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">주기</span>
          <select className={SELECT_CLASS} value={graph.schedule.scheduleKind} onChange={(event) => store.setScheduleField("scheduleKind", event.target.value)}>
            <option value="daily">매일</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">시각</span>
          <Input value={graph.schedule.scheduleTime || ""} placeholder="08:00" onChange={(event) => store.setScheduleField("scheduleTime", event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">타임존</span>
          <Input value={graph.schedule.timezoneId} placeholder="Asia/Seoul" onChange={(event) => store.setScheduleField("timezoneId", event.target.value)} />
        </label>
      </div>
    </div>
  );
}

/* ============================ 페이지 ============================ */

export function LogicPage() {
  useLogicPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useLogicStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const editor = store.editor;
  const snapshot = store.runSnapshot;
  const [nodePaletteOpen, setNodePaletteOpen] = useState(false);
  const [rightTab, setRightTab] = useState<"inspector" | "settings" | "path" | "io" | "context" | "json">("inspector");

  const selectedNode = editor?.nodes.find((node) => node.nodeId === store.selectedNodeId) || null;
  const selectedEdge = editor?.edges.find((edge) => edge.edgeId === store.selectedEdgeId) || null;

  useEffect(() => {
    if (canRequest) {
      store.loadGraphs();
      store.loadRecovery();
      store.loadLogicPath();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  // 선택이 바뀌면 인스펙터 탭으로 전환.
  useEffect(() => {
    if (store.selectedNodeId || store.selectedEdgeId) setRightTab("inspector");
  }, [store.selectedNodeId, store.selectedEdgeId]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[600px] flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">로직</h1>
          <p className="text-sm text-muted-foreground">노드를 끌어다 배치하고 포트를 연결해 워크플로를 시각적으로 설계합니다.</p>
        </div>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        {/* 좌: 그래프 목록 */}
        <CardBoundary title="그래프" card="navigation" onError={recordCardError}>
          <div className="flex gap-1.5">
            <Button variant="primary" size="sm" className="flex-1" onClick={store.newGraph}>
              <FilePlus2 size={14} aria-hidden="true" /> 새 그래프
            </Button>
            <Button variant="outline" size="sm" onClick={store.loadGraphs} disabled={!canRequest || store.loadingList} title="목록 새로고침">
              <RefreshCcw size={14} aria-hidden="true" />
            </Button>
          </div>
          {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{store.lastError}</p> : null}
          {store.recoveryItems.length > 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-warning">복구 후보</span>
                <Badge tone="warning">{store.recoveryItems.length}</Badge>
              </div>
              <div className="space-y-1">
                {store.recoveryItems.slice(0, 3).map((item) => (
                  <button
                    key={item.runId}
                    type="button"
                    onClick={() => store.openRecoveryRun(item)}
                    disabled={!canRequest}
                    className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-accent/60"
                  >
                    <span className="min-w-0 truncate text-[11px] font-medium">{item.title || item.graphId}</span>
                    <Badge tone={statusTone(item.status)}>{item.status || "run"}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {store.graphs.map((item) => (
              <button
                key={item.graphId}
                type="button"
                onClick={() => store.openGraph(item.graphId)}
                disabled={!canRequest}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                  item.graphId === store.selectedGraphId ? "border-primary/50 bg-accent" : "border-transparent hover:bg-accent/60"
                )}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{`${item.nodeCount} nodes · ${item.edgeCount} edges`}</div>
                </div>
                <Badge tone="outline" className="shrink-0">{item.enabled ? "on" : "off"}</Badge>
              </button>
            ))}
            {store.graphs.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">logic graph 없음</p> : null}
          </div>
        </CardBoundary>

        {/* 중: 캔버스 */}
        <CardBoundary title="캔버스" card="operations" onError={recordCardError}>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="relative">
                <Button variant="outline" size="sm" onClick={() => setNodePaletteOpen((open) => !open)} disabled={!editor}>
                  <Plus size={14} aria-hidden="true" /> 노드 추가 <ChevronDown size={13} aria-hidden="true" />
                </Button>
                {nodePaletteOpen && editor ? <NodePalette onAdd={store.addNode} onClose={() => setNodePaletteOpen(false)} /> : null}
              </div>
              <div className="mx-1 h-5 w-px bg-border" />
              <Button variant="primary" size="sm" onClick={store.runGraph} disabled={!canRequest || !store.selectedGraphId || store.running}>
                {store.running ? <Square size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />} {store.running ? "실행 중" : "실행"}
              </Button>
              <Button variant="outline" size="sm" onClick={store.cancelRun} disabled={!canRequest || !snapshot?.runId || !store.running}>
                취소
              </Button>
              <Button variant="secondary" size="sm" onClick={store.saveGraph} disabled={!canRequest || !editor || store.loadingGraph}>
                <Save size={14} aria-hidden="true" /> {store.loadingGraph ? "저장 중" : "저장"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={store.deleteGraph}
                disabled={!canRequest || !store.selectedGraphId || store.loadingGraph}
              >
                <Trash2 size={14} aria-hidden="true" /> 그래프 삭제
              </Button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {editor ? `${editor.nodes.length} nodes · ${editor.edges.length} edges` : ""}
              </span>
            </div>

            {store.validationProblems.length > 0 ? (
              <p className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" /> {store.validationProblems[0]}
                {store.validationProblems.length > 1 ? <span className="text-warning/70">외 {store.validationProblems.length - 1}건</span> : null}
              </p>
            ) : null}

            {store.loadingGraph ? (
              <p className="py-10 text-center text-xs text-muted-foreground">그래프 불러오는 중…</p>
            ) : !editor ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Workflow size={22} aria-hidden="true" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">편집할 그래프가 없습니다</p>
                  <p className="text-xs text-muted-foreground">왼쪽에서 그래프를 선택하거나 새로 만드세요.</p>
                </div>
                <Button variant="primary" size="sm" onClick={store.newGraph}>
                  <FilePlus2 size={14} aria-hidden="true" /> 새 그래프 만들기
                </Button>
              </div>
            ) : (
              <LogicCanvas
                graph={editor}
                snapshot={snapshot}
                selectedNodeId={store.selectedNodeId}
                selectedEdgeId={store.selectedEdgeId}
                onSelectNode={store.selectNode}
                onSelectEdge={store.selectEdge}
                onClearSelection={store.clearSelection}
                onMoveNode={store.moveNode}
                onResizeNode={store.resizeNode}
                onConnect={store.connectNodes}
              />
            )}

            <Textarea rows={2} value={store.runInput} placeholder="실행 입력(logicRunInput) — 선택" onChange={(event) => store.setRunInput(event.target.value)} className="shrink-0 text-xs" />

            {snapshot ? (
              <div className="shrink-0 space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-2 text-xs">
                  <Badge tone={statusTone(snapshot.status)}>{snapshot.status || "run"}</Badge>
                  <span className="truncate font-mono text-muted-foreground">{snapshot.runId}</span>
                </div>
                {snapshot.error ? <p className="text-xs text-destructive">{snapshot.error}</p> : null}
                <div className="flex flex-wrap gap-1">
                  {snapshot.nodes.map((node) => (
                    <Badge key={node.nodeId} tone={statusTone(node.status)}>
                      {(node.title || node.nodeId).slice(0, 16)}: {node.status}
                    </Badge>
                  ))}
                </div>
                {snapshot.resultText ? (
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-background/60 p-2 font-mono text-[11px]">{snapshot.resultText}</pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardBoundary>

        {/* 우: 인스펙터 / 설정 / JSON */}
        <CardBoundary title="속성" card="operations" onError={recordCardError}>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex gap-1 rounded-md bg-muted/40 p-0.5 text-xs">
              {([
                ["inspector", "선택"],
                ["settings", "그래프"],
                ["path", "경로"],
                ["io", "I/O"],
                ["context", "문맥"],
                ["json", "JSON"]
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRightTab(key)}
                  className={cn(
                    "flex-1 rounded px-2 py-1 font-medium transition-colors",
                    rightTab === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              {rightTab === "path" ? (
                <LogicPathBrowserPanel
                  canRequest={canRequest}
                  selectedNode={selectedNode}
                  snapshot={store.pathBrowser.snapshot}
                />
              ) : rightTab === "io" ? (
                <RunIoDetailPanel snapshot={snapshot} selectedNodeId={store.selectedNodeId} />
              ) : rightTab === "context" ? (
                <ContextPickerPanel
                  canRequest={canRequest}
                  surface="logic"
                  applyLabel={selectedNode ? "노드에 적용" : "입력에 붙이기"}
                  onApply={applyContextToLogicSelection}
                />
              ) : !editor ? (
                <p className="py-8 text-center text-xs text-muted-foreground">그래프를 선택하세요.</p>
              ) : rightTab === "json" ? (
                <Textarea
                  rows={20}
                  className="h-full min-h-[320px] font-mono text-[11px]"
                  value={store.graphJson}
                  onChange={(event) => store.setGraphJson(event.target.value)}
                />
              ) : rightTab === "settings" ? (
                <GraphSettings graph={editor} />
              ) : selectedNode ? (
                <NodeInspector node={selectedNode} />
              ) : selectedEdge ? (
                <EdgeInspector edge={selectedEdge} graph={editor} />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Settings2 size={20} className="text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs text-muted-foreground">노드나 연결을 선택하면 여기서 편집합니다.</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Link2 size={12} aria-hidden="true" /> 출력 포트를 끌어 다른 노드의 입력에 놓으면 연결됩니다.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardBoundary>
      </section>
    </div>
  );
}
