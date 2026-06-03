import { useEffect } from "react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useLogicPageBridge, useLogicStore } from "./logic-store";

function nodeTitle(nodeId: string, fallback: string): string {
  return fallback || nodeId;
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <section className="grid">
      <CardBoundary title="Logic graph 목록" card="navigation" onError={recordCardError}>
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.loadGraphs} disabled={!canRequest || store.loadingList}>
            {store.loadingList ? "조회 중" : "새로고침"}
          </button>
        </div>
        {store.lastError ? <div className="section-error">{store.lastError}</div> : null}
        <div className="event-log" style={{ marginTop: 12 }}>
          {store.graphs.map((item) => (
            <button
              key={item.graphId}
              className={item.graphId === store.selectedGraphId ? "row active" : "row"}
              type="button"
              style={{ textAlign: "left" }}
              onClick={() => store.openGraph(item.graphId)}
              disabled={!canRequest}
            >
              <div style={{ minWidth: 0 }}>
                <div className="row-title">{item.title}</div>
                <div className="row-meta">{`${item.nodeCount} nodes · ${item.edgeCount} edges${item.scheduleKind ? ` · ${item.scheduleKind}` : ""}`}</div>
              </div>
              <span className="badge">{item.lastStatus || (item.enabled ? "enabled" : "disabled")}</span>
            </button>
          ))}
          {store.graphs.length === 0 ? <div className="empty">logic graph 없음</div> : null}
        </div>
      </CardBoundary>

      <CardBoundary title="그래프 구조" card="operations" onError={recordCardError}>
        <div className="log-toolbar">
          <button className="secondary-button" type="button" onClick={store.runGraph} disabled={!canRequest || !store.selectedGraphId || store.running}>
            {store.running ? "실행 중…" : "실행"}
          </button>
        </div>
        {store.loadingGraph ? (
          <div className="empty" style={{ marginTop: 12 }}>그래프 불러오는 중…</div>
        ) : !graph ? (
          <div className="empty" style={{ marginTop: 12 }}>왼쪽에서 graph를 선택하세요.</div>
        ) : (
          <>
            <div className="logic-section-title">노드 {graph.nodes.length}</div>
            <div className="event-log">
              {graph.nodes.map((node) => (
                <div key={node.nodeId} className="logic-node">
                  <div className="logic-node-head">
                    <span className="chip">{node.type || "node"}</span>
                    <strong>{nodeTitle(node.nodeId, node.title)}</strong>
                    {node.enabled ? null : <span className="badge">disabled</span>}
                  </div>
                  {Object.keys(node.config).length > 0 ? (
                    <div className="logic-node-config">
                      {Object.entries(node.config).slice(0, 6).map(([key, value]) => (
                        <span key={key} className="logic-kv">
                          <span className="logic-kv-k">{key}</span>
                          <span className="logic-kv-v">{value.length > 60 ? `${value.slice(0, 60)}…` : value}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {graph.nodes.length === 0 ? <div className="empty">노드 없음</div> : null}
            </div>
            <div className="logic-section-title">엣지 {graph.edges.length}</div>
            <div className="event-log">
              {graph.edges.map((edge) => (
                <div key={edge.edgeId || `${edge.sourceNodeId}-${edge.targetNodeId}`} className="logic-edge">
                  <span className="mono">{edge.sourceNodeId}</span>
                  <span className="logic-edge-arrow">→</span>
                  <span className="mono">{edge.targetNodeId}</span>
                  {edge.sourcePort !== "main" || edge.targetPort !== "main" ? (
                    <span className="row-meta">{`(${edge.sourcePort} → ${edge.targetPort})`}</span>
                  ) : null}
                </div>
              ))}
              {graph.edges.length === 0 ? <div className="empty">엣지 없음</div> : null}
            </div>
          </>
        )}

        {snapshot ? (
          <div className="routine-wizard-preview" style={{ marginTop: 12 }}>
            <div>
              <span>run</span>
              <strong>{`${snapshot.runId} · ${snapshot.status}`}</strong>
            </div>
            {snapshot.error ? <div style={{ display: "block", color: "#ffb2b2" }}>{snapshot.error}</div> : null}
            <div style={{ display: "block" }}>
              {snapshot.nodes.map((node) => (
                <span key={node.nodeId} className="chip" style={{ marginRight: 6, marginTop: 4 }}>
                  {`${nodeTitle(node.nodeId, node.title)}: ${node.status}`}
                </span>
              ))}
            </div>
            {snapshot.resultText ? (
              <pre className="result-pre" style={{ marginTop: 8 }}>{snapshot.resultText}</pre>
            ) : null}
          </div>
        ) : null}
      </CardBoundary>
    </section>
  );
}
