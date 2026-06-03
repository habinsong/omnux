/* omnux — settings page state */
(function () {
  const { useState, useEffect, useCallback, useRef } = React;
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

  function normalizeOpsArray(values) {
    return Array.isArray(values) ? values.filter(Boolean) : [];
  }

  function upsertOpsItem(items, nextItem, idKey) {
    if (!nextItem || !nextItem[idKey]) return normalizeOpsArray(items);
    const next = normalizeOpsArray(items).slice();
    const index = next.findIndex((item) => item && item[idKey] === nextItem[idKey]);
    if (index >= 0) {
      next[index] = nextItem;
    } else {
      next.unshift(nextItem);
    }
    return next;
  }

  function updateTaskInSnapshot(snapshot, graphId, task) {
    if (!snapshot || !snapshot.graph || snapshot.graph.graphId !== graphId || !task || !task.taskId) {
      return snapshot;
    }

    const nodes = Array.isArray(snapshot.graph.nodes) ? snapshot.graph.nodes.slice() : [];
    const index = nodes.findIndex((item) => item && item.taskId === task.taskId);
    if (index >= 0) {
      nodes[index] = task;
    } else {
      nodes.push(task);
    }

    return {
      ...snapshot,
      graph: {
        ...snapshot.graph,
        nodes,
        updatedAtUtc: task.updatedAtUtc || snapshot.graph.updatedAtUtc
      }
    };
  }

  function useSettingsOperationsState(ctx, active) {
    const sendMessage = typeof ctx.send === "function" ? ctx.send : noop;
    const toast = typeof ctx.toast === "function" ? ctx.toast : noop;
    const [loaded, setLoaded] = useState(false);
    const [doctor, setDoctor] = useState({
      report: null,
      pending: { run: false, last: false, fixPreview: false, fixApply: false },
      lastError: "",
      fixPreview: null,
      fixApply: null,
      previewId: ""
    });
    const [cleanup, setCleanup] = useState({
      preview: null,
      apply: null,
      pending: { preview: false, apply: false },
      lastError: "",
      previewId: ""
    });
    const [plans, setPlans] = useState({
      items: [],
      loading: false,
      selectedPlanId: "",
      lastError: ""
    });
    const [tasks, setTasks] = useState({
      items: [],
      loading: false,
      pending: false,
      selectedGraphId: "",
      selectedTaskId: "",
      createPlanId: "",
      snapshot: null,
      output: null,
      lastError: "",
      lastMessage: ""
    });

    const sendOrToast = useCallback((payload) => {
      const sent = sendMessage(payload, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 연결이 필요합니다.");
      }
      return sent;
    }, [sendMessage, toast]);

    const refreshDoctorReport = useCallback(() => {
      setDoctor((current) => ({
        ...current,
        pending: { ...current.pending, last: true },
        lastError: ""
      }));
      if (!sendOrToast({ type: "doctor_get_last" })) {
        setDoctor((current) => ({ ...current, pending: { ...current.pending, last: false } }));
      }
    }, [sendOrToast]);

    const runDoctorReport = useCallback(() => {
      setDoctor((current) => ({
        ...current,
        pending: { ...current.pending, run: true },
        lastError: ""
      }));
      if (!sendOrToast({ type: "doctor_run" })) {
        setDoctor((current) => ({ ...current, pending: { ...current.pending, run: false } }));
      }
    }, [sendOrToast]);

    const previewDoctorFix = useCallback(() => {
      setDoctor((current) => ({
        ...current,
        pending: { ...current.pending, fixPreview: true },
        lastError: "",
        fixApply: null
      }));
      if (!sendOrToast({ type: "doctor_fix_preview" })) {
        setDoctor((current) => ({ ...current, pending: { ...current.pending, fixPreview: false } }));
      }
    }, [sendOrToast]);

    const applyDoctorFix = useCallback(() => {
      const previewId = doctor.previewId || doctor.fixPreview?.previewId || "";
      if (!previewId) {
        toast("doctor fix previewId가 필요합니다.");
        return;
      }
      if (typeof window.confirm === "function" && !window.confirm("doctor 자동수정을 적용할까요?")) {
        return;
      }
      setDoctor((current) => ({
        ...current,
        pending: { ...current.pending, fixApply: true },
        lastError: ""
      }));
      if (!sendOrToast({ type: "doctor_fix_apply", previewId })) {
        setDoctor((current) => ({ ...current, pending: { ...current.pending, fixApply: false } }));
      }
    }, [doctor.fixPreview, doctor.previewId, sendOrToast, toast]);

    const previewCleanup = useCallback(() => {
      setCleanup((current) => ({
        ...current,
        pending: { ...current.pending, preview: true },
        lastError: "",
        apply: null
      }));
      if (!sendOrToast({ type: "cleanup_preview" })) {
        setCleanup((current) => ({ ...current, pending: { ...current.pending, preview: false } }));
      }
    }, [sendOrToast]);

    const applyCleanup = useCallback(() => {
      const previewId = cleanup.previewId || cleanup.preview?.previewId || "";
      if (!previewId) {
        toast("cleanup previewId가 필요합니다.");
        return;
      }
      if (typeof window.confirm === "function" && !window.confirm("미리보기의 cleanup 후보를 삭제할까요?")) {
        return;
      }
      setCleanup((current) => ({
        ...current,
        pending: { ...current.pending, apply: true },
        lastError: ""
      }));
      if (!sendOrToast({ type: "cleanup_apply", previewId })) {
        setCleanup((current) => ({ ...current, pending: { ...current.pending, apply: false } }));
      }
    }, [cleanup.preview, cleanup.previewId, sendOrToast, toast]);

    const refreshPlans = useCallback(() => {
      setPlans((current) => ({ ...current, loading: true, lastError: "" }));
      if (!sendOrToast({ type: "plan_list" })) {
        setPlans((current) => ({ ...current, loading: false }));
      }
    }, [sendOrToast]);

    const refreshTaskGraphs = useCallback(() => {
      setTasks((current) => ({ ...current, loading: true, lastError: "" }));
      if (!sendOrToast({ type: "task_graph_list" })) {
        setTasks((current) => ({ ...current, loading: false }));
      }
    }, [sendOrToast]);

    const selectPlan = useCallback((planId) => {
      const normalized = String(planId || "").trim();
      setPlans((current) => ({ ...current, selectedPlanId: normalized }));
      setTasks((current) => ({ ...current, createPlanId: normalized || current.createPlanId }));
    }, []);

    const setTaskCreatePlanId = useCallback((planId) => {
      setTasks((current) => ({ ...current, createPlanId: String(planId || "") }));
    }, []);

    const loadTaskGraph = useCallback((graphId) => {
      const normalized = String(graphId || "").trim();
      if (!normalized) return;
      setTasks((current) => ({
        ...current,
        selectedGraphId: normalized,
        loading: true,
        lastError: ""
      }));
      if (!sendOrToast({ type: "task_graph_get", graphId: normalized })) {
        setTasks((current) => ({ ...current, loading: false }));
      }
    }, [sendOrToast]);

    const createTaskGraph = useCallback(() => {
      const planId = String(tasks.createPlanId || plans.selectedPlanId || "").trim();
      if (!planId) {
        toast("계획 ID가 필요합니다.");
        return;
      }
      setTasks((current) => ({ ...current, pending: true, lastError: "" }));
      if (!sendOrToast({ type: "task_graph_create", planId })) {
        setTasks((current) => ({ ...current, pending: false }));
      }
    }, [plans.selectedPlanId, sendOrToast, tasks.createPlanId, toast]);

    const runTaskGraph = useCallback((graphId) => {
      const normalized = String(graphId || tasks.selectedGraphId || "").trim();
      if (!normalized) {
        toast("Task graph ID가 필요합니다.");
        return;
      }
      if (typeof window.confirm === "function" && !window.confirm("Task graph를 실행할까요? 작업이 파일 변경을 수행할 수 있습니다.")) {
        return;
      }
      setTasks((current) => ({ ...current, pending: true, lastError: "" }));
      if (!sendOrToast({ type: "task_graph_run", graphId: normalized })) {
        setTasks((current) => ({ ...current, pending: false }));
      }
    }, [sendOrToast, tasks.selectedGraphId, toast]);

    const retryTask = useCallback((graphId, taskId) => {
      const normalizedGraphId = String(graphId || tasks.selectedGraphId || "").trim();
      const normalizedTaskId = String(taskId || tasks.selectedTaskId || "").trim();
      if (!normalizedGraphId || !normalizedTaskId) {
        toast("재시도할 Task graph와 task ID가 필요합니다.");
        return;
      }
      if (typeof window.confirm === "function" && !window.confirm(`작업 ${normalizedTaskId}를 재시도할까요?`)) {
        return;
      }
      setTasks((current) => ({ ...current, pending: true, lastError: "" }));
      if (!sendOrToast({ type: "task_retry", graphId: normalizedGraphId, taskId: normalizedTaskId })) {
        setTasks((current) => ({ ...current, pending: false }));
      }
    }, [sendOrToast, tasks.selectedGraphId, tasks.selectedTaskId, toast]);

    const cancelTask = useCallback((graphId, taskId) => {
      const normalizedGraphId = String(graphId || tasks.selectedGraphId || "").trim();
      const normalizedTaskId = String(taskId || tasks.selectedTaskId || "").trim();
      if (!normalizedGraphId || !normalizedTaskId) {
        toast("취소할 Task graph와 task ID가 필요합니다.");
        return;
      }
      setTasks((current) => ({ ...current, pending: true, lastError: "" }));
      if (!sendOrToast({ type: "task_cancel", graphId: normalizedGraphId, taskId: normalizedTaskId })) {
        setTasks((current) => ({ ...current, pending: false }));
      }
    }, [sendOrToast, tasks.selectedGraphId, tasks.selectedTaskId, toast]);

    const loadTaskOutput = useCallback((graphId, taskId) => {
      const normalizedGraphId = String(graphId || tasks.selectedGraphId || "").trim();
      const normalizedTaskId = String(taskId || tasks.selectedTaskId || "").trim();
      if (!normalizedGraphId || !normalizedTaskId) return;
      setTasks((current) => ({
        ...current,
        selectedGraphId: normalizedGraphId,
        selectedTaskId: normalizedTaskId,
        lastError: ""
      }));
      sendOrToast({ type: "task_output_get", graphId: normalizedGraphId, taskId: normalizedTaskId });
    }, [sendOrToast, tasks.selectedGraphId, tasks.selectedTaskId]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        if (msg.type === "doctor_result") {
          const found = !!msg.found;
          setDoctor((current) => ({
            ...current,
            report: found ? (msg.report || null) : null,
            pending: { ...current.pending, run: false, last: false },
            lastError: found ? "" : "저장된 doctor 보고서가 없습니다."
          }));
        }
        if (msg.type === "doctor_fix_result") {
          const action = msg.action || "";
          const result = {
            ok: !!msg.ok,
            action,
            message: msg.message || "",
            previewId: msg.previewId || "",
            error: msg.error || "",
            actions: normalizeOpsArray(msg.actions)
          };
          setDoctor((current) => ({
            ...current,
            fixPreview: action === "preview" ? result : current.fixPreview,
            fixApply: action === "apply" ? result : current.fixApply,
            previewId: result.previewId || current.previewId,
            pending: {
              ...current.pending,
              fixPreview: action === "preview" ? false : current.pending.fixPreview,
              fixApply: action === "apply" ? false : current.pending.fixApply
            },
            lastError: result.ok ? "" : (result.error || result.message || "doctor 자동수정 요청이 실패했습니다.")
          }));
          toast(result.message || (result.ok ? "doctor 자동수정 요청을 처리했습니다." : "doctor 자동수정 요청이 실패했습니다."));
          if (action === "apply" && result.ok) {
            sendMessage({ type: "doctor_run" }, { queueIfClosed: true });
          }
        }
        if (msg.type === "cleanup_preview_result") {
          const result = {
            ok: !!msg.ok,
            message: msg.message || "",
            previewId: msg.previewId || "",
            totalSizeBytes: Number(msg.totalSizeBytes) || 0,
            error: msg.error || "",
            candidates: normalizeOpsArray(msg.candidates)
          };
          setCleanup((current) => ({
            ...current,
            preview: result,
            previewId: result.previewId || current.previewId,
            pending: { ...current.pending, preview: false },
            lastError: result.ok ? "" : (result.error || result.message || "cleanup 미리보기가 실패했습니다.")
          }));
          toast(result.message || (result.ok ? "cleanup 미리보기를 준비했습니다." : "cleanup 미리보기가 실패했습니다."));
        }
        if (msg.type === "cleanup_apply_result") {
          const result = {
            ok: !!msg.ok,
            message: msg.message || "",
            previewId: msg.previewId || "",
            removedCount: Number(msg.removedCount) || 0,
            removedSizeBytes: Number(msg.removedSizeBytes) || 0,
            removedPaths: normalizeOpsArray(msg.removedPaths),
            failedPaths: normalizeOpsArray(msg.failedPaths),
            error: msg.error || ""
          };
          setCleanup((current) => ({
            ...current,
            apply: result,
            pending: { ...current.pending, apply: false },
            lastError: result.ok ? "" : (result.error || result.message || "cleanup 적용이 실패했습니다.")
          }));
          toast(result.message || (result.ok ? "cleanup 적용을 완료했습니다." : "cleanup 적용이 실패했습니다."));
        }
        if (msg.type === "plan_list_result") {
          const payload = msg.payload || {};
          const items = normalizeOpsArray(payload.items);
          const selectedPlanId = items.some((item) => item.planId === plans.selectedPlanId)
            ? plans.selectedPlanId
            : (items[0]?.planId || "");
          setPlans((current) => ({
            ...current,
            items,
            loading: false,
            selectedPlanId,
            lastError: items.length === 0 ? "저장된 계획이 없습니다." : ""
          }));
          if (selectedPlanId) {
            setTasks((current) => ({
              ...current,
              createPlanId: current.createPlanId || selectedPlanId
            }));
          }
        }
        if (msg.type === "plan_result") {
          const snapshot = msg.payload?.snapshot || null;
          if (snapshot?.plan) {
            const plan = snapshot.plan;
            const nextItem = {
              planId: plan.planId,
              title: plan.title || plan.planId,
              objective: plan.objective || "",
              status: plan.status || "",
              updatedAtUtc: plan.updatedAtUtc || ""
            };
            setPlans((current) => ({
              ...current,
              items: upsertOpsItem(current.items, nextItem, "planId"),
              selectedPlanId: plan.planId || current.selectedPlanId,
              loading: false,
              lastError: msg.payload?.ok === false ? (msg.payload?.message || "계획 요청이 실패했습니다.") : ""
            }));
          }
        }
        if (msg.type === "task_graph_list_result") {
          const payload = msg.payload || {};
          const items = normalizeOpsArray(payload.items);
          const selectedGraphId = items.some((item) => item.graphId === tasks.selectedGraphId)
            ? tasks.selectedGraphId
            : (items[0]?.graphId || "");
          setTasks((current) => ({
            ...current,
            items,
            loading: false,
            pending: false,
            selectedGraphId,
            snapshot: selectedGraphId && current.snapshot?.graph?.graphId === selectedGraphId
              ? current.snapshot
              : (selectedGraphId ? null : current.snapshot),
            lastError: items.length === 0 ? "저장된 Task graph가 없습니다." : ""
          }));
          if (selectedGraphId) {
            sendMessage({ type: "task_graph_get", graphId: selectedGraphId }, { queueIfClosed: true });
          }
        }
        if (msg.type === "task_graph_result") {
          const payload = msg.payload || {};
          const snapshot = payload.snapshot || null;
          const ok = payload.ok !== false;
          const graph = snapshot?.graph || null;
          const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
          const nextGraphId = graph?.graphId || tasks.selectedGraphId;
          const nextTaskId = nodes.some((task) => task.taskId === tasks.selectedTaskId)
            ? tasks.selectedTaskId
            : (nodes[0]?.taskId || tasks.selectedTaskId);
          setTasks((current) => {
            const nextItem = graph
              ? {
                graphId: graph.graphId,
                sourcePlanId: graph.sourcePlanId || "",
                status: graph.status || "",
                totalNodes: nodes.length,
                completedNodes: nodes.filter((task) => `${task.status || ""}`.toLowerCase() === "completed").length,
                failedNodes: nodes.filter((task) => `${task.status || ""}`.toLowerCase() === "failed").length,
                runningNodes: nodes.filter((task) => `${task.status || ""}`.toLowerCase() === "running").length,
                updatedAtUtc: graph.updatedAtUtc || ""
              }
              : null;
            return {
              ...current,
              items: upsertOpsItem(current.items, nextItem, "graphId"),
              loading: false,
              pending: false,
              selectedGraphId: nextGraphId,
              selectedTaskId: nextTaskId,
              snapshot: snapshot || current.snapshot,
              createPlanId: ok && msg.action === "create" ? "" : current.createPlanId,
              lastMessage: payload.message || "",
              lastError: ok ? "" : (payload.message || "Task graph 요청이 실패했습니다.")
            };
          });
          if (nextGraphId && nextTaskId) {
            sendMessage({ type: "task_output_get", graphId: nextGraphId, taskId: nextTaskId }, { queueIfClosed: true });
          }
        }
        if (msg.type === "task_output_result") {
          const payload = msg.payload || {};
          setTasks((current) => ({
            ...current,
            output: payload,
            selectedGraphId: payload.graphId || current.selectedGraphId,
            selectedTaskId: payload.taskId || current.selectedTaskId
          }));
        }
        if (msg.type === "task_updated") {
          const graphId = String(msg.graphId || "").trim();
          const task = msg.task || null;
          if (graphId && task?.taskId) {
            setTasks((current) => ({
              ...current,
              snapshot: updateTaskInSnapshot(current.snapshot, graphId, task)
            }));
          }
        }
        if (msg.type === "task_log") {
          const graphId = String(msg.graphId || "").trim();
          const taskId = String(msg.taskId || "").trim();
          const line = String(msg.line || "");
          setTasks((current) => {
            if (!graphId || !taskId || current.selectedGraphId !== graphId || current.selectedTaskId !== taskId) {
              return current;
            }
            return {
              ...current,
              output: {
                ...(current.output || {}),
                graphId,
                taskId,
                stdout: `${current.output?.stdout || ""}${current.output?.stdout ? "\n" : ""}${line}`
              }
            };
          });
        }
        if (msg.type === "error") {
          setDoctor((current) => ({
            ...current,
            pending: { run: false, last: false, fixPreview: false, fixApply: false },
            lastError: msg.message || current.lastError
          }));
          setCleanup((current) => ({
            ...current,
            pending: { preview: false, apply: false },
            lastError: msg.message || current.lastError
          }));
          setPlans((current) => ({ ...current, loading: false, lastError: msg.message || current.lastError }));
          setTasks((current) => ({
            ...current,
            loading: false,
            pending: false,
            lastError: msg.message || current.lastError
          }));
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [plans.selectedPlanId, sendMessage, tasks.selectedGraphId, tasks.selectedTaskId, toast]);

    useEffect(() => {
      if (!active || loaded) {
        return;
      }
      setLoaded(true);
      refreshDoctorReport();
      refreshPlans();
      refreshTaskGraphs();
    }, [active, loaded, refreshDoctorReport, refreshPlans, refreshTaskGraphs]);

    return {
      loaded,
      doctor,
      cleanup,
      plans,
      tasks,
      refreshDoctorReport,
      runDoctorReport,
      previewDoctorFix,
      applyDoctorFix,
      previewCleanup,
      applyCleanup,
      refreshPlans,
      selectPlan,
      refreshTaskGraphs,
      setTaskCreatePlanId,
      loadTaskGraph,
      createTaskGraph,
      runTaskGraph,
      retryTask,
      cancelTask,
      loadTaskOutput
    };
  }

  const EMPTY_SETTINGS_STATE = {
    telegramBotTokenSet: false,
    telegramChatIdSet: false,
    groqApiKeySet: false,
    geminiApiKeySet: false,
    cerebrasApiKeySet: false,
    nvidiaApiKeySet: false,
    codexApiKeySet: false,
    telegramBotTokenMasked: "",
    telegramChatIdMasked: "",
    groqApiKeyMasked: "",
    geminiApiKeyMasked: "",
    cerebrasApiKeyMasked: "",
    nvidiaApiKeyMasked: "",
    codexApiKeyMasked: "",
    externalDashboardEnabled: false,
    remoteDashboardClient: false,
    dashboardExternalUrls: []
  };

  const EMPTY_USAGE_STATE = {
    gemini: null,
    copilotPremium: null,
    copilotLocal: null
  };

  const EMPTY_MODEL_STATE = {
    selected: "",
    items: []
  };

  const EMPTY_PENDING_STATE = {
    otpRequest: false,
    auth: false,
    telegram: false,
    telegramDelete: false,
    telegramTest: false,
    llm: false,
    llmDelete: false,
    groqRefresh: false,
    groqApply: false,
    cerebrasRefresh: false,
    copilotRefresh: false,
    copilotApply: false,
    copilotStatus: false,
    copilotLogin: false,
    codexStatus: false,
    codexLogin: false,
    codexLogout: false
  };

  function normalizeSettingsRuntimeState(value) {
    if (!value || typeof value !== "object") {
      return { ...EMPTY_SETTINGS_STATE };
    }
    return {
      ...EMPTY_SETTINGS_STATE,
      ...value,
      dashboardExternalUrls: Array.isArray(value.dashboardExternalUrls) ? value.dashboardExternalUrls : []
    };
  }

  function normalizeUsageRuntimeState(value) {
    if (!value || typeof value !== "object") {
      return { ...EMPTY_USAGE_STATE };
    }
    return {
      gemini: value.gemini || null,
      copilotPremium: value.copilotPremium || null,
      copilotLocal: value.copilotLocal || null
    };
  }

  function normalizeModelRuntimeState(value) {
    if (!value || typeof value !== "object") {
      return { ...EMPTY_MODEL_STATE };
    }
    return {
      selected: String(value.selected || ""),
      items: Array.isArray(value.items) ? value.items : []
    };
  }

  function trimOrUndefined(value) {
    const text = String(value || "").trim();
    return text ? text : undefined;
  }

  function parseAuthTtlHours(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed)) return 24;
    return Math.max(1, Math.min(168, parsed));
  }

  function useSettingsLiveState(ctx, active) {
    const runtime = ctx.runtime || {};
    const sendMessage = typeof ctx.send === "function" ? ctx.send : noop;
    const toast = typeof ctx.toast === "function" ? ctx.toast : noop;
    const loadedRef = useRef(false);
    const activeRef = useRef(active);
    const authRefreshRef = useRef(false);
    const groqSelectedRef = useRef("");
    const copilotSelectedRef = useRef("");

    const settings = normalizeSettingsRuntimeState(runtime.settings);
    const usage = normalizeUsageRuntimeState(runtime.usage);
    const groqModels = normalizeModelRuntimeState(runtime.groqModels);
    const cerebrasModels = normalizeModelRuntimeState(runtime.cerebrasModels);
    const copilotModels = normalizeModelRuntimeState(runtime.copilotModels);
    const copilotStatus = runtime.copilotStatus || null;
    const codexStatus = runtime.codexStatus || null;
    const settingsResult = runtime.settingsResult || null;
    const otpResult = runtime.otpResult || null;
    const remoteDashboardClient = !!settings.remoteDashboardClient || !!runtime.remoteDashboardClient;
    const connected = !!runtime.connected || runtime.status === "connected";
    const authenticated = !!runtime.authenticated;
    const needsAuth = !!runtime.authRequired && !authenticated;
    const canEditSecrets = connected && authenticated && !remoteDashboardClient;

    const [otp, setOtp] = useState("");
    const [authTtlHours, setAuthTtlHours] = useState("24");
    const [persist, setPersist] = useState(true);
    const [telegramBotToken, setTelegramBotToken] = useState("");
    const [telegramChatId, setTelegramChatId] = useState("");
    const [groqApiKey, setGroqApiKey] = useState("");
    const [geminiApiKey, setGeminiApiKey] = useState("");
    const [cerebrasApiKey, setCerebrasApiKey] = useState("");
    const [nvidiaApiKey, setNvidiaApiKey] = useState("");
    const [codexApiKey, setCodexApiKey] = useState("");
    const [selectedGroqModel, setSelectedGroqModel] = useState("");
    const [selectedCopilotModel, setSelectedCopilotModel] = useState("");
    const [pending, setPending] = useState(EMPTY_PENDING_STATE);

    useEffect(() => {
      activeRef.current = active;
    }, [active]);

    const setPendingKey = useCallback((key, value) => {
      setPending((current) => ({ ...current, [key]: !!value }));
    }, []);

    const sendOrToast = useCallback((payload) => {
      const sent = sendMessage(payload, { queueIfClosed: true });
      if (!sent) {
        toast("미들웨어 WebSocket 연결이 필요합니다.");
      }
      return sent;
    }, [sendMessage, toast]);

    const refreshAll = useCallback(() => {
      sendMessage({ type: "get_settings" }, { queueIfClosed: true, silent: true });
      if (authenticated) {
        sendMessage({ type: "get_usage_stats" }, { queueIfClosed: true, silent: true });
        sendMessage({ type: "get_groq_models" }, { queueIfClosed: true, silent: true });
        sendMessage({ type: "get_cerebras_models" }, { queueIfClosed: true, silent: true });
        sendMessage({ type: "get_copilot_models" }, { queueIfClosed: true, silent: true });
        sendMessage({ type: "get_copilot_status" }, { queueIfClosed: true, silent: true });
        sendMessage({ type: "get_codex_status" }, { queueIfClosed: true, silent: true });
      }
    }, [authenticated, sendMessage]);

    const requestOtp = useCallback(() => {
      if (remoteDashboardClient) {
        toast("외부 접속 제한 모드에서는 OTP 요청을 사용할 수 없습니다.");
        return;
      }
      setPendingKey("otpRequest", true);
      if (!sendOrToast({ type: "request_otp" })) {
        setPendingKey("otpRequest", false);
      }
    }, [remoteDashboardClient, sendOrToast, setPendingKey, toast]);

    const authenticate = useCallback(() => {
      const code = otp.trim();
      if (!code) {
        toast("OTP 코드를 입력하세요.");
        return;
      }
      setPendingKey("auth", true);
      if (!sendOrToast({
        type: "auth",
        otp: code,
        authTtlHours: parseAuthTtlHours(authTtlHours)
      })) {
        setPendingKey("auth", false);
      }
    }, [authTtlHours, otp, sendOrToast, setPendingKey, toast]);

    const saveTelegram = useCallback(() => {
      setPendingKey("telegram", true);
      if (!sendOrToast({
        type: "set_telegram_credentials",
        telegramBotToken: trimOrUndefined(telegramBotToken),
        telegramChatId: trimOrUndefined(telegramChatId),
        persist
      })) {
        setPendingKey("telegram", false);
      }
    }, [persist, sendOrToast, setPendingKey, telegramBotToken, telegramChatId]);

    const deleteTelegram = useCallback(() => {
      if (typeof window.confirm === "function"
        && !window.confirm("Telegram 연동 정보를 삭제할까요?")) {
        return;
      }
      setPendingKey("telegramDelete", true);
      if (!sendOrToast({ type: "delete_telegram_credentials", persist })) {
        setPendingKey("telegramDelete", false);
        return;
      }
      setTelegramBotToken("");
      setTelegramChatId("");
    }, [persist, sendOrToast, setPendingKey]);

    const testTelegram = useCallback(() => {
      setPendingKey("telegramTest", true);
      if (!sendOrToast({ type: "test_telegram" })) {
        setPendingKey("telegramTest", false);
      }
    }, [sendOrToast, setPendingKey]);

    const saveLlm = useCallback(() => {
      setPendingKey("llm", true);
      if (!sendOrToast({
        type: "set_llm_credentials",
        groqApiKey: trimOrUndefined(groqApiKey),
        geminiApiKey: trimOrUndefined(geminiApiKey),
        cerebrasApiKey: trimOrUndefined(cerebrasApiKey),
        nvidiaApiKey: trimOrUndefined(nvidiaApiKey),
        codexApiKey: trimOrUndefined(codexApiKey),
        persist
      })) {
        setPendingKey("llm", false);
      }
    }, [cerebrasApiKey, codexApiKey, geminiApiKey, groqApiKey, nvidiaApiKey, persist, sendOrToast, setPendingKey]);

    const deleteLlm = useCallback(() => {
      if (typeof window.confirm === "function"
        && !window.confirm("저장된 LLM API 키를 모두 삭제할까요?")) {
        return;
      }
      setPendingKey("llmDelete", true);
      if (!sendOrToast({ type: "delete_llm_credentials", persist })) {
        setPendingKey("llmDelete", false);
        return;
      }
      setGroqApiKey("");
      setGeminiApiKey("");
      setCerebrasApiKey("");
      setNvidiaApiKey("");
      setCodexApiKey("");
    }, [persist, sendOrToast, setPendingKey]);

    const refreshGroqModels = useCallback(() => {
      setPendingKey("groqRefresh", true);
      if (!sendOrToast({ type: "get_groq_models" })) {
        setPendingKey("groqRefresh", false);
      }
    }, [sendOrToast, setPendingKey]);

    const applyGroqModel = useCallback(() => {
      const model = selectedGroqModel.trim();
      if (!model) {
        toast("Groq 모델을 선택하세요.");
        return;
      }
      setPendingKey("groqApply", true);
      if (!sendOrToast({ type: "set_groq_model", model })) {
        setPendingKey("groqApply", false);
      }
    }, [selectedGroqModel, sendOrToast, setPendingKey, toast]);

    const refreshCerebrasModels = useCallback(() => {
      setPendingKey("cerebrasRefresh", true);
      if (!sendOrToast({ type: "get_cerebras_models" })) {
        setPendingKey("cerebrasRefresh", false);
      }
    }, [sendOrToast, setPendingKey]);

    const refreshCopilotModels = useCallback(() => {
      setPendingKey("copilotRefresh", true);
      if (!sendOrToast({ type: "get_copilot_models" })) {
        setPendingKey("copilotRefresh", false);
      }
    }, [sendOrToast, setPendingKey]);

    const applyCopilotModel = useCallback(() => {
      const model = selectedCopilotModel.trim();
      if (!model) {
        toast("Copilot 모델을 선택하세요.");
        return;
      }
      setPendingKey("copilotApply", true);
      if (!sendOrToast({ type: "set_copilot_model", model })) {
        setPendingKey("copilotApply", false);
      }
    }, [selectedCopilotModel, sendOrToast, setPendingKey, toast]);

    const refreshCopilotStatus = useCallback(() => {
      setPendingKey("copilotStatus", true);
      if (!sendOrToast({ type: "get_copilot_status" })) {
        setPendingKey("copilotStatus", false);
      }
    }, [sendOrToast, setPendingKey]);

    const startCopilotLogin = useCallback(() => {
      setPendingKey("copilotLogin", true);
      if (!sendOrToast({ type: "start_copilot_login" })) {
        setPendingKey("copilotLogin", false);
      }
    }, [sendOrToast, setPendingKey]);

    const refreshCodexStatus = useCallback(() => {
      setPendingKey("codexStatus", true);
      if (!sendOrToast({ type: "get_codex_status" })) {
        setPendingKey("codexStatus", false);
      }
    }, [sendOrToast, setPendingKey]);

    const startCodexLogin = useCallback(() => {
      setPendingKey("codexLogin", true);
      if (!sendOrToast({ type: "start_codex_login" })) {
        setPendingKey("codexLogin", false);
      }
    }, [sendOrToast, setPendingKey]);

    const logoutCodex = useCallback(() => {
      setPendingKey("codexLogout", true);
      if (!sendOrToast({ type: "logout_codex" })) {
        setPendingKey("codexLogout", false);
      }
    }, [sendOrToast, setPendingKey]);

    useEffect(() => {
      const next = groqModels.selected || groqModels.items[0]?.id || "";
      if (next && groqSelectedRef.current !== next) {
        groqSelectedRef.current = next;
        setSelectedGroqModel(next);
      }
    }, [groqModels.items, groqModels.selected]);

    useEffect(() => {
      const next = copilotModels.selected || copilotModels.items[0]?.id || "";
      if (next && copilotSelectedRef.current !== next) {
        copilotSelectedRef.current = next;
        setSelectedCopilotModel(next);
      }
    }, [copilotModels.items, copilotModels.selected]);

    useEffect(() => {
      if (!active || loadedRef.current) {
        return;
      }
      loadedRef.current = true;
      refreshAll();
    }, [active, refreshAll]);

    useEffect(() => {
      if (active && authenticated && !authRefreshRef.current) {
        authRefreshRef.current = true;
        refreshAll();
      }
      if (!authenticated) {
        authRefreshRef.current = false;
      }
    }, [active, authenticated, refreshAll]);

    useEffect(() => {
      const onMessage = (event) => {
        const msg = event.detail || {};
        const shouldToast = activeRef.current;
        if (msg.type === "otp_request_result") {
          setPendingKey("otpRequest", false);
          if (shouldToast) toast(msg.message || (msg.ok ? "OTP를 요청했습니다." : "OTP 요청에 실패했습니다."));
        }
        if (msg.type === "auth_result") {
          setPendingKey("auth", false);
          if (msg.ok) {
            setOtp("");
            if (shouldToast) toast(msg.resumed ? "인증 세션을 복구했습니다." : "인증되었습니다.");
          } else {
            if (shouldToast) toast("OTP 인증에 실패했습니다.");
          }
        }
        if (msg.type === "settings_result") {
          setPending((current) => ({
            ...current,
            telegram: false,
            telegramDelete: false,
            telegramTest: false,
            llm: false,
            llmDelete: false
          }));
          if (shouldToast) toast(msg.message || (msg.ok ? "설정을 저장했습니다." : "설정 작업이 실패했습니다."));
          if (msg.ok) {
            setTelegramBotToken("");
            setTelegramChatId("");
            setGroqApiKey("");
            setGeminiApiKey("");
            setCerebrasApiKey("");
            setNvidiaApiKey("");
            setCodexApiKey("");
          }
        }
        if (msg.type === "groq_models") {
          setPendingKey("groqRefresh", false);
        }
        if (msg.type === "cerebras_models") {
          setPendingKey("cerebrasRefresh", false);
        }
        if (msg.type === "groq_model_set") {
          setPendingKey("groqApply", false);
          if (shouldToast) toast(msg.ok ? `Groq 모델을 ${msg.model || "-"}로 적용했습니다.` : (msg.message || "Groq 모델 적용 실패"));
        }
        if (msg.type === "copilot_models") {
          setPendingKey("copilotRefresh", false);
        }
        if (msg.type === "copilot_model_set") {
          setPendingKey("copilotApply", false);
          if (shouldToast) toast(msg.ok ? `Copilot 모델을 ${msg.model || "-"}로 적용했습니다.` : (msg.message || "Copilot 모델 적용 실패"));
        }
        if (msg.type === "copilot_status") {
          setPendingKey("copilotStatus", false);
        }
        if (msg.type === "copilot_login_result") {
          setPendingKey("copilotLogin", false);
          if (shouldToast) toast(msg.message || "Copilot 로그인 요청을 시작했습니다.");
        }
        if (msg.type === "codex_status") {
          setPendingKey("codexStatus", false);
        }
        if (msg.type === "codex_login_result") {
          setPendingKey("codexLogin", false);
          if (shouldToast) toast(msg.message || "Codex 로그인 요청을 시작했습니다.");
        }
        if (msg.type === "codex_logout_result") {
          setPendingKey("codexLogout", false);
          if (shouldToast) toast(msg.message || "Codex 로그아웃 요청을 처리했습니다.");
        }
        if (msg.type === "error") {
          setPending(EMPTY_PENDING_STATE);
          if (shouldToast && (msg.message || "").toLowerCase() !== "unauthorized") {
            toast(msg.message || "요청 처리 중 오류가 발생했습니다.");
          }
        }
      };
      window.addEventListener("omnux:message", onMessage);
      return () => window.removeEventListener("omnux:message", onMessage);
    }, [setPendingKey, toast]);

    return {
      connected,
      authenticated,
      needsAuth,
      canEditSecrets,
      remoteDashboardClient,
      authExpiresAtLocal: runtime.authExpiresAtLocal || "",
      authLocalOffset: runtime.authLocalOffset || "",
      authTtlHours,
      setAuthTtlHours,
      otp,
      setOtp,
      requestOtp,
      authenticate,
      persist,
      setPersist,
      settings,
      usage,
      settingsResult,
      otpResult,
      pending,
      telegramBotToken,
      setTelegramBotToken,
      telegramChatId,
      setTelegramChatId,
      saveTelegram,
      deleteTelegram,
      testTelegram,
      groqApiKey,
      setGroqApiKey,
      geminiApiKey,
      setGeminiApiKey,
      cerebrasApiKey,
      setCerebrasApiKey,
      nvidiaApiKey,
      setNvidiaApiKey,
      codexApiKey,
      setCodexApiKey,
      saveLlm,
      deleteLlm,
      groqModels,
      selectedGroqModel,
      setSelectedGroqModel,
      refreshGroqModels,
      applyGroqModel,
      cerebrasModels,
      refreshCerebrasModels,
      copilotModels,
      selectedCopilotModel,
      setSelectedCopilotModel,
      refreshCopilotModels,
      applyCopilotModel,
      copilotStatus,
      refreshCopilotStatus,
      startCopilotLogin,
      codexStatus,
      refreshCodexStatus,
      startCodexLogin,
      logoutCodex,
      refreshAll
    };
  }

  function useSettingsPageState(ctx, payload) {
    const [tab, setTab] = useState((payload && payload.tab) || "general");
    const memory = useSettingsMemoryState(ctx);
    const permissions = useSettingsPermissionState();
    const operations = useSettingsOperationsState(ctx, tab === "operations");
    const live = useSettingsLiveState(ctx, tab === "models" || tab === "integrations");

    return {
      tab,
      setTab,
      memory,
      permissions,
      perms: SETTINGS_PERMS,
      operations,
      live
    };
  }

  Object.assign(window, {
    SETTINGS_PERMS,
    useSettingsMemoryState,
    useSettingsPermissionState,
    useSettingsOperationsState,
    useSettingsLiveState,
    useSettingsPageState
  });
})();
