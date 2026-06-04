import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopSettings, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { requestDesktopLlm, type LlmCredentialInput } from "../middleware/llm-gateway";
import { requestDesktopMemory } from "../middleware/memory-gateway";
import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { normalizeMemoryIndexStatus, normalizeMemorySearchResults, type MemoryIndexStatus, type MemorySearchResultItem } from "./settings-memory";

type MemoryNoteItem = {
  name: string;
  fullPath: string;
  excerpt: string;
  sizeBytes: number;
  lastWriteUtc: string;
};
type SyncConfigState = {
  gistId: string;
  gitHubTokenSet: boolean;
  lastSyncUtc: string;
};
type SyncConfigDraft = {
  gistId: string;
  gitHubToken: string;
};
type SettingsState = {
  memoryNotes: MemoryNoteItem[];
  selectedNoteName: string;
  selectedNoteText: string;
  selectedMemoryKind: "note" | "result" | "";
  selectedMemoryError: string;
  memorySearchQuery: string;
  memorySearchResults: MemorySearchResultItem[];
  memoryIndexStatus: MemoryIndexStatus;
  backupIncludeScopes: string[];
  backupPreview: { previewId: string; fileName: string; conversationCount: number; conflictCount: number; fileCount: number; error: string } | null;
  backupPackage: { fileName: string; contentBase64: string } | null;
  syncConfig: SyncConfigState;
  syncDraft: SyncConfigDraft;
  cloudSyncMessage: string;
  cerebrasModels: { selected: string; items: Array<{ id: string; ownedBy: string; created: string }> };
  groqModels: { selected: string; items: string[] };
  copilotModels: { selected: string; items: string[] };
  copilotStatus: { text: string; detail: string };
  codexStatus: { text: string; detail: string };
  llmUsage: {
    geminiTotalTokens: number;
    geminiCostUsd: string;
    copilotAvailable: boolean;
    copilotPlan: string;
    copilotUsedRequests: string;
    copilotMonthlyQuota: string;
    copilotPercentUsed: string;
  } | null;
  llmMessage: string;
  lastMessage: string;
  loading: boolean;
  setMemorySearchQuery: (value: string) => void;
  loadMemoryNotes: () => void;
  readMemoryNote: (name: string) => void;
  openMemoryResult: (result: MemorySearchResultItem) => void;
  rebuildMemoryIndex: () => void;
  renameMemoryNote: (name: string) => void;
  deleteSelectedMemoryNotes: () => void;
  clearMemory: () => void;
  searchMemory: () => void;
  setBackupIncludeScopes: (scopes: string[]) => void;
  exportBackup: () => void;
  importBackup: (file: File | null) => void;
  applyBackup: () => void;
  downloadBackupPackage: () => void;
  loadSyncConfig: () => void;
  setSyncDraft: (patch: Partial<SyncConfigDraft>) => void;
  saveSyncConfig: () => void;
  clearSyncToken: () => void;
  cloudSyncUpload: () => void;
  cloudSyncDownload: () => void;
  loadCerebrasModels: () => void;
  loadLlmServices: () => void;
  refreshCliStatus: () => void;
  setGroqModel: (model: string) => void;
  setCopilotModel: (model: string) => void;
  startCopilotLogin: () => void;
  startCodexLogin: () => void;
  logoutCodex: () => void;
  saveLlmCredentials: (keys: LlmCredentialInput) => void;
  deleteLlmCredentials: () => void;
};

const BACKUP_SCOPES = ["conversations", "routines", "routing-policy", "memory-notes", "plans", "tasks", "notebooks", "skills/global", "commands/global", "skills/project", "commands/project"];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  memoryNotes: [],
  selectedNoteName: "",
  selectedNoteText: "",
  selectedMemoryKind: "",
  selectedMemoryError: "",
  memorySearchQuery: "",
  memorySearchResults: [],
  memoryIndexStatus: null,
  backupIncludeScopes: BACKUP_SCOPES,
  backupPreview: null,
  backupPackage: null,
  syncConfig: { gistId: "", gitHubTokenSet: false, lastSyncUtc: "" },
  syncDraft: { gistId: "", gitHubToken: "" },
  cloudSyncMessage: "",
  cerebrasModels: { selected: "", items: [] },
  groqModels: { selected: "", items: [] },
  copilotModels: { selected: "", items: [] },
  copilotStatus: { text: "조회 전", detail: "-" },
  codexStatus: { text: "조회 전", detail: "-" },
  llmUsage: null,
  llmMessage: "",
  lastMessage: "",
  loading: false,
  setMemorySearchQuery: (value) => set({ memorySearchQuery: value }),
  loadMemoryNotes: () => {
    set({ loading: true });
    if (!requestDesktopSettings.listMemoryNotes()) {
      set({ loading: false, lastMessage: "메모리 노트 요청을 전송하지 못했다." });
    }
  },
  readMemoryNote: (name) => {
    if (!name) return;
    set({ selectedNoteName: name, selectedMemoryKind: "note", selectedMemoryError: "", loading: true });
    if (!requestDesktopSettings.readMemoryNote(name)) {
      set({ loading: false, lastMessage: "메모리 노트 읽기 요청을 전송하지 못했다." });
    }
  },
  openMemoryResult: (result) => {
    const path = String(result.path || "").trim();
    if (!path) return;
    const fromLine = result.startLine > 0 ? result.startLine : undefined;
    const lines = fromLine && result.endLine >= result.startLine ? Math.min(160, result.endLine - result.startLine + 1) : undefined;
    set({ selectedNoteName: path, selectedMemoryKind: "result", selectedMemoryError: "", loading: true });
    if (!requestDesktopMemory.get(path, fromLine, lines)) {
      set({ loading: false, lastMessage: "메모리 상세 읽기 요청을 전송하지 못했다." });
    }
  },
  rebuildMemoryIndex: () => {
    set({ loading: true, memoryIndexStatus: null });
    if (!requestDesktopMemory.rebuildIndex()) {
      set({ loading: false, lastMessage: "메모리 인덱스 재구축 요청을 전송하지 못했다." });
    }
  },
  renameMemoryNote: async (name) => {
    const current = String(name || "").trim();
    if (!current) return;
    const next = await requestPromptDialog({
      title: "메모리 노트 이름 변경",
      message: "새 메모리 노트 이름을 입력하세요.",
      defaultValue: current,
      placeholder: "메모리 노트 이름"
    });
    const newName = String(next || "").trim();
    if (!newName || newName === current) return;
    if (!requestDesktopSettings.renameMemoryNote(current, newName)) {
      set({ lastMessage: "메모리 노트 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteSelectedMemoryNotes: async () => {
    const current = String(get().selectedNoteName || "").trim();
    if (!current) return;
    const confirmed = await requestConfirmDialog({
      title: "메모리 노트 삭제",
      message: `메모리 노트 "${current}"를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSettings.deleteMemoryNotes([current])) {
      set({ lastMessage: "메모리 노트 삭제 요청을 전송하지 못했다." });
    }
  },
  clearMemory: async () => {
    const confirmed = await requestConfirmDialog({
      title: "메모리 비우기",
      message: "현재 대화 메모리 범위를 비울까요?",
      confirmLabel: "비우기",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSettings.clearMemory("chat")) {
      set({ lastMessage: "메모리 비우기 요청을 전송하지 못했다." });
    }
  },
  searchMemory: () => {
    const query = String(get().memorySearchQuery || "").trim();
    if (!query) return;
    set({ loading: true });
    if (!requestDesktopSettings.memorySearch(query, 10, 0)) {
      set({ loading: false, lastMessage: "메모리 검색 요청을 전송하지 못했다." });
    }
  },
  setBackupIncludeScopes: (scopes) => set({ backupIncludeScopes: scopes.filter(Boolean) }),
  exportBackup: () => {
    const scopes = get().backupIncludeScopes;
    if (scopes.length === 0) return;
    set({ loading: true });
    if (!requestDesktopSettings.backupExportPrepare(scopes)) {
      set({ loading: false, lastMessage: "백업 내보내기 요청을 전송하지 못했다." });
    }
  },
  importBackup: async (file) => {
    if (!file) return;
    set({ loading: true });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      if (!requestDesktopSettings.backupImportPreview(file.name || "backup.zip", window.btoa(binary))) {
        set({ loading: false, lastMessage: "백업 미리보기 요청을 전송하지 못했다." });
      }
    } catch (error) {
      set({ loading: false, lastMessage: error instanceof Error ? error.message : "백업 파일을 읽지 못했다." });
    }
  },
  applyBackup: () => {
    const previewId = String(get().backupPreview?.previewId || "").trim();
    if (!previewId) return;
    set({ loading: true });
    if (!requestDesktopSettings.backupImportApply(previewId, false)) {
      set({ loading: false, lastMessage: "백업 적용 요청을 전송하지 못했다." });
    }
  },
  downloadBackupPackage: () => {
    const backupPackage = get().backupPackage;
    if (!backupPackage?.contentBase64) return;
    const binary = window.atob(backupPackage.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupPackage.fileName || "omnux-backup.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  },
  loadSyncConfig: () => {
    set({ loading: true, cloudSyncMessage: "" });
    if (!requestDesktopSettings.syncConfigRead()) {
      set({ loading: false, cloudSyncMessage: "클라우드 동기화 설정 요청을 전송하지 못했다." });
    }
  },
  setSyncDraft: (patch) => set({ syncDraft: { ...get().syncDraft, ...patch } }),
  saveSyncConfig: () => {
    const draft = get().syncDraft;
    const payload: { gistId?: string; gitHubToken?: string } = { gistId: draft.gistId.trim() };
    if (draft.gitHubToken.trim()) payload.gitHubToken = draft.gitHubToken.trim();
    set({ loading: true, cloudSyncMessage: "" });
    if (!requestDesktopSettings.syncConfigWrite(payload)) {
      set({ loading: false, cloudSyncMessage: "클라우드 동기화 설정 저장 요청을 전송하지 못했다." });
    }
  },
  clearSyncToken: async () => {
    const confirmed = await requestConfirmDialog({
      title: "GitHub Token 삭제",
      message: "클라우드 동기화용 GitHub Token을 삭제할까요?",
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    set({ loading: true, cloudSyncMessage: "" });
    if (!requestDesktopSettings.syncConfigWrite({ gitHubToken: "" })) {
      set({ loading: false, cloudSyncMessage: "GitHub Token 삭제 요청을 전송하지 못했다." });
    }
  },
  cloudSyncUpload: () => {
    const scopes = get().backupIncludeScopes;
    if (scopes.length === 0) {
      set({ cloudSyncMessage: "업로드할 백업 범위를 먼저 선택하세요." });
      return;
    }
    set({ loading: true, cloudSyncMessage: "Gist 업로드를 시작합니다." });
    if (!requestDesktopSettings.cloudSyncUpload(scopes)) {
      set({ loading: false, cloudSyncMessage: "클라우드 업로드 요청을 전송하지 못했다." });
    }
  },
  cloudSyncDownload: () => {
    const gistId = get().syncDraft.gistId.trim() || get().syncConfig.gistId.trim();
    set({ loading: true, cloudSyncMessage: "Gist 백업을 내려받아 미리보기를 준비합니다." });
    if (!requestDesktopSettings.cloudSyncDownload(gistId || undefined)) {
      set({ loading: false, cloudSyncMessage: "클라우드 다운로드 요청을 전송하지 못했다." });
    }
  },
  loadCerebrasModels: () => {
    set({ loading: true });
    if (!requestDesktopSettings.cerebrasModels()) {
      set({ loading: false, lastMessage: "Cerebras 모델 조회 요청을 전송하지 못했다." });
    }
  },
  loadLlmServices: () => {
    set({ llmMessage: "" });
    requestDesktopLlm.groqModels();
    requestDesktopLlm.copilotModels();
    requestDesktopLlm.copilotStatus();
    requestDesktopLlm.codexStatus();
    requestDesktopLlm.usageStats();
  },
  refreshCliStatus: () => {
    set({ llmMessage: "" });
    requestDesktopLlm.copilotStatus();
    requestDesktopLlm.codexStatus();
  },
  setGroqModel: (model) => {
    if (!model.trim()) return;
    if (!requestDesktopLlm.setGroqModel(model)) set({ llmMessage: "Groq 모델 적용 요청을 전송하지 못했다." });
  },
  setCopilotModel: (model) => {
    if (!model.trim()) return;
    if (!requestDesktopLlm.setCopilotModel(model)) set({ llmMessage: "Copilot 모델 적용 요청을 전송하지 못했다." });
  },
  startCopilotLogin: () => {
    if (!requestDesktopLlm.startCopilotLogin()) set({ llmMessage: "Copilot 로그인 요청을 전송하지 못했다." });
  },
  startCodexLogin: () => {
    set({ codexStatus: { text: "로그인 시작 중", detail: "브라우저 인증 흐름을 시작하는 중입니다." } });
    if (!requestDesktopLlm.startCodexLogin()) set({ llmMessage: "Codex OAuth 로그인 요청을 전송하지 못했다." });
  },
  logoutCodex: () => {
    set({ codexStatus: { text: "로그아웃 처리 중", detail: "Codex 인증 정보를 정리하는 중입니다." } });
    if (!requestDesktopLlm.logoutCodex()) set({ llmMessage: "Codex OAuth 로그아웃 요청을 전송하지 못했다." });
  },
  saveLlmCredentials: (keys) => {
    if (!requestDesktopLlm.setCredentials(keys, true)) set({ llmMessage: "API 키 저장 요청을 전송하지 못했다." });
  },
  deleteLlmCredentials: async () => {
    const confirmed = await requestConfirmDialog({
      title: "API 키 삭제",
      message: "저장된 LLM API 키를 삭제할까요? (세션과 영속 저장 모두)",
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopLlm.deleteCredentials(true)) set({ llmMessage: "API 키 삭제 요청을 전송하지 못했다." });
  }
}));

function normalizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : String((item as Record<string, unknown>)?.id || (item as Record<string, unknown>)?.model || "")))
    .filter(Boolean);
}

function statusText(installed: boolean, authenticated: boolean, mode: string): string {
  if (!installed) return "미설치";
  return authenticated ? `설치/인증 완료 (${mode || "-"})` : `설치됨, 미인증 (${mode || "-"})`;
}

function normalizeServerList<T>(value: unknown, mapper: (item: Record<string, unknown>) => T): T[] {
  return Array.isArray(value) ? value.map((item) => mapper(item as Record<string, unknown>)) : [];
}

export function useSettingsPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
    if (message.type === "memory_notes") {
      useSettingsStore.setState({
        memoryNotes: normalizeServerList(message.items, (item) => ({
          name: String(item.name || ""),
          fullPath: String(item.fullPath || ""),
          excerpt: String(item.excerpt || ""),
          sizeBytes: Number(item.sizeBytes || 0),
          lastWriteUtc: String(item.lastWriteUtc || "")
        })),
        loading: false
      });
      return;
    }

    if (message.type === "memory_search_result") {
      useSettingsStore.setState({
        memorySearchResults: normalizeMemorySearchResults(message.results),
        loading: false
      });
      return;
    }

    if (message.type === "memory_note_content") {
      useSettingsStore.setState({
        selectedNoteName: String(message.name || ""),
        selectedNoteText: String(message.content || ""),
        selectedMemoryKind: "note",
        selectedMemoryError: "",
        loading: false
      });
      return;
    }

    if (message.type === "memory_get_result") {
      useSettingsStore.setState({
        selectedNoteName: String(message.requestedPath || message.path || ""),
        selectedNoteText: String(message.text || ""),
        selectedMemoryKind: "result",
        selectedMemoryError: String(message.error || ""),
        loading: false
      });
      return;
    }

    if (message.type === "memory_index_rebuild_result") {
      useSettingsStore.setState({
        memoryIndexStatus: normalizeMemoryIndexStatus(message),
        lastMessage: String(message.message || "메모리 인덱스 재구축 응답 수신"),
        loading: false
      });
      return;
    }

    if (message.type === "backup_export_result" || message.type === "backup_export_prepare_result") {
      useSettingsStore.setState({
        backupPackage: message.contentBase64
          ? {
              fileName: String(message.fileName || "omnux-backup.zip"),
              contentBase64: String(message.contentBase64 || "")
            }
          : null,
        lastMessage: String(message.message || "백업 내보내기 응답 수신"),
        loading: false
      });
      return;
    }

    if (message.type === "backup_import_preview_result") {
      useSettingsStore.setState({
        backupPreview: {
          previewId: String(message.previewId || ""),
          fileName: String(message.fileName || ""),
          conversationCount: Number(message.conversationCount || 0),
          conflictCount: Number(message.conflictCount || 0),
          fileCount: Number(message.fileCount || 0),
          error: String(message.error || "")
        },
        cloudSyncMessage: "다운로드한 백업 미리보기를 준비했습니다. 적용 전 충돌 수를 확인하세요.",
        loading: false
      });
      return;
    }

    if (message.type === "backup_import_result" || message.type === "backup_import_apply_result") {
      useSettingsStore.setState({
        lastMessage: String(message.message || "백업 적용 응답 수신"),
        cloudSyncMessage: "",
        loading: false
      });
      return;
    }

    if (message.type === "sync_config_state") {
      const gistId = String(message.gistId || "");
      useSettingsStore.setState({
        syncConfig: {
          gistId,
          gitHubTokenSet: !!message.gitHubTokenSet,
          lastSyncUtc: String(message.lastSyncUtc || "")
        },
        syncDraft: {
          gistId,
          gitHubToken: ""
        },
        cloudSyncMessage: "클라우드 동기화 설정을 불러왔습니다.",
        loading: false
      });
      return;
    }

    if (message.type === "cloud_sync_upload_result") {
      const gistId = String(message.gistId || "");
      useSettingsStore.setState((state) => ({
        syncConfig: {
          ...state.syncConfig,
          gistId,
          lastSyncUtc: String(message.lastSyncUtc || "")
        },
        syncDraft: { ...state.syncDraft, gistId, gitHubToken: "" },
        cloudSyncMessage: "클라우드 업로드가 완료됐습니다.",
        loading: false
      }));
      return;
    }

    if (message.type === "cerebras_models") {
      useSettingsStore.setState({
        cerebrasModels: {
          selected: String(message.selected || ""),
          items: normalizeServerList(message.items, (item) => ({
            id: String(item.id || ""),
            ownedBy: String(item.owned_by || item.ownedBy || ""),
            created: String(item.created || "")
          }))
        },
        loading: false
      });
      return;
    }

    if (message.type === "groq_models") {
      useSettingsStore.setState({ groqModels: { selected: String(message.selected || ""), items: normalizeModelIds(message.items) } });
      return;
    }
    if (message.type === "copilot_models") {
      useSettingsStore.setState({ copilotModels: { selected: String(message.selected || ""), items: normalizeModelIds(message.items) } });
      return;
    }
    if (message.type === "copilot_status") {
      useSettingsStore.setState({ copilotStatus: { text: statusText(!!message.installed, !!message.authenticated, String(message.mode || "")), detail: String(message.detail || "-") } });
      return;
    }
    if (message.type === "codex_status") {
      useSettingsStore.setState({ codexStatus: { text: statusText(!!message.installed, !!message.authenticated, String(message.mode || "")), detail: String(message.detail || "-") } });
      return;
    }
    if (message.type === "groq_model_set" || message.type === "copilot_model_set") {
      const provider = message.type === "groq_model_set" ? "Groq" : "Copilot";
      useSettingsStore.setState({ llmMessage: message.ok ? `${provider} 모델을 ${String(message.model || "-")}로 적용했습니다.` : String(message.message || `${provider} 모델 적용 실패`) });
      if (message.type === "groq_model_set") requestDesktopLlm.groqModels();
      else requestDesktopLlm.copilotModels();
      return;
    }
    if (message.type === "usage_stats") {
      const gemini = (message.gemini || {}) as Record<string, unknown>;
      const premium = (message.copilotPremium || {}) as Record<string, unknown>;
      useSettingsStore.setState({
        llmUsage: {
          geminiTotalTokens: Number(gemini.total_tokens || 0),
          geminiCostUsd: String(gemini.estimated_cost_usd || "0.000000"),
          copilotAvailable: !!premium.available,
          copilotPlan: String(premium.plan_name || "-"),
          copilotUsedRequests: String(premium.used_requests || "0.0"),
          copilotMonthlyQuota: String(premium.monthly_quota || "0.0"),
          copilotPercentUsed: String(premium.percent_used || "0.00")
        }
      });
      return;
    }
    if (message.type === "copilot_login_result") {
      useSettingsStore.setState({ llmMessage: String(message.message || "Copilot 로그인 요청을 시작했습니다.") });
      requestDesktopLlm.copilotStatus();
      return;
    }
    if (message.type === "codex_login_result" || message.type === "codex_logout_result") {
      useSettingsStore.setState({ llmMessage: String(message.message || "Codex OAuth 요청을 처리했습니다.") });
      requestDesktopLlm.codexStatus();
      return;
    }
    if (message.type === "llm_credentials_result" || message.type === "set_llm_credentials_result" || message.type === "delete_llm_credentials_result") {
      useSettingsStore.setState({ llmMessage: String(message.message || "API 키 설정을 갱신했습니다.") });
      return;
    }

    if (message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
      useSettingsStore.getState().loadMemoryNotes();
      useSettingsStore.setState({
        lastMessage: String(message.message || message.type),
        loading: false
      });
      return;
    }
    if (message.type === "settings_result") {
      useSettingsStore.setState({ lastMessage: String(message.message || "설정 응답 수신"), loading: false });
      return;
    }

    if (message.type === "error") {
      useSettingsStore.setState({ loading: false, lastMessage: String(message.message || "오류") });
    }
    });
  }, []);
}
