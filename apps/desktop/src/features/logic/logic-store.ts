import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopLogic,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";

export type LogicGraphSummary = {
  graphId: string;
  title: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  lastStatus: string;
  enabled: boolean;
  scheduleKind: string;
};

export type LogicNode = {
  nodeId: string;
  type: string;
  title: string;
  enabled: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  config: Record<string, string>;
};

export type LogicEdge = {
  edgeId: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
};

export type LogicGraphDetail = {
  graphId: string;
  title: string;
  nodes: LogicNode[];
  edges: LogicEdge[];
};

export type LogicRunNode = { nodeId: string; type: string; title: string; status: string; error: string };

export type LogicRunSnapshot = {
  runId: string;
  status: string;
  resultText: string;
  error: string;
  logs: string[];
  nodes: LogicRunNode[];
};

type LogicState = {
  graphs: LogicGraphSummary[];
  selectedGraphId: string;
  graph: LogicGraphDetail | null;
  graphJson: string;
  runInput: string;
  runSnapshot: LogicRunSnapshot | null;
  loadingList: boolean;
  loadingGraph: boolean;
  running: boolean;
  lastError: string;
  loadGraphs: () => void;
  openGraph: (graphId: string) => void;
  setGraphJson: (value: string) => void;
  setRunInput: (value: string) => void;
  saveGraph: () => void;
  deleteGraph: () => void;
  runGraph: () => void;
  cancelRun: () => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNumber(record: Record<string, unknown>, key: string, fallback: number) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSummaries(items: unknown): LogicGraphSummary[] {
  return Array.isArray(items)
    ? items.map((item) => {
        const record = asRecord(item);
        return {
          graphId: String(record.graphId || ""),
          title: String(record.title || "logic graph"),
          description: String(record.description || ""),
          nodeCount: Number(record.nodeCount) || 0,
          edgeCount: Number(record.edgeCount) || 0,
          lastStatus: String(record.lastStatus || ""),
          enabled: !!record.enabled,
          scheduleKind: String(record.scheduleKind || "")
        };
      }).filter((item) => item.graphId)
    : [];
}

function normalizeGraph(value: unknown): LogicGraphDetail | null {
  const record = asRecord(value);
  if (!record.graphId && !Array.isArray(record.nodes)) {
    return null;
  }
  const nodes: LogicNode[] = Array.isArray(record.nodes)
    ? record.nodes.map((node) => {
        const nodeRecord = asRecord(node);
        const config = asRecord(nodeRecord.config);
        const normalizedConfig: Record<string, string> = {};
        Object.keys(config).forEach((key) => {
          normalizedConfig[key] = String(config[key]);
        });
        return {
          nodeId: String(nodeRecord.nodeId || ""),
          type: String(nodeRecord.type || ""),
          title: String(nodeRecord.title || ""),
          enabled: nodeRecord.enabled !== false,
          position: {
            x: readNumber(asRecord(nodeRecord.position), "x", 0),
            y: readNumber(asRecord(nodeRecord.position), "y", 0)
          },
          size: {
            width: readNumber(asRecord(nodeRecord.size), "width", 188),
            height: readNumber(asRecord(nodeRecord.size), "height", 112)
          },
          config: normalizedConfig
        };
      })
    : [];
  const edges: LogicEdge[] = Array.isArray(record.edges)
    ? record.edges.map((edge) => {
        const edgeRecord = asRecord(edge);
        return {
          edgeId: String(edgeRecord.edgeId || ""),
          sourceNodeId: String(edgeRecord.sourceNodeId || ""),
          sourcePort: String(edgeRecord.sourcePort || "main"),
          targetNodeId: String(edgeRecord.targetNodeId || ""),
          targetPort: String(edgeRecord.targetPort || "main")
        };
      })
    : [];
  return { graphId: String(record.graphId || ""), title: String(record.title || ""), nodes, edges };
}

function normalizeSnapshot(value: unknown): LogicRunSnapshot | null {
  const record = asRecord(value);
  if (!record.runId) {
    return null;
  }
  return {
    runId: String(record.runId || ""),
    status: String(record.status || ""),
    resultText: String(record.resultText || ""),
    error: String(record.error || ""),
    logs: Array.isArray(record.logs) ? (record.logs as unknown[]).map(String) : [],
    nodes: Array.isArray(record.nodes)
      ? record.nodes.map((node) => {
          const nodeRecord = asRecord(node);
          return {
            nodeId: String(nodeRecord.nodeId || ""),
            type: String(nodeRecord.type || ""),
            title: String(nodeRecord.title || ""),
            status: String(nodeRecord.status || ""),
            error: String(nodeRecord.error || "")
          };
        })
      : []
  };
}

export const useLogicStore = create<LogicState>((set, get) => ({
  graphs: [],
  selectedGraphId: "",
  graph: null,
  graphJson: "",
  runInput: "",
  runSnapshot: null,
  loadingList: false,
  loadingGraph: false,
  running: false,
  lastError: "",
  loadGraphs: () => {
    set({ loadingList: true, lastError: "" });
    if (!requestDesktopLogic.listGraphs()) {
      set({ loadingList: false, lastError: "logic graph 목록 요청을 전송하지 못했다." });
    }
  },
  openGraph: (graphId) => {
    if (!graphId) return;
    set({ selectedGraphId: graphId, loadingGraph: true, graph: null, graphJson: "", runSnapshot: null });
    if (!requestDesktopLogic.getGraph(graphId)) {
      set({ loadingGraph: false, lastError: "logic graph 조회 요청을 전송하지 못했다." });
    }
  },
  setGraphJson: (value) => set({ graphJson: value }),
  setRunInput: (value) => set({ runInput: value }),
  saveGraph: () => {
    const json = get().graphJson.trim();
    if (!json) return;
    set({ loadingGraph: true, lastError: "" });
    if (!requestDesktopLogic.saveGraph(get().selectedGraphId, json)) {
      set({ loadingGraph: false, lastError: "logic graph 저장 요청을 전송하지 못했다." });
    }
  },
  deleteGraph: async () => {
    const graphId = get().selectedGraphId;
    if (!graphId) return;
    const confirmed = await requestConfirmDialog({
      title: "Logic graph 삭제",
      message: `logic graph "${graphId}"를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ loadingGraph: true, lastError: "" });
    if (!requestDesktopLogic.deleteGraph(graphId)) {
      set({ loadingGraph: false, lastError: "logic graph 삭제 요청을 전송하지 못했다." });
    }
  },
  runGraph: () => {
    const graphId = get().selectedGraphId;
    if (!graphId) return;
    set({ running: true, runSnapshot: null, lastError: "" });
    if (!requestDesktopLogic.runGraph(graphId, get().runInput)) {
      set({ running: false, lastError: "logic graph 실행 요청을 전송하지 못했다." });
    }
  },
  cancelRun: () => {
    const runId = get().runSnapshot?.runId || "";
    if (!runId) return;
    if (!requestDesktopLogic.cancelRun(runId)) {
      set({ lastError: "logic graph 취소 요청을 전송하지 못했다." });
    }
  }
}));

export function useLogicPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      if (message.type === "logic_graph_list_result") {
        useLogicStore.setState({ graphs: normalizeSummaries(message.items), loadingList: false });
        return;
      }

      if (message.type === "logic_graph_result") {
        const graph = normalizeGraph(message.graph);
        useLogicStore.setState({
          loadingGraph: false,
          graph,
          graphJson: message.graph ? JSON.stringify(message.graph, null, 2) : useLogicStore.getState().graphJson,
          selectedGraphId: graph?.graphId || useLogicStore.getState().selectedGraphId,
          lastError: message.ok === false ? String(message.message || "logic graph 조회 실패") : ""
        });
        return;
      }

      if (message.type === "logic_graph_run_result" || message.type === "logic_graph_run_event") {
        const snapshot = normalizeSnapshot(message.snapshot);
        useLogicStore.setState({
          running: message.type === "logic_graph_run_event" && snapshot?.status !== "completed" && snapshot?.status !== "failed",
          runSnapshot: snapshot,
          lastError: message.ok === false ? String(message.message || "logic graph 실행 실패") : ""
        });
        return;
      }

      if (message.type === "error") {
        useLogicStore.setState({
          loadingList: false,
          loadingGraph: false,
          running: false,
          lastError: String(message.message || "오류")
        });
      }
    });
  }, []);
}
