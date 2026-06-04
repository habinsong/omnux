import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopLogic,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import { requestDesktopLogicPath, requestDesktopLogicRecovery } from "../middleware/logic-gateway";
import { requestConfirmDialog } from "../dialog/dialog-store";
import {
  LOGIC_NODE_DEFS,
  defaultConfigForType,
  getLogicNodeDef,
  makeLogicNodeId
} from "./logic-node-library";

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

export type LogicNodeResultEnvelope = {
  ok: boolean;
  type: string;
  text: string;
  data: Record<string, string>;
  artifacts: string[];
  conversationId: string;
  sessionKey: string;
  links: string[];
};

export type LogicRunNode = {
  nodeId: string;
  type: string;
  title: string;
  status: string;
  error: string;
  startedAtUtc: string;
  completedAtUtc: string;
  result: LogicNodeResultEnvelope | null;
};

export type LogicRunSnapshot = {
  runId: string;
  status: string;
  resultText: string;
  error: string;
  logs: string[];
  nodes: LogicRunNode[];
};

export type LogicRecoveryItem = {
  runId: string;
  graphId: string;
  title: string;
  status: string;
  source: string;
  completedNodeCount: number;
  errorNodeCount: number;
  pendingNodeCount: number;
  lastEvent: string;
};

export type LogicPathEntry = {
  name: string;
  isDirectory: boolean;
  browsePath: string;
  selectPath: string;
  description: string;
};

export type LogicPathSnapshot = {
  ok: boolean;
  message: string;
  scope: string;
  rootKey: string;
  rootLabel: string;
  displayPath: string;
  browsePath: string;
  parentBrowsePath: string;
  directorySelectPath: string;
  roots: Array<{ key: string; label: string }>;
  items: LogicPathEntry[];
};

export type LogicPathBrowserState = {
  loading: boolean;
  scope: string;
  rootKey: string;
  browsePath: string;
  snapshot: LogicPathSnapshot | null;
  lastError: string;
};

type LogicState = {
  graphs: LogicGraphSummary[];
  recoveryItems: LogicRecoveryItem[];
  selectedGraphId: string;
  graph: LogicGraphDetail | null;
  graphJson: string;
  runInput: string;
  runSnapshot: LogicRunSnapshot | null;
  loadingList: boolean;
  loadingRecovery: boolean;
  loadingGraph: boolean;
  running: boolean;
  lastError: string;
  // 비주얼 에디터 상태
  editor: EditableGraph | null;
  selectedNodeId: string;
  selectedEdgeId: string;
  validationProblems: string[];
  pathBrowser: LogicPathBrowserState;
  loadGraphs: () => void;
  loadRecovery: () => void;
  openGraph: (graphId: string) => void;
  openRecoveryRun: (item: LogicRecoveryItem) => void;
  setGraphJson: (value: string) => void;
  setRunInput: (value: string) => void;
  saveGraph: () => void;
  deleteGraph: () => void;
  runGraph: () => void;
  cancelRun: () => void;
  // 비주얼 에디터 액션
  newGraph: () => void;
  addNode: (type: string) => void;
  moveNode: (nodeId: string, x: number, y: number) => void;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  selectNode: (nodeId: string) => void;
  selectEdge: (edgeId: string) => void;
  clearSelection: () => void;
  deleteSelectedNode: () => void;
  deleteSelectedEdge: () => void;
  setNodeTitle: (nodeId: string, title: string) => void;
  setNodeEnabled: (nodeId: string, enabled: boolean) => void;
  setNodeContinueOnError: (nodeId: string, value: boolean) => void;
  setNodeConfig: (nodeId: string, key: string, value: string) => void;
  addNodeConfigKey: (nodeId: string, key: string) => void;
  removeNodeConfigKey: (nodeId: string, key: string) => void;
  connectNodes: (sourceNodeId: string, sourcePort: string, targetNodeId: string, targetPort: string) => void;
  setEdgePort: (edgeId: string, side: "sourcePort" | "targetPort", value: string) => void;
  setEdgeCondition: (edgeId: string, patch: Partial<EditableEdgeCondition> | null) => void;
  setGraphField: (key: "title" | "description", value: string) => void;
  setGraphEnabled: (enabled: boolean) => void;
  setScheduleField: <K extends keyof EditableSchedule>(key: K, value: EditableSchedule[K]) => void;
  setPathScope: (scope: string) => void;
  loadLogicPath: (browsePath?: string, rootKey?: string, scope?: string) => void;
};

type LogicSet = (partial: Partial<LogicState> | ((state: LogicState) => Partial<LogicState>)) => void;

function commitEditor(set: LogicSet, next: EditableGraph) {
  set({ editor: next, graphJson: serializeEditable(next), validationProblems: validateEditableGraph(next) });
}

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
            error: String(nodeRecord.error || ""),
            startedAtUtc: String(nodeRecord.startedAtUtc || ""),
            completedAtUtc: String(nodeRecord.completedAtUtc || ""),
            result: normalizeResultEnvelope(nodeRecord.result)
          };
        })
      : []
  };
}

function stringRecord(value: unknown): Record<string, string> {
  const raw = asRecord(value);
  const result: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    result[key] = raw[key] == null ? "" : String(raw[key]);
  }
  return result;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeResultEnvelope(value: unknown): LogicNodeResultEnvelope | null {
  const record = asRecord(value);
  if (!Object.keys(record).length) return null;
  return {
    ok: record.ok !== false,
    type: String(record.type || ""),
    text: String(record.text || ""),
    data: stringRecord(record.data),
    artifacts: strings(record.artifacts),
    conversationId: String(record.conversationId || ""),
    sessionKey: String(record.sessionKey || ""),
    links: strings(record.links)
  };
}

function normalizeLogicPath(value: unknown): LogicPathSnapshot {
  const payload = asRecord(value);
  return {
    ok: payload.ok === true,
    message: String(payload.message || ""),
    scope: String(payload.scope || ""),
    rootKey: String(payload.rootKey || ""),
    rootLabel: String(payload.rootLabel || ""),
    displayPath: String(payload.displayPath || ""),
    browsePath: String(payload.browsePath || ""),
    parentBrowsePath: String(payload.parentBrowsePath || ""),
    directorySelectPath: String(payload.directorySelectPath || ""),
    roots: Array.isArray(payload.roots)
      ? payload.roots.map((root) => {
          const record = asRecord(root);
          return { key: String(record.key || ""), label: String(record.label || "") };
        }).filter((root) => root.key)
      : [],
    items: Array.isArray(payload.items)
      ? payload.items.map((item) => {
          const record = asRecord(item);
          return {
            name: String(record.name || ""),
            isDirectory: record.isDirectory === true,
            browsePath: String(record.browsePath || ""),
            selectPath: String(record.selectPath || ""),
            description: String(record.description || "")
          };
        }).filter((item) => item.name)
      : []
  };
}

function normalizeRecoveryItems(value: unknown): LogicRecoveryItem[] {
  return Array.isArray(value)
    ? value.map((item) => {
        const record = asRecord(item);
        return {
          runId: String(record.runId || ""),
          graphId: String(record.graphId || ""),
          title: String(record.title || "recoverable run"),
          status: String(record.status || ""),
          source: String(record.source || ""),
          completedNodeCount: Number(record.completedNodeCount) || 0,
          errorNodeCount: Number(record.errorNodeCount) || 0,
          pendingNodeCount: Number(record.pendingNodeCount) || 0,
          lastEvent: String(record.lastEvent || "")
        };
      }).filter((item) => item.runId)
    : [];
}

/* ===== 비주얼 에디터 모델 (LogicGraphDefinition camelCase 미러) ===== */

export type EditableEdgeCondition = { leftRef: string; operator: string; rightValue: string };

export type EditableNode = {
  nodeId: string;
  type: string;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  enabled: boolean;
  continueOnError: boolean;
  config: Record<string, string>;
  outputs: Record<string, string>;
};

export type EditableEdge = {
  edgeId: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  condition: EditableEdgeCondition | null;
};

export type EditableSchedule = {
  scheduleSourceMode: string;
  scheduleKind: string;
  scheduleTime: string;
  timezoneId: string;
  dayOfMonth: number | null;
  weekdays: number[];
  enabled: boolean;
};

export type EditableGraph = {
  graphId: string;
  title: string;
  description: string;
  version: string;
  viewport: { x: number; y: number; zoom: number };
  schedule: EditableSchedule;
  enabled: boolean;
  nodes: EditableNode[];
  edges: EditableEdge[];
};

const LOGIC_SCHEMA_VERSION = "logic.graph.v1";
const INITIAL_PATH_BROWSER: LogicPathBrowserState = {
  loading: false,
  scope: "workspace",
  rootKey: "workspace",
  browsePath: "",
  snapshot: null,
  lastError: ""
};

function readNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringifyConfig(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const result: Record<string, string> = {};
  for (const key of Object.keys(record)) {
    const raw = record[key];
    result[key] = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
  return result;
}

function editableFromGraph(raw: unknown): EditableGraph {
  const record = asRecord(raw);
  const schedule = asRecord(record.schedule);
  const viewport = asRecord(record.viewport);
  const nodes: EditableNode[] = Array.isArray(record.nodes)
    ? record.nodes.map((node) => {
        const nr = asRecord(node);
        const def = getLogicNodeDef(String(nr.type || ""));
        return {
          nodeId: String(nr.nodeId || ""),
          type: String(nr.type || ""),
          title: String(nr.title || ""),
          position: { x: readNumberOr(asRecord(nr.position).x, 0), y: readNumberOr(asRecord(nr.position).y, 0) },
          size: {
            width: readNumberOr(asRecord(nr.size).width, def?.defaultSize.width || 188),
            height: readNumberOr(asRecord(nr.size).height, def?.defaultSize.height || 120)
          },
          enabled: nr.enabled !== false,
          continueOnError: nr.continueOnError === true,
          config: stringifyConfig(nr.config),
          outputs: stringifyConfig(nr.outputs)
        };
      }).filter((node) => node.nodeId)
    : [];
  const edges: EditableEdge[] = Array.isArray(record.edges)
    ? record.edges.map((edge) => {
        const er = asRecord(edge);
        const condition = er.condition ? asRecord(er.condition) : null;
        return {
          edgeId: String(er.edgeId || ""),
          sourceNodeId: String(er.sourceNodeId || ""),
          sourcePort: String(er.sourcePort || "main"),
          targetNodeId: String(er.targetNodeId || ""),
          targetPort: String(er.targetPort || "main"),
          condition: condition
            ? {
                leftRef: String(condition.leftRef || ""),
                operator: String(condition.operator || "equals"),
                rightValue: String(condition.rightValue || "")
              }
            : null
        };
      }).filter((edge) => edge.sourceNodeId && edge.targetNodeId)
    : [];
  return {
    graphId: String(record.graphId || ""),
    title: String(record.title || ""),
    description: String(record.description || ""),
    version: String(record.version || LOGIC_SCHEMA_VERSION),
    viewport: { x: readNumberOr(viewport.x, 0), y: readNumberOr(viewport.y, 0), zoom: readNumberOr(viewport.zoom, 1) },
    schedule: {
      scheduleSourceMode: String(schedule.scheduleSourceMode || "manual"),
      scheduleKind: String(schedule.scheduleKind || "daily"),
      scheduleTime: String(schedule.scheduleTime || "08:00"),
      timezoneId: String(schedule.timezoneId || ""),
      dayOfMonth: typeof schedule.dayOfMonth === "number" ? schedule.dayOfMonth : null,
      weekdays: Array.isArray(schedule.weekdays) ? schedule.weekdays.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [],
      enabled: schedule.enabled !== false
    },
    enabled: record.enabled !== false,
    nodes,
    edges
  };
}

function serializeEditable(graph: EditableGraph): string {
  const payload = {
    graphId: graph.graphId || undefined,
    title: graph.title,
    description: graph.description,
    version: graph.version || LOGIC_SCHEMA_VERSION,
    viewport: graph.viewport,
    schedule: graph.schedule,
    enabled: graph.enabled,
    nodes: graph.nodes.map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      title: node.title,
      position: node.position,
      size: node.size,
      enabled: node.enabled,
      continueOnError: node.continueOnError,
      config: node.config,
      outputs: node.outputs
    })),
    edges: graph.edges.map((edge) => ({
      edgeId: edge.edgeId,
      sourceNodeId: edge.sourceNodeId,
      sourcePort: edge.sourcePort,
      targetNodeId: edge.targetNodeId,
      targetPort: edge.targetPort,
      ...(edge.condition ? { condition: edge.condition } : {})
    }))
  };
  return JSON.stringify(payload, null, 2);
}

function makeEdgeId(existing: Iterable<string>): string {
  const taken = new Set(existing);
  let index = 1;
  let candidate = `e_${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `e_${index}`;
  }
  return candidate;
}

function emptyEditableGraph(): EditableGraph {
  const startId = "start_1";
  const endId = "end_1";
  return {
    graphId: "",
    title: "새 로직 그래프",
    description: "",
    version: LOGIC_SCHEMA_VERSION,
    viewport: { x: 0, y: 0, zoom: 1 },
    schedule: { scheduleSourceMode: "manual", scheduleKind: "daily", scheduleTime: "08:00", timezoneId: "", dayOfMonth: null, weekdays: [], enabled: true },
    enabled: true,
    nodes: [
      { nodeId: startId, type: "start", title: "시작", position: { x: 80, y: 96 }, size: { ...LOGIC_NODE_DEFS.start.defaultSize }, enabled: true, continueOnError: false, config: defaultConfigForType("start"), outputs: {} },
      { nodeId: endId, type: "end", title: "끝내기", position: { x: 420, y: 96 }, size: { ...LOGIC_NODE_DEFS.end.defaultSize }, enabled: true, continueOnError: false, config: defaultConfigForType("end"), outputs: {} }
    ],
    edges: [{ edgeId: "e_1", sourceNodeId: startId, sourcePort: "main", targetNodeId: endId, targetPort: "main", condition: null }]
  };
}

/** 저장 전 클라이언트 측 핵심 검증(백엔드 LogicGraphValidationPolicy 미러, 안내용). */
export function validateEditableGraph(graph: EditableGraph): string[] {
  const problems: string[] = [];
  const enabled = graph.nodes.filter((node) => node.enabled);
  if (enabled.length === 0) {
    problems.push("활성 노드가 하나 이상 필요합니다.");
    return problems;
  }
  const ids = new Set<string>();
  for (const node of enabled) {
    if (ids.has(node.nodeId)) problems.push(`중복 nodeId: ${node.nodeId}`);
    ids.add(node.nodeId);
    if (!LOGIC_NODE_DEFS[node.type]) problems.push(`알 수 없는 노드 타입: ${node.type}`);
  }
  const startCount = enabled.filter((node) => node.type === "start").length;
  if (startCount !== 1) problems.push("시작 노드는 정확히 1개여야 합니다.");
  const endCount = enabled.filter((node) => node.type === "end" || node.type === "output").length;
  if (endCount < 1) problems.push("끝내기 또는 출력 노드가 하나 이상 필요합니다.");
  for (const edge of graph.edges) {
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) {
      problems.push("연결이 끊긴 edge가 있습니다.");
      break;
    }
  }
  // 같은 입력 칸에는 연결을 하나만(parallel_join 제외) — 백엔드 duplicatedInputPort 미러.
  const inputUsage = new Map<string, number>();
  for (const edge of graph.edges) {
    const key = `${edge.targetNodeId}:${edge.targetPort || "main"}`;
    inputUsage.set(key, (inputUsage.get(key) || 0) + 1);
  }
  for (const [key, count] of inputUsage) {
    if (count < 2) continue;
    const targetId = key.slice(0, key.lastIndexOf(":"));
    const targetNode = enabled.find((node) => node.nodeId === targetId);
    if (targetNode && targetNode.type !== "parallel_join") {
      problems.push(`같은 입력 칸에는 연결을 하나만 둘 수 있습니다: ${targetNode.title || targetId}`);
    }
  }
  for (const join of enabled.filter((node) => node.type === "parallel_join")) {
    const incoming = graph.edges.filter((edge) => edge.targetNodeId === join.nodeId).length;
    if (incoming < 2) problems.push(`'모두 기다리기'는 들어오는 연결이 2개 이상이어야 합니다: ${join.nodeId}`);
  }
  return problems;
}

export const useLogicStore = create<LogicState>((set, get) => ({
  graphs: [],
  recoveryItems: [],
  selectedGraphId: "",
  graph: null,
  graphJson: "",
  runInput: "",
  runSnapshot: null,
  loadingList: false,
  loadingRecovery: false,
  loadingGraph: false,
  running: false,
  lastError: "",
  editor: null,
  selectedNodeId: "",
  selectedEdgeId: "",
  validationProblems: [],
  pathBrowser: { ...INITIAL_PATH_BROWSER },
  loadGraphs: () => {
    set({ loadingList: true, lastError: "" });
    if (!requestDesktopLogic.listGraphs()) {
      set({ loadingList: false, lastError: "logic graph 목록 요청을 전송하지 못했다." });
    }
  },
  loadRecovery: () => {
    set({ loadingRecovery: true, lastError: "" });
    if (!requestDesktopLogicRecovery.list()) {
      set({ loadingRecovery: false, lastError: "logic recovery 후보 요청을 전송하지 못했다." });
    }
  },
  openGraph: (graphId) => {
    if (!graphId) return;
    set({ selectedGraphId: graphId, loadingGraph: true, graph: null, graphJson: "", editor: null, selectedNodeId: "", selectedEdgeId: "", validationProblems: [], runSnapshot: null });
    if (!requestDesktopLogic.getGraph(graphId)) {
      set({ loadingGraph: false, lastError: "logic graph 조회 요청을 전송하지 못했다." });
    }
  },
  openRecoveryRun: (item) => {
    if (!item.runId) return;
    set({ selectedGraphId: item.graphId, running: false, runSnapshot: null, lastError: "" });
    if (!requestDesktopLogic.getRun(item.runId)) {
      set({ lastError: "logic recovery run 조회 요청을 전송하지 못했다." });
    }
  },
  setGraphJson: (value) => {
    // 직접 JSON 편집 시 best-effort로 비주얼 에디터에 반영(파싱 실패해도 텍스트는 유지).
    try {
      const parsed = JSON.parse(value);
      const editor = editableFromGraph(parsed);
      set({ graphJson: value, editor, validationProblems: validateEditableGraph(editor) });
    } catch {
      set({ graphJson: value });
    }
  },
  setRunInput: (value) => set({ runInput: value }),
  saveGraph: () => {
    const editor = get().editor;
    const json = editor ? serializeEditable(editor) : get().graphJson.trim();
    if (!json) return;
    if (editor) {
      const problems = validateEditableGraph(editor);
      if (problems.length > 0) {
        set({ validationProblems: problems, lastError: `저장 전 확인: ${problems[0]}` });
        return;
      }
    }
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
  },
  newGraph: () => {
    const editor = emptyEditableGraph();
    set({
      selectedGraphId: "",
      graph: null,
      runSnapshot: null,
      lastError: "",
      selectedNodeId: editor.nodes[0]?.nodeId || "",
      selectedEdgeId: ""
    });
    commitEditor(set, editor);
  },
  addNode: (type) => {
    const editor = get().editor;
    const def = getLogicNodeDef(type);
    if (!editor || !def) return;
    const nodeId = makeLogicNodeId(type, editor.nodes.map((node) => node.nodeId));
    // 기존 노드 우측 하단에 살짝 어긋나게 배치.
    const baseX = editor.nodes.length > 0 ? Math.max(...editor.nodes.map((node) => node.position.x)) + 60 : 96;
    const baseY = 96 + (editor.nodes.length % 4) * 40;
    const node: EditableNode = {
      nodeId,
      type,
      title: def.label,
      position: { x: baseX, y: baseY },
      size: { ...def.defaultSize },
      enabled: true,
      continueOnError: false,
      config: defaultConfigForType(type),
      outputs: {}
    };
    commitEditor(set, { ...editor, nodes: [...editor.nodes, node] });
    set({ selectedNodeId: nodeId, selectedEdgeId: "" });
  },
  moveNode: (nodeId, x, y) => {
    const editor = get().editor;
    if (!editor) return;
    const snappedX = Math.max(0, Math.round(x));
    const snappedY = Math.max(0, Math.round(y));
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, position: { x: snappedX, y: snappedY } } : node))
    });
  },
  resizeNode: (nodeId, width, height) => {
    const editor = get().editor;
    if (!editor) return;
    const nextWidth = Math.max(160, Math.min(360, Math.round(width)));
    const nextHeight = Math.max(92, Math.min(260, Math.round(height)));
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, size: { width: nextWidth, height: nextHeight } } : node))
    });
  },
  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: "" }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: "" }),
  clearSelection: () => set({ selectedNodeId: "", selectedEdgeId: "" }),
  deleteSelectedNode: () => {
    const { editor, selectedNodeId } = get();
    if (!editor || !selectedNodeId) return;
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.filter((node) => node.nodeId !== selectedNodeId),
      edges: editor.edges.filter((edge) => edge.sourceNodeId !== selectedNodeId && edge.targetNodeId !== selectedNodeId)
    });
    set({ selectedNodeId: "" });
  },
  deleteSelectedEdge: () => {
    const { editor, selectedEdgeId } = get();
    if (!editor || !selectedEdgeId) return;
    commitEditor(set, { ...editor, edges: editor.edges.filter((edge) => edge.edgeId !== selectedEdgeId) });
    set({ selectedEdgeId: "" });
  },
  setNodeTitle: (nodeId, title) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, title } : node)) });
  },
  setNodeEnabled: (nodeId, enabled) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, enabled } : node)) });
  },
  setNodeContinueOnError: (nodeId, value) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, continueOnError: value } : node)) });
  },
  setNodeConfig: (nodeId, key, value) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.map((node) => (node.nodeId === nodeId ? { ...node, config: { ...node.config, [key]: value } } : node))
    });
  },
  addNodeConfigKey: (nodeId, key) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.map((node) => (node.nodeId === nodeId && !(trimmed in node.config) ? { ...node, config: { ...node.config, [trimmed]: "" } } : node))
    });
  },
  removeNodeConfigKey: (nodeId, key) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, {
      ...editor,
      nodes: editor.nodes.map((node) => {
        if (node.nodeId !== nodeId) return node;
        const config = { ...node.config };
        delete config[key];
        return { ...node, config };
      })
    });
  },
  connectNodes: (sourceNodeId, sourcePort, targetNodeId, targetPort) => {
    const editor = get().editor;
    if (!editor || !sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
    // 동일 source/target 포트 조합 중복 방지.
    const exists = editor.edges.some(
      (edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId && edge.sourcePort === sourcePort && edge.targetPort === targetPort
    );
    if (exists) return;
    const edgeId = makeEdgeId(editor.edges.map((edge) => edge.edgeId));
    const edge: EditableEdge = { edgeId, sourceNodeId, sourcePort: sourcePort || "main", targetNodeId, targetPort: targetPort || "main", condition: null };
    commitEditor(set, { ...editor, edges: [...editor.edges, edge] });
    set({ selectedEdgeId: edgeId, selectedNodeId: "" });
  },
  setEdgePort: (edgeId, side, value) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, {
      ...editor,
      edges: editor.edges.map((edge) => (edge.edgeId === edgeId ? { ...edge, [side]: value || "main" } : edge))
    });
  },
  setEdgeCondition: (edgeId, patch) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, {
      ...editor,
      edges: editor.edges.map((edge) => {
        if (edge.edgeId !== edgeId) return edge;
        if (patch === null) return { ...edge, condition: null };
        const base = edge.condition || { leftRef: "", operator: "equals", rightValue: "" };
        return { ...edge, condition: { ...base, ...patch } };
      })
    });
  },
  setGraphField: (key, value) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, [key]: value });
  },
  setGraphEnabled: (enabled) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, enabled });
  },
  setScheduleField: (key, value) => {
    const editor = get().editor;
    if (!editor) return;
    commitEditor(set, { ...editor, schedule: { ...editor.schedule, [key]: value } });
  },
  setPathScope: (scope) => {
    const normalized = scope === "memory" ? "memory" : "workspace";
    set({
      pathBrowser: {
        ...INITIAL_PATH_BROWSER,
        scope: normalized,
        rootKey: normalized === "workspace" ? "workspace" : "",
        lastError: ""
      }
    });
  },
  loadLogicPath: (browsePath, rootKey, scope) => {
    const current = get().pathBrowser;
    const nextScope = scope || current.scope || "workspace";
    const nextRootKey = rootKey ?? current.rootKey;
    const nextBrowsePath = browsePath ?? current.browsePath;
    set({
      pathBrowser: {
        ...current,
        loading: true,
        scope: nextScope,
        rootKey: nextRootKey,
        browsePath: nextBrowsePath,
        lastError: ""
      }
    });
    if (!requestDesktopLogicPath.list(nextScope, nextRootKey, nextBrowsePath)) {
      set((state) => ({
        pathBrowser: {
          ...state.pathBrowser,
          loading: false,
          lastError: "Logic path list 요청을 전송하지 못했다."
        }
      }));
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
        const editor = message.graph ? editableFromGraph(message.graph) : null;
        const state = useLogicStore.getState();
        const keepSelected = editor && editor.nodes.some((node) => node.nodeId === state.selectedNodeId)
          ? state.selectedNodeId
          : editor?.nodes[0]?.nodeId || "";
        useLogicStore.setState({
          loadingGraph: false,
          graph,
          editor,
          graphJson: editor ? serializeEditable(editor) : state.graphJson,
          validationProblems: editor ? validateEditableGraph(editor) : [],
          selectedGraphId: graph?.graphId || state.selectedGraphId,
          selectedNodeId: keepSelected,
          selectedEdgeId: editor && editor.edges.some((edge) => edge.edgeId === state.selectedEdgeId) ? state.selectedEdgeId : "",
          lastError: message.ok === false ? String(message.message || "logic graph 조회 실패") : ""
        });
        return;
      }

      if (message.type === "logic_graph_recovery_list_result") {
        const payload = asRecord(message.payload);
        useLogicStore.setState({ recoveryItems: normalizeRecoveryItems(payload.items), loadingRecovery: false });
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

      if (message.type === "logic_path_list_result") {
        const snapshot = normalizeLogicPath(message);
        useLogicStore.setState((state) => ({
          pathBrowser: {
            ...state.pathBrowser,
            loading: false,
            scope: snapshot.scope || state.pathBrowser.scope,
            rootKey: snapshot.rootKey || state.pathBrowser.rootKey,
            browsePath: snapshot.browsePath || "",
            snapshot,
            lastError: snapshot.ok ? "" : snapshot.message
          }
        }));
        return;
      }

      if (message.type === "error") {
        useLogicStore.setState({
          loadingList: false,
          loadingRecovery: false,
          loadingGraph: false,
          pathBrowser: { ...useLogicStore.getState().pathBrowser, loading: false },
          running: false,
          lastError: String(message.message || "오류")
        });
      }
    });
  }, []);
}
