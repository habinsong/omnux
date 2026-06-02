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
    const [backupPending, setBackupPending] = useState({
      export: false,
      preview: false,
      apply: false
    });
    const sendMessage = typeof ctx.send === "function" ? ctx.send : noop;
    const toast = typeof ctx.toast === "function" ? ctx.toast : noop;

    const filtered = notes.filter((note) => {
      const text = `${note.name || ""} ${note.excerpt || ""} ${note.fullPath || ""}`.toLowerCase();
      return text.includes(search.trim().toLowerCase());
    });

    const refresh = useCallback(() => sendMessage({ type: "list_memory_notes" }, { queueIfClosed: true }), [sendMessage]);
    const readNote = useCallback((name) => {
      setSelected(name);
      sendMessage({ type: "read_memory_note", noteName: name }, { queueIfClosed: true });
    }, [sendMessage]);
    const requestBackupExport = useCallback(() => {
      setBackupPending((current) => ({ ...current, export: true }));
      const sent = sendMessage({ type: "backup_export_prepare" }, { queueIfClosed: true });
      if (!sent) {
        setBackupPending((current) => ({ ...current, export: false }));
        toast("미들웨어 연결이 필요합니다.");
      }
    }, [sendMessage, toast]);
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
          fileCount: 0,
          conflicts: [],
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

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === "memory_note_content") {
          setPreview(msg.content || "");
          setSelected((current) => msg.name || current);
        }
        if (msg.type === "backup_export_result") {
          setBackupPending((current) => ({ ...current, export: false }));
          setBackupExport({
            ok: !!msg.ok,
            fileName: msg.fileName || "",
            sizeBytes: Number(msg.sizeBytes) || 0,
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
            fileCount: Number(msg.fileCount) || 0,
            conflicts: normalizeStringArray(msg.conflicts),
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
        if (msg.type === "error") {
          setBackupPending((current) => ({ ...current, export: false, preview: false, apply: false }));
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
      backup: {
        exportResult: backupExport,
        previewResult: backupPreview,
        importResult: backupImport,
        pending: backupPending
      },
      requestBackupExport,
      importBackupFile,
      applyBackupImport
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
