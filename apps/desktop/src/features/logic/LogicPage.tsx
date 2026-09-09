import { useEffect, useState } from "react";
import {
  AlertTriangle,
  FilePlus2,
  Layers,
  Link2,
  ListTree,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Square,
  Trash2,
  Workflow
} from "lucide-react";
import { Screen, ScreenNotice } from "../../components/screen/Screen";
import { ScreenTabs, type ScreenTab } from "../../components/screen/ScreenTabs";
import { Badge, Button, Textarea, cn } from "../../components/ui/primitives";
import { statusTone } from "../../components/ui/status-tone";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useLogicPageBridge, useLogicStore } from "./logic-store";
import { ContextPickerPanel } from "../context-picker/ContextPickerPanel";
import {
  EdgeInspector,
  GraphSettings,
  LogicCanvas,
  LogicPathBrowserPanel,
  NodeInspector,
  NodePalette,
  RunIoDetailPanel,
  applyContextToLogicSelection
} from "./LogicParts";

/* ============================================================================
   규칙 화면.
   세 벌을 한 화면에 밀어 넣지 않는다. 캡슐 탭으로 목록 / 그림 / 속성 / 실행을
   갈아 끼우고, 각 칸은 남은 높이를 정확히 차지한다.
   ============================================================================ */

type TabId = "list" | "canvas" | "props" | "run";

export function LogicPage() {
  useLogicPageBridge();

  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const connected = bridgeStatus === "connected" && authStatus === "authenticated";

  const store = useLogicStore;
  const editor = useLogicStore((state) => state.editor);
  const graphs = useLogicStore((state) => state.graphs);
  const selectedGraphId = useLogicStore((state) => state.selectedGraphId);
  const selectedNodeId = useLogicStore((state) => state.selectedNodeId);
  const selectedEdgeId = useLogicStore((state) => state.selectedEdgeId);
  const snapshot = useLogicStore((state) => state.runSnapshot);
  const loadingList = useLogicStore((state) => state.loadingList);
  const loadingGraph = useLogicStore((state) => state.loadingGraph);
  const lastError = useLogicStore((state) => state.lastError);
  const problems = useLogicStore((state) => state.validationProblems);

  const [tab, setTab] = useState<TabId>("list");

  useEffect(() => {
    if (!connected) return;
    const state = store.getState();
    state.loadGraphs();
    state.loadRecovery();
    state.loadLogicPath();
  }, [connected, store]);

  // 규칙을 열면 그림으로 넘어간다. 목록에 남아 있어 아무 일도 안 난 것처럼 보이지 않게 한다.
  useEffect(() => {
    if (editor) setTab((current) => (current === "list" ? "canvas" : current));
  }, [editor]);

  const tabs: ScreenTab[] = [
    { id: "list", label: "목록", icon: ListTree, badge: graphs.length > 0 ? String(graphs.length) : undefined },
    { id: "canvas", label: "그림", icon: Workflow, alert: problems.length > 0 },
    { id: "props", label: "속성", icon: Settings2 },
    { id: "run", label: "실행", icon: Play, badge: snapshot ? snapshot.status || "실행" : undefined }
  ];

  return (
    <Screen
      title="규칙"
      hint={editor ? `${editor.title || "이름 없는 규칙"} · 노드 ${editor.nodes.length} · 연결 ${editor.edges.length}` : "노드를 이어 반복 작업을 정리합니다."}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => store.getState().newGraph()}>
            <FilePlus2 size={14} aria-hidden="true" /> 새 규칙
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => store.getState().saveGraph()}
            disabled={!connected || !editor || loadingGraph}
          >
            <Save size={14} aria-hidden="true" /> 저장
          </Button>
        </>
      }
      notice={
        !connected ? (
          <ScreenNotice tone="warning">연결되지 않았습니다.</ScreenNotice>
        ) : lastError ? (
          <ScreenNotice tone="danger">{lastError}</ScreenNotice>
        ) : problems.length > 0 ? (
          <ScreenNotice tone="warning">
            {problems[0]}
            {problems.length > 1 ? ` 외 ${problems.length - 1}건` : ""}
          </ScreenNotice>
        ) : null
      }
    >
      <ScreenTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="규칙 보기 종류" />

      {tab === "list" ? (
        <GraphListPanel connected={connected} loading={loadingList} />
      ) : tab === "canvas" ? (
        <CanvasPanel connected={connected} />
      ) : tab === "props" ? (
        <PropsPanel connected={connected} />
      ) : (
        <RunPanel connected={connected} />
      )}

      {/* 어떤 탭에서든 지금 무엇을 고르고 있는지 한 줄로 알려 준다. */}
      {editor && tab !== "list" ? (
        <p className="min-w-0 shrink-0 truncate text-[11px] text-muted-foreground">
          {selectedNodeId
            ? `선택한 노드 ${selectedNodeId}`
            : selectedEdgeId
              ? `선택한 연결 ${selectedEdgeId}`
              : `${selectedGraphId || "저장 안 된 규칙"} · 노드나 연결을 고르면 「속성」에서 고칩니다.`}
        </p>
      ) : null}
    </Screen>
  );
}

function Box({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      {footer ? <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-t border-border p-2">{footer}</div> : null}
    </div>
  );
}

function GraphListPanel({ connected, loading }: { connected: boolean; loading: boolean }) {
  const graphs = useLogicStore((state) => state.graphs);
  const recovery = useLogicStore((state) => state.recoveryItems);
  const selectedGraphId = useLogicStore((state) => state.selectedGraphId);
  const store = useLogicStore;

  return (
    <Box
      footer={
        <Button variant="outline" size="sm" onClick={() => store.getState().loadGraphs()} disabled={!connected || loading}>
          <RefreshCcw size={12} aria-hidden="true" /> 다시 조회
        </Button>
      }
    >
      {recovery.length > 0 ? (
        <div className="min-w-0 border-b border-border bg-warning/10 px-3 py-2">
          <p className="mb-1 text-[11px] font-semibold text-warning">멈춘 실행 {recovery.length}건</p>
          <ul className="min-w-0 space-y-0.5">
            {recovery.slice(0, 3).map((item) => (
              <li key={item.runId} className="min-w-0">
                <button
                  type="button"
                  disabled={!connected}
                  onClick={() => store.getState().openRecoveryRun(item)}
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-accent/60"
                >
                  <span className="min-w-0 truncate text-[11px]">{item.title || item.graphId}</span>
                  <Badge tone={statusTone(item.status)}>{item.status || "실행"}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {graphs.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">저장된 규칙이 없습니다.</p>
      ) : (
        <ul className="min-w-0 divide-y divide-border">
          {graphs.map((item) => (
            <li key={item.graphId} className="min-w-0">
              <button
                type="button"
                disabled={!connected}
                onClick={() => store.getState().openGraph(item.graphId)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
                  item.graphId === selectedGraphId && "bg-accent"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{item.title || item.graphId}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    노드 {item.nodeCount} · 연결 {item.edgeCount}
                  </span>
                </span>
                <Badge tone={item.enabled ? "primary" : "outline"}>{item.enabled ? "켜짐" : "꺼짐"}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function CanvasPanel({ connected }: { connected: boolean }) {
  const editor = useLogicStore((state) => state.editor);
  const snapshot = useLogicStore((state) => state.runSnapshot);
  const selectedNodeId = useLogicStore((state) => state.selectedNodeId);
  const selectedEdgeId = useLogicStore((state) => state.selectedEdgeId);
  const loadingGraph = useLogicStore((state) => state.loadingGraph);
  const selectedGraphId = useLogicStore((state) => state.selectedGraphId);
  const store = useLogicStore;
  const [paletteOpen, setPaletteOpen] = useState(false);

  if (loadingGraph) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground">
        불러오는 중…
      </div>
    );
  }

  if (!editor) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
        <Workflow size={26} className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">편집할 규칙이 없습니다</p>
        <p className="max-w-sm text-xs text-muted-foreground">「목록」에서 규칙을 고르거나 새로 만드세요.</p>
        <Button variant="primary" size="sm" onClick={() => store.getState().newGraph()}>
          <FilePlus2 size={14} aria-hidden="true" /> 새 규칙 만들기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-b border-border p-2">
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setPaletteOpen((open) => !open)}>
            <Plus size={12} aria-hidden="true" /> 노드
          </Button>
          {paletteOpen ? (
            <NodePalette
              onAdd={(type) => store.getState().addNode(type)}
              onClose={() => setPaletteOpen(false)}
            />
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={!connected || !selectedGraphId}
          onClick={() => store.getState().deleteGraph()}
        >
          <Trash2 size={12} aria-hidden="true" /> 규칙 삭제
        </Button>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          <Link2 size={11} aria-hidden="true" /> 출력에서 끌어 입력에 놓으면 연결
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2">
        <LogicCanvas
          graph={editor}
          snapshot={snapshot}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onSelectNode={store.getState().selectNode}
          onSelectEdge={store.getState().selectEdge}
          onClearSelection={store.getState().clearSelection}
          onMoveNode={store.getState().moveNode}
          onResizeNode={store.getState().resizeNode}
          onConnect={store.getState().connectNodes}
        />
      </div>
    </div>
  );
}

type PropsTab = "selection" | "graph" | "path" | "context" | "json";

function PropsPanel({ connected }: { connected: boolean }) {
  const editor = useLogicStore((state) => state.editor);
  const selectedNodeId = useLogicStore((state) => state.selectedNodeId);
  const selectedEdgeId = useLogicStore((state) => state.selectedEdgeId);
  const pathSnapshot = useLogicStore((state) => state.pathBrowser.snapshot);
  const graphJson = useLogicStore((state) => state.graphJson);
  const store = useLogicStore;
  const [inner, setInner] = useState<PropsTab>("selection");

  const node = editor?.nodes.find((item) => item.nodeId === selectedNodeId) || null;
  const edge = editor?.edges.find((item) => item.edgeId === selectedEdgeId) || null;

  const innerTabs: { id: PropsTab; label: string }[] = [
    { id: "selection", label: "고른 것" },
    { id: "graph", label: "규칙 설정" },
    { id: "path", label: "경로" },
    { id: "context", label: "문맥" },
    { id: "json", label: "원본" }
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-border px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {innerTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={inner === item.id}
            onClick={() => setInner(item.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
              inner === item.id ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 p-3">
          {inner === "path" ? (
            <LogicPathBrowserPanel canRequest={connected} selectedNode={node} snapshot={pathSnapshot} />
          ) : inner === "context" ? (
            <ContextPickerPanel
              canRequest={connected}
              surface="logic"
              applyLabel={node ? "노드에 적용" : "입력에 붙이기"}
              onApply={applyContextToLogicSelection}
            />
          ) : !editor ? (
            <p className="py-8 text-center text-xs text-muted-foreground">「목록」에서 규칙을 먼저 고르세요.</p>
          ) : inner === "json" ? (
            <Textarea
              rows={18}
              className="min-w-0 font-mono text-[11px]"
              aria-label="규칙 원본"
              value={graphJson}
              onChange={(event) => store.getState().setGraphJson(event.target.value)}
            />
          ) : inner === "graph" ? (
            <GraphSettings graph={editor} />
          ) : node ? (
            <NodeInspector node={node} />
          ) : edge ? (
            <EdgeInspector edge={edge} graph={editor} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Layers size={20} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">「그림」에서 노드나 연결을 고르면 여기서 고칩니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RunPanel({ connected }: { connected: boolean }) {
  const snapshot = useLogicStore((state) => state.runSnapshot);
  const running = useLogicStore((state) => state.running);
  const runInput = useLogicStore((state) => state.runInput);
  const selectedGraphId = useLogicStore((state) => state.selectedGraphId);
  const selectedNodeId = useLogicStore((state) => state.selectedNodeId);
  const store = useLogicStore;
  const [detail, setDetail] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="min-w-0 shrink-0 border-b border-border p-2">
        <Textarea
          rows={2}
          className="min-w-0 text-xs"
          aria-label="실행 입력"
          placeholder="실행할 때 넣을 값 — 비워 둬도 됩니다"
          value={runInput}
          onChange={(event) => store.getState().setRunInput(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {!snapshot ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">아직 실행하지 않았습니다.</p>
        ) : detail ? (
          <div className="min-w-0 p-3">
            <RunIoDetailPanel snapshot={snapshot} selectedNodeId={selectedNodeId} />
          </div>
        ) : (
          <div className="min-w-0 space-y-2 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <Badge tone={statusTone(snapshot.status)}>{snapshot.status || "실행"}</Badge>
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{snapshot.runId}</span>
            </div>
            {snapshot.error ? (
              <p className="min-w-0 break-words rounded-md bg-destructive/10 p-2 text-[11px] text-destructive">{snapshot.error}</p>
            ) : null}
            <ul className="min-w-0 divide-y divide-border rounded-md border border-border">
              {snapshot.nodes.map((node) => (
                <li key={node.nodeId} className="flex min-w-0 items-center gap-2 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[11px]">{node.title || node.nodeId}</span>
                  <Badge tone={statusTone(node.status)}>{node.status}</Badge>
                </li>
              ))}
            </ul>
            {snapshot.resultText ? (
              <pre className="min-w-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                {snapshot.resultText}
              </pre>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5 border-t border-border p-2">
        <Button variant="primary" size="sm" disabled={!connected || !selectedGraphId || running} onClick={() => store.getState().runGraph()}>
          {running ? <Square size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />} {running ? "실행 중" : "실행"}
        </Button>
        <Button variant="outline" size="sm" disabled={!connected || !snapshot?.runId || !running} onClick={() => store.getState().cancelRun()}>
          취소
        </Button>
        {snapshot ? (
          <Button variant="ghost" size="sm" onClick={() => setDetail((open) => !open)}>
            {detail ? "간단히" : "자세히"}
          </Button>
        ) : null}
        {running ? (
          <span className="flex items-center gap-1 text-[11px] text-warning">
            <AlertTriangle size={11} aria-hidden="true" /> 실행이 끝날 때까지 저장은 미뤄집니다.
          </span>
        ) : null}
      </div>
    </div>
  );
}
