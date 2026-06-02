/* omnux — settings page state */
(function () {
  const { useState, useEffect, useCallback } = React;
  const noop = () => {};

  const SETTINGS_PERMS = [
    { k: "read", label: "Read files", sub: "Let omnux open and read project files.", v: "allow" },
    { k: "write", label: "Write / edit files", sub: "Always ask before changing files.", v: "ask" },
    { k: "run", label: "Run commands", sub: "Build, test and shell commands.", v: "ask" },
    { k: "network", label: "Network access", sub: "Call APIs and fetch remote data.", v: "allow" },
    { k: "delete", label: "Delete files", sub: "Removing files always needs approval.", v: "deny" },
  ];
  const BACKUP_SCOPE_OPTIONS = [
    { id: "conversations", label: "대화" },
    { id: "routines", label: "루틴" },
    { id: "routing-policy", label: "라우팅 정책" },
    { id: "memory-notes", label: "메모리" },
    { id: "plans", label: "계획" },
    { id: "tasks", label: "Tasks" },
    { id: "notebooks", label: "Notebooks" },
    { id: "skills/global", label: "전역 스킬" },
    { id: "commands/global", label: "전역 명령" },
    { id: "skills/project", label: "프로젝트 스킬" },
    { id: "commands/project", label: "프로젝트 명령" },
  ];
  const ALL_BACKUP_SCOPE_IDS = BACKUP_SCOPE_OPTIONS.map((item) => item.id);

  function normalizeStringArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map((value) => String(value || "").trim()).filter(Boolean);
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
  }

  function downloadBackupPackage(result) {
    if (!result || !result.ok || !result.contentBase64) return false;
    try {
      const binary = window.atob(result.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName || "omnux-portable-backup.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (error) {
      console.warn("backup download failed", error);
      return false;
    }
  }

  function useSettingsMemoryState(ctx) {
    const notes = Array.isArray(ctx.memoryNotes) ? ctx.memoryNotes : [];
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [preview, setPreview] = useState("");
    const [backupExport, setBackupExport] = useState(null);
    const [backupPreview, setBackupPreview] = useState(null);
    const [backupImport, setBackupImport] = useState(null);
    const [backupSelectedScopes, setBackupSelectedScopes] = useState(ALL_BACKUP_SCOPE_IDS);
    const [backupPending, setBackupPending] = useState({
      export: false,
      preview: false,
      apply: false,
      cloudSync: false
    });
    const [syncConfig, setSyncConfig] = useState({
      gistId: "",
      gitHubTokenSet: false,
      lastSyncUtc: ""
    });
    const sendMessage = typeof ctx.send === "function" ? ctx.send : noop;
    const toast = typeof ctx.toast === "function" ? ctx.toast : noop;

    const filtered = notes.filter((note) => {
      const text = `${note.name || ""} ${note.excerpt || ""} ${note.fullPath || ""}`.toLowerCase();
      return text.includes(search.trim().toLowerCase());
    });

    const refresh = useCallback(() => {
      sendMessage({ type: "list_memory_notes" }, { queueIfClosed: true });
      sendMessage({ type: "sync_config_read" }, { queueIfClosed: true });
    }, [sendMessage]);
    const readNote = useCallback((name) => {
      setSelected(name);
      sendMessage({ type: "read_memory_note", noteName: name }, { queueIfClosed: true });
    }, [sendMessage]);
    const deleteNote = useCallback((name) => {
      const target = String(name || "").trim();
      if (!target) return;
      if (typeof window.confirm === "function" && !window.confirm(`메모리 노트 "${target}"를 삭제할까요?`)) return;
      const sent = sendMessage({ type: "delete_memory_notes", memoryNotes: [target] }, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
        return;
      }
      if (selected === target) {
        setSelected(null);
        setPreview("");
      }
    }, [sendMessage, toast, selected]);
    const renameNote = useCallback((name) => {
      const target = String(name || "").trim();
      if (!target) return;
      const input = typeof window.prompt === "function"
        ? window.prompt("새 메모리 노트 이름을 입력하세요.", target)
        : null;
      const newName = String(input || "").trim();
      if (!newName || newName === target) return;
      const sent = sendMessage({ type: "rename_memory_note", noteName: target, newName }, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
        return;
      }
      // 이름만 바뀌고 내용은 동일하므로 선택 상태만 새 이름으로 옮긴다.
      if (selected === target) setSelected(newName);
    }, [sendMessage, toast, selected]);
    const clearMemory = useCallback((scope = "chat") => {
      const normalized = String(scope || "chat").trim() || "chat";
      if (typeof window.confirm === "function"
        && !window.confirm(`'${normalized}' 범위의 대화와 메모리 노트를 모두 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) {
        return;
      }
      const sent = sendMessage({ type: "clear_memory", scope: normalized }, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
        return;
      }
      setSelected(null);
      setPreview("");
    }, [sendMessage, toast]);
    const requestBackupExport = useCallback(() => {
      if (backupSelectedScopes.length === 0) {
        toast("백업 범위를 하나 이상 선택하세요.");
        return;
      }

      setBackupPending((current) => ({ ...current, export: true }));
      const sent = sendMessage({
        type: "backup_export_prepare",
        includeScopes: backupSelectedScopes
      }, { queueIfClosed: true });
      if (!sent) {
        setBackupPending((current) => ({ ...current, export: false }));
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [backupSelectedScopes, sendMessage, toast]);
    const toggleBackupScope = useCallback((scopeId) => {
      const normalized = String(scopeId || "").trim();
      if (!normalized) return;
      setBackupSelectedScopes((current) => {
        if (current.includes(normalized)) {
          return current.filter((item) => item !== normalized);
        }
        return ALL_BACKUP_SCOPE_IDS.filter((item) => item === normalized || current.includes(item));
      });
    }, []);
    const selectAllBackupScopes = useCallback(() => {
      setBackupSelectedScopes(ALL_BACKUP_SCOPE_IDS);
    }, []);
    const importBackupFile = useCallback(async (file) => {
      if (!file) return;
      setBackupPending((current) => ({ ...current, preview: true }));
      setBackupPreview(null);
      setBackupImport(null);

      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentBase64 = bytesToBase64(bytes);
        const sent = sendMessage({
          type: "backup_import_preview",
          fileName: file.name || "backup.zip",
          contentBase64
        }, { queueIfClosed: true });
        if (!sent) {
          setBackupPending((current) => ({ ...current, preview: false }));
          toast("미들웨어 연결이 필요합니다.");
        }
      } catch (error) {
        setBackupPending((current) => ({ ...current, preview: false }));
        setBackupPreview({
          ok: false,
          previewId: "",
          fileName: file.name || "backup.zip",
          conversationCount: 0,
          conflictCount: 0,
          fileConflictCount: 0,
          fileCount: 0,
          conflicts: [],
          fileConflicts: [],
          syncMode: "unknown",
          syncConflictPolicy: "unknown",
          error: error && error.message ? error.message : "백업 파일을 읽을 수 없습니다."
        });
        toast("백업 파일을 읽을 수 없습니다.");
      }
    }, [sendMessage, toast]);
    const applyBackupImport = useCallback((previewId, overwrite = false) => {
      const normalizedPreviewId = String(previewId || "").trim();
      if (!normalizedPreviewId) {
        toast("previewId가 필요합니다.");
        return;
      }

      setBackupPending((current) => ({ ...current, apply: true }));
      const sent = sendMessage({
        type: "backup_import_apply",
        previewId: normalizedPreviewId,
        overwrite: !!overwrite
      }, { queueIfClosed: true });
      if (!sent) {
        setBackupPending((current) => ({ ...current, apply: false }));
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    const saveSyncConfig = useCallback((gistId, gitHubToken) => {
      sendMessage({
        type: "sync_config_write",
        gistId: gistId,
        gitHubToken: gitHubToken
      }, { queueIfClosed: true });
      toast("클라우드 동기화 설정을 저장했습니다.");
    }, [sendMessage, toast]);

    const requestCloudSyncUpload = useCallback(() => {
      setBackupPending((current) => ({ ...current, cloudSync: true }));
      const sent = sendMessage({
        type: "cloud_sync_upload",
        includeScopes: backupSelectedScopes
      }, { queueIfClosed: true });
      if (!sent) {
        setBackupPending((current) => ({ ...current, cloudSync: false }));
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [backupSelectedScopes, sendMessage, toast]);

    const requestCloudSyncDownload = useCallback((gistId) => {
      setBackupPending((current) => ({ ...current, cloudSync: true }));
      setBackupPreview(null);
      setBackupImport(null);
      const sent = sendMessage({
        type: "cloud_sync_download",
        gistId: gistId
      }, { queueIfClosed: true });
      if (!sent) {
        setBackupPending((current) => ({ ...current, cloudSync: false }));
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === "memory_note_content") {
          setPreview(msg.content || "");
          setSelected((current) => msg.name || current);
        }
        if (msg.type === "memory_note_deleted") {
          toast(msg.ok
            ? (msg.message || `메모리 노트 ${Number(msg.removed) || 0}개를 삭제했습니다.`)
            : (msg.message || "메모리 노트 삭제에 실패했습니다."));
        }
        if (msg.type === "memory_note_renamed") {
          toast(msg.ok
            ? (msg.message || "메모리 노트 이름을 변경했습니다.")
            : (msg.message || "메모리 노트 이름 변경에 실패했습니다."));
        }
        if (msg.type === "memory_cleared") {
          toast(msg.message ? `메모리를 비웠습니다 (${msg.message})` : "메모리를 비웠습니다.");
        }
        if (msg.type === "backup_export_result") {
          setBackupPending((current) => ({ ...current, export: false }));
          setBackupExport({
            ok: !!msg.ok,
            fileName: msg.fileName || "",
            sizeBytes: Number(msg.sizeBytes) || 0,
            scope: normalizeStringArray(msg.scope),
            included: normalizeStringArray(msg.included),
            excluded: normalizeStringArray(msg.excluded),
            error: msg.error || ""
          });
          const downloaded = downloadBackupPackage(msg);
          toast(msg.ok
            ? (downloaded ? "이식 패키지를 내려받았습니다." : "백업을 준비했습니다.")
            : "백업 내보내기에 실패했습니다.");
        }
        if (msg.type === "backup_import_preview_result") {
          setBackupPending((current) => ({ ...current, preview: false }));
          setBackupPreview({
            ok: !!msg.ok,
            previewId: msg.previewId || "",
            fileName: msg.fileName || "",
            conversationCount: Number(msg.conversationCount) || 0,
            conflictCount: Number(msg.conversationConflictCount) || 0,
            fileConflictCount: Number(msg.fileConflictCount) || 0,
            fileCount: Number(msg.fileCount) || 0,
            conflicts: normalizeStringArray(msg.conflicts),
            fileConflicts: normalizeStringArray(msg.fileConflicts),
            syncMode: msg.syncMode || "unknown",
            syncConflictPolicy: msg.syncConflictPolicy || "unknown",
            error: msg.error || ""
          });
          toast(msg.ok ? "백업 가져오기 미리보기를 준비했습니다." : "백업 미리보기에 실패했습니다.");
        }
        if (msg.type === "backup_import_result") {
          setBackupPending((current) => ({ ...current, apply: false }));
          setBackupImport({
            ok: !!msg.ok,
            importedConversations: Number(msg.importedConversations) || 0,
            skippedConversations: Number(msg.skippedConversations) || 0,
            overwrittenConversations: Number(msg.overwrittenConversations) || 0,
            importedFiles: Number(msg.importedFiles) || 0,
            skippedFiles: Number(msg.skippedFiles) || 0,
            error: msg.error || ""
          });
          toast(msg.ok ? "백업을 적용했습니다." : "백업 적용에 실패했습니다.");
        }
        if (msg.type === "sync_config_state") {
          setSyncConfig({
            gistId: msg.gistId || "",
            gitHubTokenSet: !!msg.gitHubTokenSet,
            lastSyncUtc: msg.lastSyncUtc || ""
          });
        }
        if (msg.type === "cloud_sync_upload_result") {
          setBackupPending((current) => ({ ...current, cloudSync: false }));
          toast("클라우드(Gist)로 동기화 백업을 내보냈습니다.");
        }
        if (msg.type === "error") {
          setBackupPending((current) => ({ ...current, export: false, preview: false, apply: false, cloudSync: false }));
          if (msg.message && msg.message.includes("GitHub Token")) {
            toast(msg.message);
          }
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [toast]);

    return {
      search,
      setSearch,
      selected,
      preview,
      filtered,
      refresh,
      readNote,
      deleteNote,
      renameNote,
      clearMemory,
      backup: {
        exportResult: backupExport,
        previewResult: backupPreview,
        importResult: backupImport,
        pending: backupPending,
        scopeOptions: BACKUP_SCOPE_OPTIONS,
        selectedScopes: backupSelectedScopes,
        toggleScope: toggleBackupScope,
        selectAllScopes: selectAllBackupScopes
      },
      syncConfig,
      requestBackupExport,
      importBackupFile,
      applyBackupImport,
      saveSyncConfig,
      requestCloudSyncUpload,
      requestCloudSyncDownload
    };
  }

  function useSettingsPermissionState() {
    const [state, setState] = useState(Object.fromEntries(SETTINGS_PERMS.map((p) => [p.k, p.v])));
    return {
      state,
      setState
    };
  }

  function useSettingsPageState(ctx, payload) {
    const [tab, setTab] = useState((payload && payload.tab) || "general");
    const memory = useSettingsMemoryState(ctx);
    const permissions = useSettingsPermissionState();

    return {
      tab,
      setTab,
      memory,
      permissions,
      perms: SETTINGS_PERMS
    };
  }

  Object.assign(window, {
    SETTINGS_PERMS,
    useSettingsMemoryState,
    useSettingsPermissionState,
    useSettingsPageState
  });
})();
