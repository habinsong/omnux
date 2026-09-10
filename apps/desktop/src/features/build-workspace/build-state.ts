import { create } from "zustand";
import { useEffect } from "react";
import { useDesktopShellStore } from "../../shell-store";
import { subscribeDesktopMessages, type DesktopServerMessage } from "../middleware/desktop-message-gateway";
import { sendBuildCommand, codingFileUrl, localPreviewUrl, readCodingFile, type BuildCommand } from "../middleware/build-workspace-gateway";
import { interruptBuildNotebookSave, receiveBuildNotebookSave } from "./build-notebook-save";
import { requestDesktopLlm } from "../middleware/llm-gateway";
import { projectChoice, projectReview, type ProjectChoice, type ProjectReview } from "./build-project-review";
import { attachmentLimit, readAttachments } from "./build-attachments";
import { codingResult, conversation, execution, initialSettings, list, mode, object, relativeFile, selectedResult, strings, text, type Attachment, type BuildMode, type CodingResult, type Conversation, type FileView, type ModelProvider, type Runtime, type Settings } from "./build-model";

type Request = { id: string; type: BuildCommand; fields: Record<string, unknown> };
type Submitted = { input: string; attachments: Attachment[]; settings: Settings };
type Library = { name: string; scope: string; description: string };
type State = {
  input: string; settings: Settings; attachments: Attachment[]; readingFiles: boolean; settingsOpen: boolean;
  activeId: string; active: Conversation | null; items: Conversation[]; currentResult: CodingResult | null; runtime: Runtime | null; file: FileView | null; target: string;
  pending: Record<string, Request | undefined>; submitted: Submitted | null; cancelPending: boolean; error: string; progress: string; standardInput: string;
  projects: ProjectChoice[]; projectReview: ProjectReview | null; projectMessage: string;
  loadProjects: () => void; previewProject: () => void; applyProject: () => void;
  catalogs: Partial<Record<ModelProvider, string[]>>; skills: Library[]; memory: Library[]; confirmation: "new" | "delete" | null;
  request: (slot: string, type: BuildCommand, fields?: Record<string, unknown>) => boolean;
  patchSettings: (patch: Partial<Settings>) => void; fresh: () => void; loadHistory: () => void; open: (id: string) => void; saveMeta: () => void;
  loadReferences: () => void; loadModels: () => void; attach: (files: File[]) => Promise<void>;
  run: () => void; cancel: () => void; resume: () => void; execute: () => void; chooseTarget: (target: string) => void;
  showFile: (path: string, render?: boolean) => void; confirm: () => void;
};
const requestId = () => `build-workspace-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
export const busyBuild = (state: Pick<State, "pending" | "readingFiles">) => Boolean(state.pending.run || state.pending.execute || state.pending.detail || state.pending.meta || state.pending.delete || state.pending.projectPreview || state.pending.projectApply || state.readingFiles);
export const useBuildWorkspace = create<State>((set, get) => ({
  input: "", settings: initialSettings(), attachments: [], readingFiles: false, settingsOpen: false,
  activeId: "", active: null, items: [], currentResult: null, runtime: null, file: null, target: "main",
  projects: [], projectReview: null, projectMessage: "",
  pending: {}, submitted: null, cancelPending: false, error: "", progress: "", standardInput: "", catalogs: {}, skills: [], memory: [], confirmation: null,
  request: (slot, type, fields = {}) => {
    const pending = { id: requestId(), type, fields };
    set(state => ({ pending: { ...state.pending, [slot]: pending } }));
    if (sendBuildCommand(type, pending.id, fields)) return true;
    set(state => ({ pending: { ...state.pending, [slot]: undefined }, error: "요청을 보내지 못했습니다. 입력과 이전 결과는 유지됩니다." }));
    return false;
  },
  patchSettings: patch => { if (!busyBuild(get())) set(state => ({ settings: { ...state.settings, ...patch } })); },
  fresh: () => { if (busyBuild(get())) return; set(state => ({ input: "", attachments: [], activeId: "", active: null, currentResult: null, runtime: null, file: null, target: "main", standardInput: "", error: "", progress: "", submitted: null, projectReview: null, projectMessage: "", settings: { ...state.settings, title: "", project: "", projectKey: "", projectPath: "", memory: [] } })); },
  loadHistory: () => { for (const value of ["single", "orchestration", "multi"] as BuildMode[]) get().request(`list-${value}`, "list_conversations", { scope: "coding", mode: value }); },
  open: id => {
    if (!id || busyBuild(get())) return;
    if (get().request("detail", "get_conversation", { conversationId: id })) set({ error: "", file: null });
  },
  saveMeta: () => {
    if (busyBuild(get()) || !get().activeId) return;
    get().request("meta", "update_conversation_meta", { conversationId: get().activeId, conversationTitle: get().settings.title, project: get().settings.project });
  },
  loadProjects: () => { get().request("projects", "projects_list"); },
  previewProject: () => { if (!busyBuild(get())) get().request("projectPreview", "project_build_preview", { conversationId: get().activeId, target: get().target }); },
  applyProject: () => { if (get().projectReview && !busyBuild(get())) get().request("projectApply", "project_build_apply", { previewId: get().projectReview!.id }); },
  loadReferences: () => { get().request("skills", "skills_list", { projectKey: get().settings.projectKey || undefined }); get().request("memory", "list_memory_notes"); },
  loadModels: () => { requestDesktopLlm.cerebrasModels(); requestDesktopLlm.groqModels(); requestDesktopLlm.geminiModels(); requestDesktopLlm.copilotModels(); requestDesktopLlm.codexModels(); requestDesktopLlm.nvidiaModels(); requestDesktopLlm.grokModels(); },
  attach: async files => {
    if (busyBuild(get())) return;
    set({ readingFiles: true, error: "" });
    try { const added = await readAttachments(files, get().attachments); set(state => ({ attachments: [...state.attachments, ...added], readingFiles: false })); }
    catch (error) { set({ readingFiles: false, error: error instanceof Error ? error.message : "첨부 파일을 읽지 못했습니다." }); }
  },
  run: () => {
    const state = get();
    if (busyBuild(state)) return;
    const input = state.input.trim() || (state.attachments.length ? "첨부한 파일을 확인하고 요청한 결과물을 만들어 주세요." : "");
    if (!input) return;
    if (state.attachments.length > 6 || state.attachments.reduce((sum, item) => sum + item.sizeBytes, 0) > attachmentLimit) { set({ error: "첨부 파일은 최대 6개, 전체 10MB 이하여야 합니다." }); return; }
    const settings = state.settings;
    if (settings.mode !== "single" && !Object.values(settings.workers).some(value => value && value !== "none")) { set({ error: "워커 모델을 한 개 이상 고르세요.", settingsOpen: true }); return; }
    const [skillScope, ...skillName] = settings.skill.split(":");
    const fields = { text: input, scope: "coding", mode: settings.mode, conversationId: state.activeId || undefined, conversationTitle: settings.title || undefined, project: settings.project || undefined, projectKey: settings.projectKey || undefined,
      provider: settings.provider === "auto" ? undefined : settings.provider, model: settings.provider === "auto" ? undefined : settings.models[settings.provider], language: settings.language,
      webUrls: Array.from(new Set(input.match(/https?:\/\/[^\s<>"']+/g) || [])), webSearchEnabled: settings.webSearch, thinkPlus: settings.think, attachments: state.attachments, memoryNotes: settings.memory, skillScope: skillName.length ? skillScope : undefined, skillName: skillName.join(":") || undefined,
      ...(settings.mode === "single" ? {} : Object.fromEntries(Object.entries(settings.workers).map(([provider, model]) => [`${provider}Model`, model || "none"]))) };
    if (state.request("run", `coding_run_${settings.mode}`, fields)) set({ input: "", attachments: [], submitted: { input, attachments: state.attachments, settings }, error: "", progress: "작업을 시작하고 있습니다.", cancelPending: false, file: null, runtime: null, projectReview: null, projectMessage: "", settingsOpen: false });
  },
  cancel: () => {
    const state = get(), pending = state.pending.run || state.pending.execute;
    if (!pending || state.cancelPending) return;
    if (sendBuildCommand("coding_cancel", pending.id)) set({ cancelPending: true }); else set({ error: "중단 요청을 보내지 못했습니다. 연결 상태를 확인해 주세요." });
  },
  resume: () => {
    const state = get(), result = state.currentResult;
    if (!result?.resumeInput || busyBuild(state)) return;
    if (state.input.trim()) { set({ error: "작성 중인 요청을 먼저 보내거나 비운 뒤 이어서 작업해 주세요." }); return; }
    const provider = result.provider as ModelProvider;
    set({ input: result.resumeInput, activeId: result.conversationId, settings: { ...state.settings, mode: result.mode, provider: provider in state.settings.models ? provider : "auto", models: { ...state.settings.models, ...(provider in state.settings.models ? { [provider]: result.model } : {}) }, workers: { ...initialSettings().workers, ...result.resumeModels }, language: result.language || "auto" }, error: "" });
  },
  execute: () => {
    const state = get();
    if (busyBuild(state) || !state.activeId) return;
    if (state.request("execute", "coding_execute_result", { conversationId: state.activeId, standardInput: state.standardInput, target: state.target })) set({ progress: "저장된 결과를 실행하고 있습니다.", cancelPending: false, error: "" });
  },
  chooseTarget: target => { if (!busyBuild(get())) set({ target, file: null, projectReview: null, projectMessage: "" }); },
  showFile: (path, render = false) => {
    const state = get(), target = selectedResult(state.currentResult, state.target);
    if (!target) return;
    const relative = relativeFile(path, target.execution.runDirectory);
    const url = codingFileUrl(state.activeId, state.target, relative);
    if (!url) { set({ error: "작업 폴더 안의 파일 경로를 확인할 수 없습니다." }); return; }
    const file: FileView = { path: relative, url, kind: render ? "page" : "text", content: "", loading: !render, error: "", truncated: false };
    set({ file });
    if (!render) void readCodingFile(url).then(result => { if (get().file === file) set({ file: { ...file, ...result, loading: false } }); }).catch(error => { if (get().file === file) set({ file: { ...file, loading: false, error: error instanceof Error ? error.message : "파일을 읽지 못했습니다." } }); });
  },
  confirm: () => {
    const action = get().confirmation;
    set({ confirmation: null });
    if (action === "new") get().fresh();
    if (action === "delete" && get().activeId && !busyBuild(get())) get().request("delete", "delete_conversation", { conversationId: get().activeId, scope: "coding", mode: get().settings.mode });
  }
}));
function receive(message: DesktopServerMessage) {
  if (receiveBuildNotebookSave(message)) return;
  const state = useBuildWorkspace.getState();
  const catalog = /^([a-z]+)_models$/.exec(text(message.type));
  if (catalog && catalog[1] in state.settings.models) { useBuildWorkspace.setState({ catalogs: { ...state.catalogs, [catalog[1]]: strings(message.items).length ? strings(message.items) : list(message.items).map(item => (text(object(item).id) || text(object(item).name) || text(object(item).model))).filter(Boolean) } }); return; }
  if (message.type === "skills_list_result" && state.pending.skills) {
    useBuildWorkspace.setState(current => ({ pending: { ...current.pending, skills: undefined }, skills: list(object(message.payload).items).map(value => { const item = object(value); return { name: text(item.name), scope: text(item.scope), description: text(item.description) }; }) })); return;
  }
  if (message.type === "memory_notes" && state.pending.memory) {
    useBuildWorkspace.setState(current => ({ pending: { ...current.pending, memory: undefined }, memory: list(message.items).map(value => { const item = object(value); return { name: text(item.name), scope: "", description: text(item.excerpt) }; }) })); return;
  }
  const entry = Object.entries(state.pending).find(([, request]) => request && request.id === message.requestId);
  if (!entry) return;
  const [slot, request] = entry;
  const finish = (patch: Partial<State>) => useBuildWorkspace.setState(current => ({ ...patch, pending: { ...current.pending, [slot]: undefined } }));
  if (message.type === "coding_progress" && slot === "run") { useBuildWorkspace.setState({ progress: text(message.message), activeId: text(message.conversationId) || state.activeId }); return; }
  if (message.type === "coding_cancel_result") { if (message.ok === false) useBuildWorkspace.setState({ cancelPending: false, error: text(message.message) }); return; }
  if (message.type === "error") {
    finish({ error: text(message.message) || "요청을 처리하지 못했습니다.", progress: "", cancelPending: false,
      ...(slot === "run" && !state.input.trim() && state.submitted ? { input: state.submitted.input, attachments: state.attachments.length ? state.attachments : state.submitted.attachments } : {}) });
    return;
  }
  if (message.type === "projects_state" && slot === "projects") { finish({ projects: list(message.items).map(projectChoice) }); return; }
  if (message.type === "project_build_preview_result" || message.type === "project_build_apply_result") {
    const data = object(message.payload);
    if (data.ok !== true) { finish({ error: text(data.message) || "프로젝트 변경을 처리하지 못했습니다." }); return; }
    if (slot === "projectPreview") {
      const preview = projectReview(data.preview);
      finish(preview.conversationId === state.activeId && preview.target === state.target ? { projectReview: preview, projectMessage: text(data.message), error: "" } : {});
    } else finish({ projectReview: null, projectMessage: text(data.message), error: "" });
    return;
  }
  if (message.type === "conversations" && slot.startsWith("list-")) {
    const items = list(message.items).map(item => conversation(item, mode(message.mode)));
    finish({ items: [...state.items.filter(item => item.mode !== mode(message.mode)), ...items].sort((a,b) => b.updated.localeCompare(a.updated)) }); return;
  }
  if (message.type === "conversation_detail") {
    const item = conversation(message.conversation);
    if (item.id !== request?.fields.conversationId) return;
    if (slot === "meta") { finish({ active: item, error: "" }); state.loadHistory(); return; }
    if (slot === "detail") finish({ activeId: item.id, active: item, currentResult: item.result, runtime: null, file: null, target: "main", standardInput: "", progress: "", error: "", settings: { ...state.settings, mode: item.mode, title: item.title, project: item.project, projectKey: item.projectKey, projectPath: item.projectPath, memory: item.memory,
      ...(item.result && item.result.provider in state.settings.models ? { provider: item.result.provider as ModelProvider, models: { ...state.settings.models, [item.result.provider]: item.result.model } } : {}),
      ...(item.result?.workers.length ? { workers: { ...initialSettings().workers, ...Object.fromEntries(item.result.workers.filter(worker => worker.provider in state.settings.workers).map(worker => [worker.provider, worker.model])) } } : {}) } });
    return;
  }
  if (message.type === "conversation_deleted" && slot === "delete") {
    finish(message.ok === true ? { activeId: "", active: null, currentResult: null, runtime: null, file: null, items: state.items.filter(item => item.id !== message.conversationId) } : { error: "빌드 기록을 삭제하지 못했습니다." });
    state.loadHistory(); return;
  }
  if ((message.type === "coding_result" || message.type === "coding_cancelled") && slot === "run") {
    const item = message.conversation ? conversation(message.conversation) : null;
    const result = message.type === "coding_result" ? codingResult(message) : item?.result || state.currentResult;
    finish({ currentResult: result, active: item || state.active, activeId: item?.id || text(message.conversationId) || state.activeId, cancelPending: false, progress: "", error: "", runtime: null, file: null, target: "main", ...(item ? { settings: { ...state.settings, title: item.title, project: item.project, projectKey: item.projectKey, projectPath: item.projectPath } } : {}),
      ...(message.type === "coding_cancelled" && !result?.resumeInput && !state.input.trim() && state.submitted ? { input: state.submitted.input, attachments: state.attachments.length ? state.attachments : state.submitted.attachments } : {}) });
    state.loadHistory(); return;
  }
  if (slot === "execute" && (message.type === "coding_execute_result" || message.type === "coding_cancelled")) {
    const runtime: Runtime = { target: text(request?.fields.target) || "main", conversationId: text(message.conversationId), ok: message.ok === true, message: text(message.message), previewUrl: localPreviewUrl(text(message.previewUrl)), targetProvider: text(message.targetProvider), targetModel: text(message.targetModel), execution: message.execution ? execution(message.execution) : null };
    finish({ runtime, progress: "", cancelPending: false, error: message.type === "coding_cancelled" ? "" : runtime.ok ? "" : runtime.message });
  }
}
export function useBuildWorkspaceSession() {
  useEffect(() => {
    const messages = subscribeDesktopMessages(receive);
    const bridge = useDesktopShellStore.subscribe((current, previous) => {
      if (current.bridge.status !== "closed" && !(previous.bridge.status === "connected" && current.bridge.status === "connecting")) return;
      interruptBuildNotebookSave();
      const state = useBuildWorkspace.getState();
      const active = state.pending.run || state.pending.execute;
      useBuildWorkspace.setState({ pending: {}, cancelPending: false, progress: "", ...(active ? { error: "연결이 끊겼습니다. 다시 연결한 뒤 저장한 빌드에서 진행 결과를 확인해 주세요.", ...(!state.input.trim() && state.submitted ? { input: state.submitted.input, attachments: state.attachments.length ? state.attachments : state.submitted.attachments } : {}) } : {}) });
    });
    return () => { messages(); bridge(); };
  }, []);
}
