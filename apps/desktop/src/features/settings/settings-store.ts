import { useEffect } from "react";
import { create } from "zustand";
import { requestDesktopSettings, subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";

type MemoryNoteItem = {
  name: string;
  fullPath: string;
  excerpt: string;
  sizeBytes: number;
  lastWriteUtc: string;
};

type SettingsState = {
  memoryNotes: MemoryNoteItem[];
  selectedNoteName: string;
  selectedNoteText: string;
  memorySearchQuery: string;
  memorySearchResults: Array<{ path: string; snippet: string; score: number }>;
  backupIncludeScopes: string[];
  backupPreview: { previewId: string; fileName: string; conversationCount: number; conflictCount: number; fileCount: number; error: string } | null;
  backupPackage: { fileName: string; contentBase64: string } | null;
  lastMessage: string;
  loading: boolean;
  setMemorySearchQuery: (value: string) => void;
  loadMemoryNotes: () => void;
  readMemoryNote: (name: string) => void;
  renameMemoryNote: (name: string) => void;
  deleteSelectedMemoryNotes: () => void;
  clearMemory: () => void;
  searchMemory: () => void;
  setBackupIncludeScopes: (scopes: string[]) => void;
  exportBackup: () => void;
  importBackup: (file: File | null) => void;
  applyBackup: () => void;
  downloadBackupPackage: () => void;
};

const BACKUP_SCOPES = ["conversations", "routines", "routing-policy", "memory-notes", "plans", "tasks", "notebooks", "skills/global", "commands/global", "skills/project", "commands/project"];

export const useSettingsStore = create<SettingsState>((set, get) => ({
  memoryNotes: [],
  selectedNoteName: "",
  selectedNoteText: "",
  memorySearchQuery: "",
  memorySearchResults: [],
  backupIncludeScopes: BACKUP_SCOPES,
  backupPreview: null,
  backupPackage: null,
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
    set({ selectedNoteName: name, loading: true });
    if (!requestDesktopSettings.readMemoryNote(name)) {
      set({ loading: false, lastMessage: "메모리 노트 읽기 요청을 전송하지 못했다." });
    }
  },
  renameMemoryNote: (name) => {
    const current = String(name || "").trim();
    if (!current) return;
    const next = window.prompt("새 메모리 노트 이름", current);
    const newName = String(next || "").trim();
    if (!newName || newName === current) return;
    if (!requestDesktopSettings.renameMemoryNote(current, newName)) {
      set({ lastMessage: "메모리 노트 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteSelectedMemoryNotes: () => {
    const current = String(get().selectedNoteName || "").trim();
    if (!current) return;
    if (!window.confirm(`메모리 노트 "${current}"를 삭제할까요?`)) return;
    if (!requestDesktopSettings.deleteMemoryNotes([current])) {
      set({ lastMessage: "메모리 노트 삭제 요청을 전송하지 못했다." });
    }
  },
  clearMemory: () => {
    if (!window.confirm("메모리 범위를 비울까요?")) return;
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
  }
}));

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
        memorySearchResults: normalizeServerList(message.results, (item) => ({
          path: String(item.path || item.fullPath || ""),
          snippet: String(item.snippet || ""),
          score: Number(item.score || 0)
        })),
        loading: false
      });
      return;
    }

    if (message.type === "memory_get_result") {
      useSettingsStore.setState({
        selectedNoteText: String(message.text || ""),
        loading: false
      });
      return;
    }

    if (message.type === "backup_export_prepare_result") {
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
        loading: false
      });
      return;
    }

    if (message.type === "backup_import_apply_result") {
      useSettingsStore.setState({
        lastMessage: String(message.message || "백업 적용 응답 수신"),
        loading: false
      });
      return;
    }

    if (message.type === "settings_result" || message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
      useSettingsStore.getState().loadMemoryNotes();
      useSettingsStore.setState({
        lastMessage: String(message.message || message.type),
        loading: false
      });
      return;
    }

    if (message.type === "error") {
      useSettingsStore.setState({ loading: false, lastMessage: String(message.message || "오류") });
    }
    });
  }, []);
}
