import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopSettings, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopMemory } from "../middleware/memory-gateway";
import { requestDesktopOps } from "../middleware/ops-gateway";

export type ContextPickerTab = "memory" | "workspace" | "paths";
export type ContextPickerSelectionKind = "memory" | "workspace" | "path";

export type ContextPickerSelection = {
  id: string;
  kind: ContextPickerSelectionKind;
  title: string;
  path: string;
  detail: string;
  text: string;
  fromLine?: number;
  lines?: number;
};

export type ContextMemoryResult = {
  path: string;
  title: string;
  detail: string;
  score: string;
  badges: string[];
  fromLine?: number;
  lines?: number;
};

export type ContextPathEntry = {
  name: string;
  isDirectory: boolean;
  browsePath: string;
  selectPath: string;
  description: string;
};

export type ContextPathSnapshot = {
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
  items: ContextPathEntry[];
};

export type ContextPreview = {
  kind: ContextPickerSelectionKind;
  path: string;
  title: string;
  text: string;
  error: string;
  loading: boolean;
};

type ContextPickerState = {
  tab: ContextPickerTab;
  memoryQuery: string;
  memoryLoading: boolean;
  memoryResults: ContextMemoryResult[];
  workspaceBrowsePath: string;
  workspaceSearch: string;
  workspaceLoading: boolean;
  workspacePath: ContextPathSnapshot | null;
  pathScope: "workspace" | "memory";
  pathRootKey: string;
  pathBrowsePath: string;
  pathLoading: boolean;
  pathSnapshot: ContextPathSnapshot | null;
  preview: ContextPreview | null;
  selections: ContextPickerSelection[];
  lastError: string;
  setTab: (tab: ContextPickerTab) => void;
  setMemoryQuery: (query: string) => void;
  searchMemory: () => void;
  previewMemory: (item: ContextMemoryResult) => void;
  selectMemory: (item: ContextMemoryResult) => void;
  setWorkspaceBrowsePath: (path: string) => void;
  setWorkspaceSearch: (query: string) => void;
  loadWorkspace: (browsePath?: string) => void;
  previewWorkspaceFile: (path: string) => void;
  selectWorkspaceFile: (entry: ContextPathEntry) => void;
  setPathScope: (scope: "workspace" | "memory") => void;
  setPathRootKey: (rootKey: string) => void;
  setPathBrowsePath: (path: string) => void;
  loadPathBrowser: (browsePath?: string, rootKey?: string) => void;
  selectPathEntry: (entry: ContextPathEntry) => void;
  addSelection: (selection: ContextPickerSelection) => void;
  removeSelection: (id: string) => void;
  clearSelections: () => void;
  clearPreview: () => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function field(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function compactDetail(value: string, max = 160): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function normalizeMemoryResults(message: DesktopServerMessage): ContextMemoryResult[] {
  return records(message.results).slice(0, 12).map((item) => {
    const path = str(item.path || item.fullPath || item.noteName || item.name || "memory");
    const startLine = positiveNumber(item.startLine);
    const endLine = positiveNumber(item.endLine) || startLine;
    const lines = startLine ? Math.min(160, endLine && endLine >= startLine ? endLine - startLine + 1 : 80) : undefined;
    return {
      path,
      title: path.split(/[\\/]/).filter(Boolean).pop() || path,
      detail: compactDetail(str(item.snippet || item.excerpt || item.summary || "")),
      score: Number(item.score || 0).toFixed(2),
      badges: [
        str(item.memoryTier),
        str(item.source),
        startLine ? `L${startLine}-${endLine || startLine}` : ""
      ].filter(Boolean),
      fromLine: startLine,
      lines
    };
  }).filter((item) => item.path);
}

function normalizePathSnapshot(payload: Record<string, unknown>): ContextPathSnapshot {
  return {
    ok: field(payload, "ok", "Ok") === true,
    message: str(field(payload, "message", "Message")),
    scope: str(field(payload, "scope", "Scope")),
    rootKey: str(field(payload, "rootKey", "RootKey")),
    rootLabel: str(field(payload, "rootLabel", "RootLabel")),
    displayPath: str(field(payload, "displayPath", "DisplayPath")),
    browsePath: str(field(payload, "browsePath", "BrowsePath")),
    parentBrowsePath: str(field(payload, "parentBrowsePath", "ParentBrowsePath")),
    directorySelectPath: str(field(payload, "directorySelectPath", "DirectorySelectPath")),
    roots: records(field(payload, "roots", "Roots")).map((root) => ({
      key: str(field(root, "key", "Key")),
      label: str(field(root, "label", "Label"))
    })).filter((root) => root.key),
    items: records(field(payload, "items", "Items")).map((item) => ({
      name: str(field(item, "name", "Name")),
      isDirectory: field(item, "isDirectory", "IsDirectory") === true,
      browsePath: str(field(item, "browsePath", "BrowsePath")),
      selectPath: str(field(item, "selectPath", "SelectPath")),
      description: str(field(item, "description", "Description"))
    })).filter((item) => item.name)
  };
}

function makeSelectionId(kind: ContextPickerSelectionKind, path: string) {
  return `${kind}:${path}`;
}

function selectionFromMemory(item: ContextMemoryResult, preview?: ContextPreview | null): ContextPickerSelection {
  return {
    id: makeSelectionId("memory", item.path),
    kind: "memory",
    title: item.title || item.path,
    path: item.path,
    detail: item.detail,
    text: preview?.kind === "memory" && preview.path === item.path ? preview.text : "",
    fromLine: item.fromLine,
    lines: item.lines
  };
}

function selectionFromWorkspace(entry: ContextPathEntry, preview?: ContextPreview | null): ContextPickerSelection {
  const path = entry.selectPath || entry.browsePath || entry.name;
  return {
    id: makeSelectionId("workspace", path),
    kind: "workspace",
    title: entry.name || path,
    path,
    detail: entry.description,
    text: preview?.kind === "workspace" && preview.path === path ? preview.text : ""
  };
}

function selectionFromPath(entry: ContextPathEntry): ContextPickerSelection {
  const path = entry.selectPath || entry.browsePath || entry.name;
  return {
    id: makeSelectionId("path", path),
    kind: "path",
    title: entry.name || path,
    path,
    detail: entry.description,
    text: ""
  };
}

export function formatContextSelectionBundle(items: ContextPickerSelection[]): string {
  const selections = items.filter((item) => item.path || item.title);
  if (selections.length === 0) return "";
  return [
    "[선택 문맥]",
    ...selections.map((item, index) => {
      const header = `${index + 1}. ${item.kind} · ${item.path || item.title}`;
      const detail = item.detail ? `   요약: ${item.detail}` : "";
      const text = item.text ? `   원문:\n${item.text.slice(0, 2000)}` : "";
      return [header, detail, text].filter(Boolean).join("\n");
    }),
    "[/선택 문맥]"
  ].join("\n");
}

export function appendContextSelectionBundle(current: string, items: ContextPickerSelection[]): string {
  const block = formatContextSelectionBundle(items);
  if (!block) return current;
  const base = String(current || "").trim();
  return base ? `${base}\n\n${block}` : block;
}

export const useContextPickerStore = create<ContextPickerState>((set, get) => ({
  tab: "memory",
  memoryQuery: "",
  memoryLoading: false,
  memoryResults: [],
  workspaceBrowsePath: "",
  workspaceSearch: "",
  workspaceLoading: false,
  workspacePath: null,
  pathScope: "memory",
  pathRootKey: "",
  pathBrowsePath: "",
  pathLoading: false,
  pathSnapshot: null,
  preview: null,
  selections: [],
  lastError: "",
  setTab: (tab) => set({ tab, lastError: "" }),
  setMemoryQuery: (query) => set({ memoryQuery: query, lastError: "" }),
  searchMemory: () => {
    const query = get().memoryQuery.trim();
    if (!query) {
      set({ lastError: "메모리 검색어를 입력해야 합니다." });
      return;
    }
    set({ tab: "memory", memoryLoading: true, memoryResults: [], lastError: "" });
    if (!requestDesktopSettings.memorySearch(query, 12, 0)) {
      set({ memoryLoading: false, lastError: "메모리 검색 요청을 전송하지 못했습니다." });
    }
  },
  previewMemory: (item) => {
    set({ preview: { kind: "memory", path: item.path, title: item.title, text: "", error: "", loading: true }, lastError: "" });
    if (!requestDesktopMemory.get(item.path, item.fromLine, item.lines)) {
      set({ preview: { kind: "memory", path: item.path, title: item.title, text: "", error: "메모리 원문 요청을 전송하지 못했습니다.", loading: false } });
    }
  },
  selectMemory: (item) => get().addSelection(selectionFromMemory(item, get().preview)),
  setWorkspaceBrowsePath: (path) => set({ workspaceBrowsePath: path, lastError: "" }),
  setWorkspaceSearch: (query) => set({ workspaceSearch: query }),
  loadWorkspace: (browsePath) => {
    const nextPath = browsePath ?? get().workspaceBrowsePath;
    set({ tab: "workspace", workspaceLoading: true, workspaceBrowsePath: nextPath, lastError: "" });
    if (!requestDesktopOps.logicPathList("workspace", "workspace", nextPath)) {
      set({ workspaceLoading: false, lastError: "워크스페이스 경로 목록 요청을 전송하지 못했습니다." });
    }
  },
  previewWorkspaceFile: (path) => {
    const filePath = path.trim();
    if (!filePath) return;
    set({ preview: { kind: "workspace", path: filePath, title: filePath, text: "", error: "", loading: true }, lastError: "" });
    if (!requestDesktopOps.readWorkspaceFile(filePath)) {
      set({ preview: { kind: "workspace", path: filePath, title: filePath, text: "", error: "워크스페이스 파일 읽기 요청을 전송하지 못했습니다.", loading: false } });
    }
  },
  selectWorkspaceFile: (entry) => get().addSelection(selectionFromWorkspace(entry, get().preview)),
  setPathScope: (scope) => set({ pathScope: scope, pathRootKey: scope === "workspace" ? "workspace" : "", pathBrowsePath: "", pathSnapshot: null, lastError: "" }),
  setPathRootKey: (rootKey) => set({ pathRootKey: rootKey, pathBrowsePath: "", lastError: "" }),
  setPathBrowsePath: (path) => set({ pathBrowsePath: path, lastError: "" }),
  loadPathBrowser: (browsePath, rootKey) => {
    const nextPath = browsePath ?? get().pathBrowsePath;
    const nextRootKey = rootKey ?? get().pathRootKey;
    set({ tab: "paths", pathLoading: true, pathBrowsePath: nextPath, pathRootKey: nextRootKey, lastError: "" });
    if (!requestDesktopOps.logicPathList(get().pathScope, nextRootKey || undefined, nextPath)) {
      set({ pathLoading: false, lastError: "문맥 경로 목록 요청을 전송하지 못했습니다." });
    }
  },
  selectPathEntry: (entry) => get().addSelection(selectionFromPath(entry)),
  addSelection: (selection) => set((state) => ({
    selections: [selection, ...state.selections.filter((item) => item.id !== selection.id)].slice(0, 8),
    lastError: ""
  })),
  removeSelection: (id) => set((state) => ({ selections: state.selections.filter((item) => item.id !== id) })),
  clearSelections: () => set({ selections: [] }),
  clearPreview: () => set({ preview: null })
}));

export function useContextPickerBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const state = useContextPickerStore.getState();
      if (message.type === "memory_search_result" && state.memoryLoading) {
        const error = str(message.error);
        useContextPickerStore.setState({
          memoryLoading: false,
          memoryResults: normalizeMemoryResults(message),
          lastError: error
        });
        return;
      }

      if (message.type === "memory_get_result" && state.preview?.loading && state.preview.kind === "memory") {
        const requestedPath = str(field(message, "requestedPath", "path", "memoryPath"));
        if (!requestedPath || requestedPath === state.preview.path) {
          useContextPickerStore.setState({
            preview: {
              ...state.preview,
              path: requestedPath || state.preview.path,
              text: str(field(message, "text", "Text", "content")),
              error: str(field(message, "error", "Error")),
              loading: false
            }
          });
        }
        return;
      }

      if (message.type === "workspace_file_preview" && state.preview?.loading && state.preview.kind === "workspace") {
        const requestedPath = str(field(message, "path", "requestedPath"));
        if (!requestedPath || requestedPath === state.preview.path) {
          const ok = field(message, "ok", "Ok") === true;
          useContextPickerStore.setState({
            preview: {
              ...state.preview,
              path: requestedPath || state.preview.path,
              title: requestedPath || state.preview.title,
              text: str(field(message, "content", "Content")),
              error: ok ? "" : str(field(message, "message", "Message", "error", "Error")),
              loading: false
            }
          });
        }
        return;
      }

      if (message.type === "logic_path_list_result" && (state.workspaceLoading || state.pathLoading)) {
        const snapshot = normalizePathSnapshot(message);
        if (state.workspaceLoading && snapshot.scope === "workspace") {
          useContextPickerStore.setState({
            workspaceLoading: false,
            workspacePath: snapshot,
            workspaceBrowsePath: snapshot.browsePath,
            lastError: snapshot.ok ? "" : snapshot.message
          });
          return;
        }
        if (state.pathLoading) {
          useContextPickerStore.setState({
            pathLoading: false,
            pathSnapshot: snapshot,
            pathRootKey: snapshot.rootKey || state.pathRootKey,
            pathBrowsePath: snapshot.browsePath,
            lastError: snapshot.ok ? "" : snapshot.message
          });
        }
      }
    });
  }, []);
}
