import { useEffect } from "react";
import { create } from "zustand";
import {
  requestDesktopAsk,
  requestDesktopCoding,
  requestDesktopExplore,
  requestDesktopRoutine,
  requestDesktopSettings,
  requestDesktopRefactor,
  subscribeDesktopMessages,
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import { requestDesktopLlm } from "../middleware/llm-gateway";
import { requestDesktopInsights } from "../middleware/insights-gateway";
import { requestDesktopMemory } from "../middleware/memory-gateway";
import { requestDesktopNotebook } from "../middleware/notebook-gateway";
import { requestDesktopPlan } from "../middleware/planning-gateway";
import { requestDesktopRag } from "../middleware/rag-gateway";
import { requestDesktopSkill, type SkillScope } from "../middleware/skill-gateway";
import { requestConfirmDialog, requestPromptDialog } from "../dialog/dialog-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import {
  emptyAskContext,
  normalizeAskMessage,
  normalizeConversationContext,
  type AskConversationContext,
  type AskMessage
} from "../ask/ask-context";
import {
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_CODEX_MODEL,
  DEFAULT_COPILOT_MODEL,
  DEFAULT_GEMINI_WORKER_MODEL,
  DEFAULT_GROQ_SINGLE_MODEL,
  DEFAULT_GROQ_WORKER_MODEL,
  DEFAULT_NVIDIA_MODEL,
  NONE_MODEL,
  STATIC_MODEL_OPTIONS
} from "../ask/ask-models";
import {
  buildRagExecution,
  memoryGetWindowFromRagItem,
  normalizeMemoryRagExecution,
  normalizeRagPreflight,
  normalizeRepomapRagExecution,
  normalizeSessionReplayRagExecution,
  normalizeSessionReplayResultExecution,
  normalizeWebRagExecution,
  type AskRagCandidate,
  type AskRagExecution,
  type AskRagItem,
  type AskRagPreflight
} from "../ask/ask-rag";

export type BuildMessage = AskMessage;
export type CodingMode = "single" | "orchestration" | "multi";
export type BuildProvider = "auto" | "groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex";
export type BuildModelProvider = Exclude<BuildProvider, "auto">;
export type BuildSidePanel = "info" | "memory" | "models" | "result" | "refactor" | "skills" | "context" | null;

export type BuildConversationItem = {
  id: string;
  scope: string;
  mode: CodingMode;
  title: string;
  preview: string;
  messageCount: number;
  updatedUtc: string;
  project: string;
  category: string;
  tags: string[];
  linkedMemoryNotes: string[];
};

export type BuildConversationMetaDraft = {
  title: string;
  project: string;
  category: string;
  tags: string;
};

export type BuildMemoryNoteItem = {
  name: string;
  fullPath: string;
  excerpt: string;
  sizeBytes: number;
  lastWriteUtc: string;
};

export type BuildInputAttachment = {
  name: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  isImage: boolean;
};

export type BuildSelectedSkill = {
  name: string;
  scope: SkillScope;
  description: string;
};

export type CodingLanguageOption = {
  value: string;
  label: string;
};

export type CodingExecution = {
  language: string;
  runDirectory: string;
  entryFile: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  status: string;
};

export type CodingEvidence = {
  runMode: string;
  command: string;
  exitCode: number | null;
  status: string;
  stdoutSummary: string;
  stderrSummary: string;
  changedFiles: string[];
  previewUrl: string;
  previewEntry: string;
  screenshotPath: string;
  consoleSummary: string;
};

export type CodingWorker = {
  provider: string;
  model: string;
  language: string;
  role: string;
  summary: string;
  execution: CodingExecution;
  changedFiles: string[];
};

export type CodingResult = {
  mode: CodingMode;
  conversationId: string;
  provider: string;
  model: string;
  language: string;
  summary: string;
  commonSummary: string;
  commonPoints: string;
  differences: string;
  recommendation: string;
  execution: CodingExecution;
  workers: CodingWorker[];
  changedFiles: string[];
  evidence: CodingEvidence | null;
  autoMemoryNote: { name: string; fullPath: string } | null;
  citationCount: number;
  citationMappingCount: number;
  citationValidationPassed: boolean | null;
  citationValidationReason: string;
  guardCategory: string;
  guardReason: string;
  guardDetail: string;
  retryRequired: boolean;
  retryAction: string;
  retryScope: string;
  retryReason: string;
  retryAttempt: number;
  retryMaxAttempts: number;
  retryStopReason: string;
};

export type CodingRuntime = {
  ok: boolean;
  conversationId: string;
  language: string;
  runMode: string;
  message: string;
  targetProvider: string;
  targetModel: string;
  previewUrl: string;
  previewEntry: string;
  execution: CodingExecution | null;
  evidence: CodingEvidence | null;
};

export type CodingProgress = {
  mode: CodingMode;
  provider: string;
  model: string;
  phase: string;
  message: string;
  iteration: number;
  maxIterations: number;
  percent: number;
  done: boolean;
  stageKey: string;
  stageTitle: string;
  stageDetail: string;
  stageIndex: number;
  stageTotal: number;
};

export type CodingFilePreview = {
  path: string;
  url: string;
  content: string;
  loading: boolean;
  error: string;
};

export type RollbackStatus = {
  pending: boolean;
  ok: boolean | null;
  message: string;
  changedPaths: string[];
};

type BuildAutoSpeakCandidate = {
  key: string;
  text: string;
};

type BuildRagMemoryPreview = {
  path: string;
  text: string;
  error: string;
  loading: boolean;
};

type BuildState = {
  conversations: BuildConversationItem[];
  memoryNotes: BuildMemoryNoteItem[];
  selectedMemoryNotes: string[];
  memoryPreview: { name: string; content: string } | null;
  messages: BuildMessage[];
  conversationContext: AskConversationContext;
  activeConversation: BuildConversationItem | null;
  metaDraft: BuildConversationMetaDraft;
  codingMode: CodingMode;
  inputByMode: Record<CodingMode, string>;
  providerByMode: Record<CodingMode, BuildProvider>;
  summaryProvider: BuildProvider;
  languageByMode: Record<CodingMode, string>;
  modelCatalogs: Record<BuildModelProvider, string[]>;
  selectedModels: Partial<Record<BuildModelProvider, string>>;
  selectedModelsByMode: Record<CodingMode, Partial<Record<BuildModelProvider, string>>>;
  workerModelsByMode: Record<Exclude<CodingMode, "single">, Partial<Record<BuildModelProvider, string>>>;
  thinkPlus: boolean;
  selectedSkill: BuildSelectedSkill | null;
  skillSearch: string;
  attachments: BuildInputAttachment[];
  attachmentPanelOpen: boolean;
  attachmentDragActive: boolean;
  sidePanel: BuildSidePanel;
  folderOpenByName: Record<string, boolean>;
  activeConversationId: string | null;
  searchInput: string;
  searchQuery: string;
  searchResults: Array<{ conversationId: string; title: string; scope: string; mode: CodingMode; snippet: string }>;
  pending: boolean;
  loadingConversations: boolean;
  loadingMemoryNotes: boolean;
  searching: boolean;
  progressByMode: Partial<Record<CodingMode, CodingProgress>>;
  currentResult: CodingResult | null;
  runtime: CodingRuntime | null;
  filePreview: CodingFilePreview | null;
  selectedResultTarget: string;
  standardInput: string;
  standardInputByConversation: Record<string, string>;
  executionMessage: string;
  lastError: string | null;
  autoSpeakCandidate: BuildAutoSpeakCandidate | null;
  ragPreflight: AskRagPreflight | null;
  ragExecution: AskRagExecution | null;
  ragMemoryPreview: BuildRagMemoryPreview | null;
  ragPending: boolean;
  rollbackId: string;
  rollbackStatus: RollbackStatus;
  setCodingInput: (value: string) => void;
  setCodingMode: (value: CodingMode) => void;
  setProvider: (provider: BuildProvider) => void;
  setSummaryProvider: (provider: BuildProvider) => void;
  setSelectedModel: (provider: BuildModelProvider, model: string) => void;
  setWorkerModel: (provider: BuildModelProvider, model: string) => void;
  setLanguage: (language: string) => void;
  setThinkPlus: (enabled: boolean) => void;
  setSkillSearch: (query: string) => void;
  selectSkill: (skill: BuildSelectedSkill) => void;
  clearSelectedSkill: () => void;
  setSidePanel: (panel: BuildSidePanel) => void;
  toggleFolder: (folder: string) => void;
  patchMetaDraft: (patch: Partial<BuildConversationMetaDraft>) => void;
  setStandardInput: (value: string) => void;
  setRollbackId: (value: string) => void;
  setSearchInput: (query: string) => void;
  setAttachmentPanelOpen: (open: boolean) => void;
  setAttachmentDragActive: (active: boolean) => void;
  setSelectedResultTarget: (target: string) => void;
  loadModelCatalogs: () => void;
  loadConversations: () => void;
  loadMemoryNotes: () => void;
  openConversation: (item: BuildConversationItem) => void;
  createConversation: () => void;
  renameConversation: (item: BuildConversationItem) => void;
  deleteConversation: (item: BuildConversationItem) => void;
  saveConversationMeta: () => void;
  saveConversationToMemory: (item: BuildConversationItem) => void;
  createActiveConversationMemoryNote: (compactConversation?: boolean) => void;
  toggleMemoryNote: (name: string) => void;
  readMemoryNote: (name: string) => void;
  renameMemoryNote: (name: string) => void;
  deleteSelectedMemoryNotes: () => void;
  addAttachments: (items: BuildInputAttachment[]) => void;
  removeAttachment: (name: string) => void;
  clearAttachments: () => void;
  searchConversations: (query: string) => void;
  clearSearch: () => void;
  saveInputAsRoutine: () => void;
  createPlanFromInput: () => void;
  saveMessageToNotebook: (messageIndex: number, text: string, meta?: string) => void;
  createPlanFromMessage: (messageIndex: number, text: string, meta?: string) => void;
  saveResultToNotebook: () => void;
  createPlanFromResult: () => void;
  runRagPreflight: () => void;
  runRagCandidate: (candidate: AskRagCandidate) => void;
  openRagMemoryItem: (item: AskRagItem) => void;
  clearRagMemoryPreview: () => void;
  clearRagPreflight: () => void;
  runCoding: () => void;
  executeLatest: () => void;
  previewFile: (path: string, targetSegment?: string, runDirectory?: string) => void;
  clearFilePreview: () => void;
  clearResult: () => void;
  restoreRollback: () => void;
};

export const BUILD_PROVIDER_OPTIONS: Array<{ value: BuildProvider; label: string }> = [
  { value: "auto", label: "자동" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
  { value: "cerebras", label: "Cerebras" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "copilot", label: "Copilot" },
  { value: "codex", label: "Codex" }
];

export const CODING_LANGUAGE_OPTIONS: CodingLanguageOption[] = [
  { value: "auto", label: "자동" },
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "react-vite", label: "React/Vite" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "java", label: "Java" },
  { value: "kotlin", label: "Kotlin" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "swift", label: "Swift" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "bash", label: "Bash" }
];

const EMPTY_META_DRAFT: BuildConversationMetaDraft = {
  title: "",
  project: "기본",
  category: "코딩",
  tags: ""
};

const DEFAULT_MODEL_CATALOGS: Record<BuildModelProvider, string[]> = {
  groq: STATIC_MODEL_OPTIONS.groq ?? [],
  gemini: STATIC_MODEL_OPTIONS.gemini ?? [],
  cerebras: STATIC_MODEL_OPTIONS.cerebras ?? [],
  nvidia: STATIC_MODEL_OPTIONS.nvidia ?? [],
  copilot: STATIC_MODEL_OPTIONS.copilot ?? [],
  codex: STATIC_MODEL_OPTIONS.codex ?? []
};

const DEFAULT_SELECTED_MODELS: Partial<Record<BuildModelProvider, string>> = {
  groq: DEFAULT_GROQ_SINGLE_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: DEFAULT_COPILOT_MODEL,
  codex: DEFAULT_CODEX_MODEL
};

const DEFAULT_WORKER_MODELS: Partial<Record<BuildModelProvider, string>> = {
  groq: DEFAULT_GROQ_WORKER_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: NONE_MODEL,
  codex: NONE_MODEL
};

const IDLE_ROLLBACK: RollbackStatus = { pending: false, ok: null, message: "", changedPaths: [] };
const EMPTY_EXECUTION: CodingExecution = {
  language: "",
  runDirectory: "",
  entryFile: "",
  command: "",
  exitCode: null,
  stdout: "",
  stderr: "",
  status: ""
};

function readField(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeCodingMode(value: unknown): CodingMode {
  return value === "orchestration" || value === "multi" ? value : "single";
}

function normalizeStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const payload = record(item);
      return String(readField(payload, "id", "model", "name") || "");
    })
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeConversation(item: unknown): BuildConversationItem {
  const payload = record(item);
  return {
    id: String(readField(payload, "id", "Id") || ""),
    scope: String(readField(payload, "scope", "Scope") || "coding"),
    mode: normalizeCodingMode(readField(payload, "mode", "Mode")),
    title: String(readField(payload, "title", "Title") || "제목 없음"),
    preview: String(readField(payload, "preview", "Preview") || ""),
    messageCount: Number(readField(payload, "messageCount", "MessageCount") || 0),
    updatedUtc: String(readField(payload, "updatedUtc", "UpdatedUtc") || ""),
    project: String(readField(payload, "project", "Project") || "기본"),
    category: String(readField(payload, "category", "Category") || "코딩"),
    tags: normalizeStrings(readField(payload, "tags", "Tags")),
    linkedMemoryNotes: normalizeStrings(readField(payload, "linkedMemoryNotes", "LinkedMemoryNotes"))
  };
}

function normalizeMemoryNote(item: unknown): BuildMemoryNoteItem {
  const payload = record(item);
  return {
    name: String(payload.name || ""),
    fullPath: String(payload.fullPath || ""),
    excerpt: String(payload.excerpt || ""),
    sizeBytes: Number(payload.sizeBytes || 0),
    lastWriteUtc: String(payload.lastWriteUtc || "")
  };
}

function tagsToText(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMetaDraft(item: BuildConversationItem | null): BuildConversationMetaDraft {
  if (!item) return { ...EMPTY_META_DRAFT };
  return {
    title: item.title || "",
    project: item.project || "기본",
    category: item.category || "코딩",
    tags: tagsToText(item.tags)
  };
}

function normalizeConversationMessages(conversation: Record<string, unknown>): BuildMessage[] {
  const rawMessages = readField(conversation, "messages", "Messages");
  return Array.isArray(rawMessages) ? rawMessages.map(normalizeAskMessage) : [];
}

function normalizeExecution(value: unknown): CodingExecution {
  const payload = record(value);
  if (Object.keys(payload).length === 0) return { ...EMPTY_EXECUTION };
  return {
    language: String(readField(payload, "language", "Language") || ""),
    runDirectory: String(readField(payload, "runDirectory", "RunDirectory") || ""),
    entryFile: String(readField(payload, "entryFile", "EntryFile") || ""),
    command: String(readField(payload, "command", "Command") || ""),
    exitCode: readField(payload, "exitCode", "ExitCode") === undefined ? null : Number(readField(payload, "exitCode", "ExitCode")),
    stdout: String(readField(payload, "stdout", "stdOut", "StdOut") || ""),
    stderr: String(readField(payload, "stderr", "stdErr", "StdErr") || ""),
    status: String(readField(payload, "status", "Status") || "")
  };
}

function normalizeEvidence(value: unknown): CodingEvidence | null {
  const payload = record(value);
  if (Object.keys(payload).length === 0) return null;
  return {
    runMode: String(readField(payload, "runMode", "RunMode") || ""),
    command: String(readField(payload, "command", "Command") || ""),
    exitCode: readField(payload, "exitCode", "ExitCode") === undefined ? null : Number(readField(payload, "exitCode", "ExitCode")),
    status: String(readField(payload, "status", "Status") || ""),
    stdoutSummary: String(readField(payload, "stdoutSummary", "StdoutSummary") || ""),
    stderrSummary: String(readField(payload, "stderrSummary", "StderrSummary") || ""),
    changedFiles: normalizeStrings(readField(payload, "changedFiles", "ChangedFiles")),
    previewUrl: String(readField(payload, "previewUrl", "PreviewUrl") || ""),
    previewEntry: String(readField(payload, "previewEntry", "PreviewEntry") || ""),
    screenshotPath: String(readField(payload, "screenshotPath", "ScreenshotPath") || ""),
    consoleSummary: String(readField(payload, "consoleSummary", "ConsoleSummary") || "")
  };
}

function normalizeWorker(value: unknown): CodingWorker {
  const payload = record(value);
  return {
    provider: String(readField(payload, "provider", "Provider") || ""),
    model: String(readField(payload, "model", "Model") || ""),
    language: String(readField(payload, "language", "Language") || ""),
    role: String(readField(payload, "role", "Role") || ""),
    summary: String(readField(payload, "summary", "Summary") || ""),
    execution: normalizeExecution(readField(payload, "execution", "Execution")),
    changedFiles: normalizeStrings(readField(payload, "changedFiles", "ChangedFiles"))
  };
}

function normalizeCodingResult(value: unknown): CodingResult | null {
  const payload = record(value);
  const hasResult =
    readField(payload, "conversationId", "ConversationId") !== undefined ||
    readField(payload, "execution", "Execution") !== undefined ||
    readField(payload, "changedFiles", "ChangedFiles") !== undefined ||
    readField(payload, "workers", "Workers") !== undefined;
  if (!hasResult) return null;
  const workersRaw = readField(payload, "workers", "Workers");
  const autoMemoryNote = record(readField(payload, "autoMemoryNote", "AutoMemoryNote"));
  const citationValidation = record(readField(payload, "citationValidation", "CitationValidation"));
  return {
    mode: normalizeCodingMode(readField(payload, "mode", "Mode")),
    conversationId: String(readField(payload, "conversationId", "ConversationId") || ""),
    provider: String(readField(payload, "provider", "Provider") || ""),
    model: String(readField(payload, "model", "Model") || ""),
    language: String(readField(payload, "language", "Language") || ""),
    summary: String(readField(payload, "summary", "Summary") || ""),
    commonSummary: String(readField(payload, "commonSummary", "CommonSummary") || ""),
    commonPoints: String(readField(payload, "commonPoints", "CommonPoints") || ""),
    differences: String(readField(payload, "differences", "Differences") || ""),
    recommendation: String(readField(payload, "recommendation", "Recommendation") || ""),
    execution: normalizeExecution(readField(payload, "execution", "Execution")),
    workers: Array.isArray(workersRaw) ? workersRaw.map(normalizeWorker) : [],
    changedFiles: normalizeStrings(readField(payload, "changedFiles", "ChangedFiles")),
    evidence: normalizeEvidence(readField(payload, "evidence", "Evidence")),
    autoMemoryNote: Object.keys(autoMemoryNote).length > 0
      ? {
          name: String(readField(autoMemoryNote, "name", "Name") || ""),
          fullPath: String(readField(autoMemoryNote, "fullPath", "FullPath") || "")
        }
      : null,
    citationCount: Array.isArray(readField(payload, "citations", "Citations")) ? (readField(payload, "citations", "Citations") as unknown[]).length : 0,
    citationMappingCount: Array.isArray(readField(payload, "citationMappings", "CitationMappings")) ? (readField(payload, "citationMappings", "CitationMappings") as unknown[]).length : 0,
    citationValidationPassed: readField(citationValidation, "passed", "Passed") === undefined ? null : readField(citationValidation, "passed", "Passed") === true,
    citationValidationReason: String(readField(citationValidation, "reasonCode", "ReasonCode", "reason", "Reason") || ""),
    guardCategory: String(readField(payload, "guardCategory", "GuardCategory") || ""),
    guardReason: String(readField(payload, "guardReason", "GuardReason") || ""),
    guardDetail: String(readField(payload, "guardDetail", "GuardDetail") || ""),
    retryRequired: readField(payload, "retryRequired", "RetryRequired") === true,
    retryAction: String(readField(payload, "retryAction", "RetryAction") || ""),
    retryScope: String(readField(payload, "retryScope", "RetryScope") || ""),
    retryReason: String(readField(payload, "retryReason", "RetryReason") || ""),
    retryAttempt: Number(readField(payload, "retryAttempt", "RetryAttempt") || 0),
    retryMaxAttempts: Number(readField(payload, "retryMaxAttempts", "RetryMaxAttempts") || 0),
    retryStopReason: String(readField(payload, "retryStopReason", "RetryStopReason") || "")
  };
}

function normalizeRuntime(message: DesktopServerMessage): CodingRuntime {
  return {
    ok: message.ok !== false,
    conversationId: String(readField(message, "conversationId", "ConversationId") || ""),
    language: String(readField(message, "language", "Language") || ""),
    runMode: String(readField(message, "runMode", "RunMode") || ""),
    message: String(readField(message, "message", "Message") || ""),
    targetProvider: String(readField(message, "targetProvider", "TargetProvider") || ""),
    targetModel: String(readField(message, "targetModel", "TargetModel") || ""),
    previewUrl: String(readField(message, "previewUrl", "PreviewUrl") || ""),
    previewEntry: String(readField(message, "previewEntry", "PreviewEntry") || ""),
    execution: readField(message, "execution", "Execution") ? normalizeExecution(readField(message, "execution", "Execution")) : null,
    evidence: normalizeEvidence(readField(message, "evidence", "Evidence"))
  };
}

function normalizeProgress(message: DesktopServerMessage): CodingProgress {
  return {
    mode: normalizeCodingMode(readField(message, "mode", "Mode")),
    provider: String(readField(message, "provider", "Provider") || ""),
    model: String(readField(message, "model", "Model") || ""),
    phase: String(readField(message, "phase", "Phase") || ""),
    message: String(readField(message, "message", "Message") || ""),
    iteration: Number(readField(message, "iteration", "Iteration") || 0),
    maxIterations: Number(readField(message, "maxIterations", "MaxIterations") || 0),
    percent: Number(readField(message, "percent", "Percent") || 0),
    done: readField(message, "done", "Done") === true,
    stageKey: String(readField(message, "stageKey", "StageKey") || ""),
    stageTitle: String(readField(message, "stageTitle", "StageTitle") || ""),
    stageDetail: String(readField(message, "stageDetail", "StageDetail") || ""),
    stageIndex: Number(readField(message, "stageIndex", "StageIndex") || 0),
    stageTotal: Number(readField(message, "stageTotal", "StageTotal") || 0)
  };
}

function parseWebUrls(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .slice(0, 3);
}

function resultTargetKey(targetSegment: string, provider = "", model = "") {
  void provider;
  void model;
  return targetSegment;
}

function buildResultTargets(result: CodingResult | null): Array<{ key: string; segment: string; execution: CodingExecution; changedFiles: string[] }> {
  if (!result) return [];
  return [
    { key: resultTargetKey("main", result.provider, result.model), segment: "main", execution: result.execution, changedFiles: result.changedFiles },
    ...result.workers.map((worker, index) => ({
      key: resultTargetKey(`worker-${index}`, worker.provider, worker.model),
      segment: `worker-${index}`,
      execution: worker.execution,
      changedFiles: worker.changedFiles
    }))
  ];
}

function normalizePreviewRelativePath(pathValue: string, runDirectory?: string) {
  const path = String(pathValue || "").replace(/\\/g, "/").trim();
  const root = String(runDirectory || "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path) return "";
  if (root && path.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    return path.slice(root.length + 1).replace(/^\/+/, "");
  }
  return path.replace(/^\/+/, "");
}

function buildCodingPreviewUrl(conversationId: string, targetSegment: string, pathValue: string, runDirectory?: string) {
  const relative = normalizePreviewRelativePath(pathValue, runDirectory)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  if (!conversationId || !targetSegment || !relative) return "";
  return `/api/coding-preview/${encodeURIComponent(conversationId)}/${encodeURIComponent(targetSegment)}/${relative}`;
}

function resolveDefaultPreviewPath(result: CodingResult | null) {
  if (!result) return "";
  const entry = result.execution.entryFile.trim();
  const runDirectory = result.execution.runDirectory.trim();
  if (entry) {
    if (entry.startsWith("/")) return entry;
    if (runDirectory) return `${runDirectory.replace(/\/+$/, "")}/${entry.replace(/^\/+/, "")}`;
    const matched = result.changedFiles.find((path) => path === entry || path.endsWith(`/${entry}`));
    if (matched) return matched;
  }
  return result.changedFiles[0] || "";
}

function trimNotebookEntry(value: string, maxChars: number) {
  const text = value.trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n...(truncated)` : text;
}

function buildNotebookEntryFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "빌드탭 답변에서 저장한 내용",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    trimNotebookEntry(text, 2200)
  ].filter(Boolean).join("\n");
}

function buildPlanObjectiveFromMessage(messageIndex: number, text: string, meta = "") {
  return [
    "아래 빌드탭 답변을 실제 작업계획으로 정리",
    "",
    meta.trim() ? `응답: ${meta.trim()}` : "",
    `메시지: ${messageIndex + 1}`,
    "",
    text.trim()
  ].filter(Boolean).join("\n");
}

function buildResultNotebookEntry(result: CodingResult) {
  return [
    "빌드탭 코딩 결과",
    "",
    `모드: ${result.mode}`,
    `모델: ${[result.provider, result.model].filter(Boolean).join(":") || "-"}`,
    `언어: ${result.language || "-"}`,
    `상태: ${result.execution.status || "-"} exit=${result.execution.exitCode ?? "-"}`,
    "",
    "요약",
    result.summary || result.commonSummary || "-",
    "",
    result.changedFiles.length > 0 ? `변경 파일:\n${result.changedFiles.join("\n")}` : "변경 파일 없음",
    "",
    result.evidence ? `근거:\n${result.evidence.stdoutSummary || result.evidence.stderrSummary || result.evidence.consoleSummary || "-"}` : ""
  ].filter(Boolean).join("\n");
}

function buildAutoSpeakCandidate(conversationId: string | null, messages: BuildMessage[]): BuildAutoSpeakCandidate | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "ai" || !message.text.trim()) continue;
    return {
      key: `${conversationId || "new"}-${message.createdUtc || index}-${message.text.slice(0, 48)}`,
      text: message.text
    };
  }
  return null;
}

export function modelOptionsForBuildProvider(provider: BuildProvider, catalogs: Record<BuildModelProvider, string[]>): string[] {
  if (provider === "auto") return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...(STATIC_MODEL_OPTIONS[provider] ?? []), ...(catalogs[provider] ?? [])]) {
    const value = String(item || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export const useBuildStore = create<BuildState>((set, get) => ({
  conversations: [],
  memoryNotes: [],
  selectedMemoryNotes: [],
  memoryPreview: null,
  messages: [],
  conversationContext: emptyAskContext(),
  activeConversation: null,
  metaDraft: { ...EMPTY_META_DRAFT },
  codingMode: "single",
  inputByMode: { single: "", orchestration: "", multi: "" },
  providerByMode: { single: "codex", orchestration: "auto", multi: "gemini" },
  summaryProvider: "gemini",
  languageByMode: { single: "auto", orchestration: "auto", multi: "auto" },
  modelCatalogs: { ...DEFAULT_MODEL_CATALOGS },
  selectedModels: { ...DEFAULT_SELECTED_MODELS },
  selectedModelsByMode: {
    single: { ...DEFAULT_SELECTED_MODELS },
    orchestration: { ...DEFAULT_SELECTED_MODELS },
    multi: { ...DEFAULT_SELECTED_MODELS }
  },
  workerModelsByMode: {
    orchestration: { ...DEFAULT_WORKER_MODELS },
    multi: { ...DEFAULT_WORKER_MODELS }
  },
  thinkPlus: false,
  selectedSkill: null,
  skillSearch: "",
  attachments: [],
  attachmentPanelOpen: false,
  attachmentDragActive: false,
  sidePanel: null,
  folderOpenByName: {},
  activeConversationId: null,
  searchInput: "",
  searchQuery: "",
  searchResults: [],
  pending: false,
  loadingConversations: false,
  loadingMemoryNotes: false,
  searching: false,
  progressByMode: {},
  currentResult: null,
  runtime: null,
  filePreview: null,
  selectedResultTarget: "main",
  standardInput: "",
  standardInputByConversation: {},
  executionMessage: "",
  lastError: null,
  autoSpeakCandidate: null,
  ragPreflight: null,
  ragExecution: null,
  ragMemoryPreview: null,
  ragPending: false,
  rollbackId: "",
  rollbackStatus: { ...IDLE_ROLLBACK },
  setCodingInput: (value) => {
    const mode = get().codingMode;
    set({ inputByMode: { ...get().inputByMode, [mode]: value } });
  },
  setCodingMode: (value) => {
    set({
      codingMode: value,
      activeConversationId: null,
      activeConversation: null,
      messages: [],
      conversationContext: emptyAskContext(),
      currentResult: null,
      runtime: null,
      filePreview: null,
      selectedResultTarget: "main",
      standardInput: "",
      autoSpeakCandidate: null
    });
    get().loadConversations();
  },
  setProvider: (provider) => set({ providerByMode: { ...get().providerByMode, [get().codingMode]: provider } }),
  setSummaryProvider: (provider) => set({ summaryProvider: provider }),
  setSelectedModel: (provider, model) => {
    const mode = get().codingMode;
    set({
      selectedModels: { ...get().selectedModels, [provider]: model },
      selectedModelsByMode: {
        ...get().selectedModelsByMode,
        [mode]: { ...get().selectedModelsByMode[mode], [provider]: model }
      }
    });
  },
  setWorkerModel: (provider, model) => {
    const mode = get().codingMode;
    if (mode === "single") {
      set({ selectedModels: { ...get().selectedModels, [provider]: model } });
      return;
    }
    set({
      workerModelsByMode: {
        ...get().workerModelsByMode,
        [mode]: { ...get().workerModelsByMode[mode], [provider]: model }
      }
    });
  },
  setLanguage: (language) => set({ languageByMode: { ...get().languageByMode, [get().codingMode]: language } }),
  setThinkPlus: (enabled) => set({ thinkPlus: enabled }),
  setSkillSearch: (query) => set({ skillSearch: query }),
  selectSkill: (skill) => {
    const name = String(skill.name || "").trim();
    if (!name) return;
    const scope = String(skill.scope || "project").toLowerCase() === "global" ? "global" : "project";
    set({
      selectedSkill: {
        name,
        scope,
        description: String(skill.description || "").trim()
      },
      sidePanel: null,
      lastError: null
    });
  },
  clearSelectedSkill: () => {
    const conversationId = get().activeConversationId || "";
    set({ selectedSkill: null });
    if (conversationId && !requestDesktopSkill.clearActive(conversationId)) {
      set({ lastError: "활성 스킬 해제 요청을 전송하지 못했다." });
    }
  },
  setSidePanel: (panel) => set({ sidePanel: panel }),
  toggleFolder: (folder) => {
    const key = folder.trim() || "기본";
    const current = get().folderOpenByName[key];
    set({ folderOpenByName: { ...get().folderOpenByName, [key]: current === false } });
  },
  patchMetaDraft: (patch) => set({ metaDraft: { ...get().metaDraft, ...patch } }),
  setStandardInput: (value) => {
    const conversationId = (get().activeConversationId || get().currentResult?.conversationId || "").trim();
    set({
      standardInput: value,
      standardInputByConversation: conversationId
        ? { ...get().standardInputByConversation, [conversationId]: value }
        : get().standardInputByConversation
    });
  },
  setRollbackId: (value) => set({ rollbackId: value }),
  setSearchInput: (query) => set({ searchInput: query }),
  setAttachmentPanelOpen: (open) => set({ attachmentPanelOpen: open }),
  setAttachmentDragActive: (active) => set({ attachmentDragActive: active }),
  setSelectedResultTarget: (target) => set({ selectedResultTarget: target, filePreview: null }),
  loadModelCatalogs: () => {
    requestDesktopLlm.groqModels();
    requestDesktopLlm.copilotModels();
    requestDesktopSettings.cerebrasModels();
    requestDesktopLlm.geminiModels();
    requestDesktopLlm.nvidiaModels();
    requestDesktopLlm.codexModels();
  },
  loadConversations: () => {
    set({ loadingConversations: true, lastError: null });
    if (!requestDesktopAsk.listConversations("coding", get().codingMode)) {
      set({ loadingConversations: false, lastError: "코딩 작업함 목록 요청을 전송하지 못했다." });
    }
  },
  loadMemoryNotes: () => {
    set({ loadingMemoryNotes: true });
    if (!requestDesktopSettings.listMemoryNotes()) {
      set({ loadingMemoryNotes: false, lastError: "메모리 노트 요청을 전송하지 못했다." });
    }
  },
  openConversation: (item) => {
    if (!item.id) return;
    set({
      activeConversationId: item.id,
      activeConversation: item,
      metaDraft: buildMetaDraft(item),
      selectedMemoryNotes: item.linkedMemoryNotes,
      messages: [],
      conversationContext: emptyAskContext(),
      currentResult: null,
      runtime: null,
      filePreview: null,
      selectedResultTarget: "main",
      standardInput: get().standardInputByConversation[item.id] || "",
      pending: true,
      autoSpeakCandidate: null,
      lastError: null
    });
    if (!requestDesktopAsk.getConversation(item.id)) {
      set({ pending: false, lastError: "코딩 작업 조회 요청을 전송하지 못했다." });
    }
  },
  createConversation: () => {
    const mode = get().codingMode;
    const draft = get().metaDraft;
    set({
      messages: [],
      activeConversation: null,
      activeConversationId: null,
      conversationContext: emptyAskContext(),
      currentResult: null,
      runtime: null,
      filePreview: null,
      standardInput: "",
      pending: true,
      autoSpeakCandidate: null
    });
    if (!requestDesktopAsk.createConversation("coding", mode, {
      title: draft.title,
      project: draft.project,
      category: draft.category,
      tags: draft.tags
    })) {
      set({ pending: false, lastError: "새 코딩 작업 요청을 전송하지 못했다." });
    }
  },
  renameConversation: async (item) => {
    const next = await requestPromptDialog({
      title: "코딩 작업 이름 변경",
      message: "새 작업 제목을 입력하세요.",
      defaultValue: item.title || "",
      placeholder: "작업 제목"
    });
    const title = String(next || "").trim();
    if (!title || title === item.title) return;
    if (!requestDesktopAsk.updateConversationMeta(item.id, {
      title,
      project: item.project,
      category: item.category,
      tags: tagsToText(item.tags)
    })) {
      set({ lastError: "코딩 작업 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteConversation: async (item) => {
    const confirmed = await requestConfirmDialog({
      title: "코딩 작업 삭제",
      message: `코딩 작업 "${item.title || item.id}"를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopAsk.deleteConversation(item.id, "coding", item.mode || get().codingMode)) {
      set({ lastError: "코딩 작업 삭제 요청을 전송하지 못했다." });
    }
    if (get().activeConversationId === item.id) {
      set({
        activeConversationId: null,
        activeConversation: null,
        messages: [],
        metaDraft: { ...EMPTY_META_DRAFT },
        currentResult: null,
        runtime: null,
        filePreview: null,
        standardInput: "",
        autoSpeakCandidate: null
      });
    }
  },
  saveConversationMeta: () => {
    const conversationId = get().activeConversationId;
    if (!conversationId) {
      set({ lastError: "먼저 코딩 작업을 선택하세요." });
      return;
    }
    const draft = get().metaDraft;
    const next = {
      title: draft.title.trim() || "제목 없음",
      project: draft.project.trim() || "기본",
      category: draft.category.trim() || "코딩",
      tags: tagsToText(parseTags(draft.tags))
    };
    set({ metaDraft: next });
    if (!requestDesktopAsk.updateConversationMeta(conversationId, next)) {
      set({ lastError: "코딩 작업 메타 저장 요청을 전송하지 못했다." });
    }
  },
  saveConversationToMemory: (item) => {
    if (!requestDesktopAsk.createMemoryNote(item.id, false)) {
      set({ lastError: "메모리 저장 요청을 전송하지 못했다." });
    }
  },
  createActiveConversationMemoryNote: (compactConversation = false) => {
    const conversationId = get().activeConversationId;
    if (!conversationId) {
      set({ lastError: "메모리를 만들 코딩 작업을 먼저 선택하세요." });
      return;
    }
    if (!requestDesktopAsk.createMemoryNote(conversationId, compactConversation)) {
      set({ lastError: "메모리 저장 요청을 전송하지 못했다." });
    }
  },
  toggleMemoryNote: (name) => {
    const normalized = String(name || "").trim();
    if (!normalized) return;
    const current = get().selectedMemoryNotes;
    const next = current.includes(normalized)
      ? current.filter((item) => item !== normalized)
      : [...current, normalized];
    set({ selectedMemoryNotes: next });
  },
  readMemoryNote: (name) => {
    const normalized = String(name || "").trim();
    if (!normalized) return;
    set({ memoryPreview: { name: normalized, content: "불러오는 중..." }, loadingMemoryNotes: true });
    if (!requestDesktopSettings.readMemoryNote(normalized)) {
      set({ loadingMemoryNotes: false, lastError: "메모리 노트 읽기 요청을 전송하지 못했다." });
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
      set({ lastError: "메모리 노트 이름 변경 요청을 전송하지 못했다." });
    }
  },
  deleteSelectedMemoryNotes: async () => {
    const selected = get().selectedMemoryNotes;
    if (selected.length === 0) {
      set({ lastError: "삭제할 메모리 노트를 선택하세요." });
      return;
    }
    const confirmed = await requestConfirmDialog({
      title: "메모리 노트 삭제",
      message: `선택한 메모리 노트 ${selected.length}개를 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger"
    });
    if (!confirmed) return;
    if (!requestDesktopSettings.deleteMemoryNotes(selected)) {
      set({ lastError: "메모리 노트 삭제 요청을 전송하지 못했다." });
    }
  },
  addAttachments: (items) => {
    if (items.length === 0) return;
    const existing = get().attachments;
    const next = [...existing];
    for (const item of items) {
      if (next.length >= 6) break;
      next.push(item);
    }
    set({
      attachments: next,
      attachmentPanelOpen: true,
      lastError: next.length >= 6 && items.length + existing.length > 6 ? "첨부는 최대 6개까지 가능합니다." : null
    });
  },
  removeAttachment: (name) => set({ attachments: get().attachments.filter((item) => item.name !== name) }),
  clearAttachments: () => set({ attachments: [] }),
  searchConversations: (query) => {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      set({ searchInput: "", searchQuery: "", searchResults: [], searching: false });
      return;
    }
    set({ searchInput: trimmed, searchQuery: trimmed, searchResults: [], searching: true });
    if (!requestDesktopAsk.searchConversation(trimmed, 30)) {
      set({ searching: false, lastError: "코딩 작업 검색 요청을 전송하지 못했다." });
    }
  },
  clearSearch: () => set({ searchInput: "", searchQuery: "", searchResults: [], searching: false }),
  saveInputAsRoutine: () => {
    const text = get().inputByMode[get().codingMode].trim();
    if (text.length < 5) {
      set({ lastError: "루틴으로 저장할 입력은 최소 5자 이상이어야 합니다." });
      return;
    }
    if (!requestDesktopRoutine.createRoutine({
      title: text.slice(0, 40),
      request: text,
      executionMode: "coding",
      scheduleKind: "manual",
      scheduleTime: "08:00",
      weekdays: [],
      dayOfMonth: 1,
      runImmediately: false,
      notifyTelegram: false
    })) {
      set({ lastError: "루틴 생성 요청을 전송하지 못했다." });
    }
  },
  createPlanFromInput: () => {
    const text = get().inputByMode[get().codingMode].trim();
    if (text.length < 5) {
      set({ lastError: "작업계획으로 만들 입력은 최소 5자 이상이어야 합니다." });
      return;
    }
    if (!requestDesktopPlan.create(text, "fast", [
      "코딩 변경 범위와 검증 기준을 분리하기",
      "적용 전 위험 파일과 롤백 기준을 명시하기",
      "완료 후 실행 또는 빌드 검증 단계를 포함하기"
    ], get().activeConversationId)) {
      set({ lastError: "작업계획 생성 요청을 전송하지 못했다." });
    }
  },
  saveMessageToNotebook: (messageIndex, text, meta = "") => {
    const body = String(text || "").trim();
    if (!body) {
      set({ lastError: "노트북에 저장할 답변 내용이 없습니다." });
      return;
    }
    const ok = requestDesktopNotebook.append("learning", buildNotebookEntryFromMessage(messageIndex, body, meta), undefined, {
      source: "coding",
      conversationId: get().activeConversationId,
      tags: ["coding", "assistant-response"]
    });
    set({ lastError: ok ? null : "노트북 저장 요청을 전송하지 못했다." });
  },
  createPlanFromMessage: (messageIndex, text, meta = "") => {
    const body = String(text || "").trim();
    if (!body) {
      set({ lastError: "작업계획으로 만들 답변 내용이 없습니다." });
      return;
    }
    const ok = requestDesktopPlan.create(
      buildPlanObjectiveFromMessage(messageIndex, body, meta),
      "fast",
      [
        "답변의 코드 변경 의도를 유지하기",
        "실행 가능한 단계와 검증 기준을 분리하기",
        "위험 파일과 롤백 기준을 포함하기"
      ],
      get().activeConversationId
    );
    set({ lastError: ok ? null : "작업계획 생성 요청을 전송하지 못했다." });
  },
  saveResultToNotebook: () => {
    const result = get().currentResult;
    if (!result) {
      set({ lastError: "저장할 코딩 결과가 없습니다." });
      return;
    }
    const ok = requestDesktopNotebook.append("verification", buildResultNotebookEntry(result), undefined, {
      source: "coding",
      conversationId: get().activeConversationId || result.conversationId,
      provider: result.provider,
      model: result.model,
      tags: ["coding-result", result.mode]
    });
    set({ lastError: ok ? null : "코딩 결과 노트북 저장 요청을 전송하지 못했다." });
  },
  createPlanFromResult: () => {
    const result = get().currentResult;
    if (!result) {
      set({ lastError: "작업계획으로 만들 코딩 결과가 없습니다." });
      return;
    }
    const ok = requestDesktopPlan.create(
      [
        "아래 코딩 결과를 후속 작업계획으로 정리",
        "",
        buildResultNotebookEntry(result)
      ].join("\n"),
      "fast",
      [
        "남은 변경 파일과 검증 실패를 우선순위로 정리하기",
        "실행 로그와 근거 패널 내용을 검증 단계에 반영하기",
        "후속 작업이 없으면 완료 조건만 명시하기"
      ],
      get().activeConversationId || result.conversationId
    );
    set({ lastError: ok ? null : "코딩 결과 기반 작업계획 요청을 전송하지 못했다." });
  },
  runRagPreflight: () => {
    const query = String(get().inputByMode[get().codingMode] || "").trim();
    if (!query) return;
    set({ ragPending: true, ragPreflight: null, ragExecution: null, ragMemoryPreview: null, lastError: null });
    if (!requestDesktopRag.preflight(query)) {
      set({ ragPending: false, lastError: "RAG preflight 요청을 전송하지 못했다." });
    }
  },
  runRagCandidate: (candidate) => {
    const requestType = String(candidate.suggestedRequestType || "").trim();
    const query = String(get().ragPreflight?.queryPreview || get().inputByMode[get().codingMode] || "").trim();
    if (!requestType || candidate.kind === "none") return;
    set({ ragExecution: buildRagExecution(candidate.kind, requestType, true), ragMemoryPreview: null, lastError: null });
    let ok = false;
    if (requestType === "memory_search") ok = requestDesktopSettings.memorySearch(query, 8, 0);
    else if (requestType === "web_search") ok = requestDesktopExplore.webSearch(query, 8);
    else if (requestType === "code_repomap_snapshot_get") ok = requestDesktopInsights.codeRepomap(30);
    else if (requestType === "session_replay_get") {
      const conversationId = String(get().activeConversationId || "").trim();
      ok = conversationId ? requestDesktopRag.sessionReplay(conversationId, 80) : false;
    }
    if (!ok) {
      set({ ragExecution: { ...buildRagExecution(candidate.kind, requestType), status: "blocked", error: "후보 조회 요청을 전송하지 못했다." } });
    }
  },
  openRagMemoryItem: (item) => {
    const request = memoryGetWindowFromRagItem(item);
    if (!request.path) return;
    set({
      ragMemoryPreview: { path: request.path, text: "", error: "", loading: true },
      lastError: null
    });
    if (!requestDesktopMemory.get(request.path, request.fromLine, request.lines)) {
      set({
        ragMemoryPreview: {
          path: request.path,
          text: "",
          error: "메모리 상세 읽기 요청을 전송하지 못했다.",
          loading: false
        }
      });
    }
  },
  clearRagMemoryPreview: () => set({ ragMemoryPreview: null }),
  clearRagPreflight: () => set({ ragPreflight: null, ragExecution: null, ragMemoryPreview: null, ragPending: false }),
  runCoding: () => {
    if (get().pending) return;
    const mode = get().codingMode;
    const text = get().inputByMode[mode].trim();
    const attachments = get().attachments;
    const effectiveText = text || (attachments.length > 0 ? "첨부 파일을 분석해서 코드 작업에 반영해줘" : "");
    if (!effectiveText) return;
    const provider = get().providerByMode[mode];
    const activeProvider = provider !== "auto" ? provider : get().summaryProvider !== "auto" ? get().summaryProvider : "groq";
    const selectedModel = activeProvider !== "auto"
      ? get().selectedModelsByMode[mode][activeProvider as BuildModelProvider] || get().selectedModels[activeProvider as BuildModelProvider]
      : undefined;
    const workerModels = mode === "single" ? undefined : get().workerModelsByMode[mode];
    const meta = get().metaDraft;
    const selectedSkill = get().selectedSkill;
    const attachmentLabel = attachments.length > 0
      ? `\n\n[첨부 ${attachments.length}개] ${attachments.map((item) => item.name).join(", ")}`
      : "";
    const nextMessages: BuildMessage[] = [
      ...get().messages,
      {
        role: "user",
        text: `${text || effectiveText}${attachmentLabel}`,
        meta: selectedSkill ? `skill:${selectedSkill.scope}:${selectedSkill.name}` : "",
        createdUtc: "",
        tokenUsage: null,
        provider: "",
        model: "",
        route: "dashboard-coding",
        source: "dashboard",
        grounded: false,
        citationCount: 0
      }
    ];
    const ok = requestDesktopCoding.run(mode, effectiveText, get().activeConversationId || undefined, {
      provider,
      model: provider !== "auto" ? selectedModel : undefined,
      language: get().languageByMode[mode],
      title: meta.title,
      project: meta.project,
      category: meta.category,
      tags: meta.tags,
      memoryNotes: get().selectedMemoryNotes,
      attachments,
      webUrls: parseWebUrls(effectiveText),
      webSearchEnabled: true,
      thinkPlus: get().thinkPlus,
      skillName: selectedSkill?.name,
      skillScope: selectedSkill?.scope,
      workerModels
    });
    set({
      messages: nextMessages,
      inputByMode: ok ? { ...get().inputByMode, [mode]: "" } : get().inputByMode,
      attachments: ok ? [] : attachments,
      attachmentPanelOpen: ok ? false : get().attachmentPanelOpen,
      pending: ok,
      currentResult: null,
      runtime: null,
      filePreview: null,
      executionMessage: ok ? "" : get().executionMessage,
      autoSpeakCandidate: null,
      lastError: ok ? null : "코딩 실행 요청을 전송하지 못했다."
    });
  },
  executeLatest: () => {
    const conversationId = (get().activeConversationId || get().currentResult?.conversationId || "").trim();
    if (!conversationId) {
      set({ executionMessage: "실행할 코딩 conversationId가 필요하다." });
      return;
    }
    set({ executionMessage: "최신 코딩 결과 실행 요청 중...", runtime: null });
    if (!requestDesktopCoding.executeLatest(conversationId, get().standardInput)) {
      set({ executionMessage: "코딩 결과 실행 요청을 전송하지 못했다." });
    }
  },
  previewFile: (path, targetSegment, runDirectory) => {
    const conversationId = (get().activeConversationId || get().currentResult?.conversationId || "").trim();
    const target = targetSegment || get().selectedResultTarget || "main";
    const url = buildCodingPreviewUrl(conversationId, target, path, runDirectory);
    if (!url) {
      set({ filePreview: { path, url: "", content: "", loading: false, error: "파일 프리뷰 경로를 만들지 못했다." } });
      return;
    }
    set({ filePreview: { path, url, content: "", loading: true, error: "" } });
    void fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (contentType.startsWith("image/")) {
          return `[binary preview]\n${url}`;
        }
        return response.text();
      })
      .then((content) => {
        const current = useBuildStore.getState().filePreview;
        if (!current || current.url !== url) return;
        useBuildStore.setState({ filePreview: { ...current, content: trimNotebookEntry(content, 24000), loading: false } });
      })
      .catch((error) => {
        const current = useBuildStore.getState().filePreview;
        if (!current || current.url !== url) return;
        useBuildStore.setState({
          filePreview: { ...current, loading: false, error: error instanceof Error ? error.message : "파일 프리뷰를 불러오지 못했다." }
        });
      });
  },
  clearFilePreview: () => set({ filePreview: null }),
  clearResult: () => set({
    messages: [],
    conversationContext: emptyAskContext(),
    activeConversationId: null,
    activeConversation: null,
    currentResult: null,
    runtime: null,
    filePreview: null,
    progressByMode: {},
    standardInput: "",
    executionMessage: "",
    autoSpeakCandidate: null
  }),
  restoreRollback: () => {
    const rollbackId = get().rollbackId.trim();
    if (!rollbackId) {
      set({ rollbackStatus: { pending: false, ok: false, message: "rollbackId가 필요하다.", changedPaths: [] } });
      return;
    }
    set({ rollbackStatus: { pending: true, ok: null, message: "rollback 복원 요청 중...", changedPaths: [] } });
    if (!requestDesktopRefactor.restore(rollbackId)) {
      set({ rollbackStatus: { pending: false, ok: false, message: "미들웨어 연결이 필요하다.", changedPaths: [] } });
    }
  }
}));

export function getBuildResultTargets(result: CodingResult | null) {
  return buildResultTargets(result);
}

export function useBuildPageBridge() {
  useEffect(() => {
    return subscribeDesktopMessages((message: DesktopServerMessage) => {
      const store = useBuildStore.getState();

      if (message.type === "conversations") {
        const scope = String(readField(message, "scope", "Scope") || "");
        const mode = normalizeCodingMode(readField(message, "mode", "Mode"));
        if (scope !== "coding" || mode !== store.codingMode) return;
        useBuildStore.setState({
          conversations: Array.isArray(message.items) ? message.items.map(normalizeConversation).filter((item) => item.id && item.scope === "coding") : [],
          loadingConversations: false,
          lastError: null
        });
        return;
      }

      if (message.type === "conversation_detail" && message.conversation && typeof message.conversation === "object") {
        const conversation = message.conversation as Record<string, unknown>;
        const activeConversation = normalizeConversation(conversation);
        if (activeConversation.scope !== "coding") return;
        const messages = normalizeConversationMessages(conversation);
        const latestCodingResult = normalizeCodingResult(readField(conversation, "latestCodingResult", "LatestCodingResult"));
        useBuildStore.setState({
          codingMode: activeConversation.mode,
          activeConversationId: activeConversation.id || store.activeConversationId,
          activeConversation: activeConversation.id ? activeConversation : store.activeConversation,
          metaDraft: activeConversation.id ? buildMetaDraft(activeConversation) : store.metaDraft,
          selectedMemoryNotes: activeConversation.linkedMemoryNotes.length > 0 ? activeConversation.linkedMemoryNotes : store.selectedMemoryNotes,
          messages,
          conversationContext: normalizeConversationContext(conversation),
          currentResult: latestCodingResult,
          selectedResultTarget: "main",
          runtime: null,
          filePreview: null,
          standardInput: store.standardInputByConversation[activeConversation.id || store.activeConversationId || ""] || "",
          autoSpeakCandidate: null,
          pending: false,
          lastError: null
        });
        if (latestCodingResult) {
          const previewPath = resolveDefaultPreviewPath(latestCodingResult);
          if (previewPath) {
            window.setTimeout(() => useBuildStore.getState().previewFile(previewPath, "main", latestCodingResult.execution.runDirectory), 0);
          }
        }
        return;
      }

      if (message.type === "conversation_created" && message.conversation && typeof message.conversation === "object") {
        const conversation = message.conversation as Record<string, unknown>;
        const activeConversation = normalizeConversation(conversation);
        if (activeConversation.scope !== "coding") return;
        const messages = normalizeConversationMessages(conversation);
        const latestCodingResult = normalizeCodingResult(readField(conversation, "latestCodingResult", "LatestCodingResult"));
        useBuildStore.setState({
          codingMode: activeConversation.mode,
          activeConversationId: activeConversation.id || null,
          activeConversation: activeConversation.id ? activeConversation : null,
          metaDraft: buildMetaDraft(activeConversation.id ? activeConversation : null),
          selectedMemoryNotes: activeConversation.linkedMemoryNotes,
          messages,
          conversationContext: normalizeConversationContext(conversation),
          currentResult: latestCodingResult,
          runtime: null,
          filePreview: null,
          standardInput: activeConversation.id ? store.standardInputByConversation[activeConversation.id] || "" : "",
          autoSpeakCandidate: null,
          pending: false,
          lastError: null
        });
        if (latestCodingResult) {
          const previewPath = resolveDefaultPreviewPath(latestCodingResult);
          if (previewPath) {
            window.setTimeout(() => useBuildStore.getState().previewFile(previewPath, "main", latestCodingResult.execution.runDirectory), 0);
          }
        }
        useBuildStore.getState().loadConversations();
        return;
      }

      if (message.type === "conversation_deleted") {
        useBuildStore.getState().loadConversations();
        return;
      }

      if (message.type === "conversation_search_result") {
        const error = readField(message, "error", "Error");
        useBuildStore.setState({
          searching: false,
          searchResults: Array.isArray(message.results)
            ? message.results.map((item) => {
                const payload = record(item);
                return {
                  conversationId: String(readField(payload, "conversationId", "ConversationId", "id", "Id") || ""),
                  title: String(readField(payload, "title", "Title") || "제목 없음"),
                  scope: String(readField(payload, "scope", "Scope") || ""),
                  mode: normalizeCodingMode(readField(payload, "mode", "Mode")),
                  snippet: String(readField(payload, "snippet", "Snippet") || "")
                };
              }).filter((item) => item.conversationId && item.scope === "coding")
            : [],
          lastError: error ? String(error) : null
        });
        return;
      }

      if (message.type === "memory_notes") {
        useBuildStore.setState({
          memoryNotes: Array.isArray(message.items) ? message.items.map(normalizeMemoryNote).filter((item) => item.name) : [],
          loadingMemoryNotes: false
        });
        return;
      }

      if (message.type === "memory_note_content") {
        useBuildStore.setState({
          memoryPreview: {
            name: String(message.name || ""),
            content: String(message.content || "")
          },
          loadingMemoryNotes: false
        });
        return;
      }

      if (message.type === "memory_note_created" || message.type === "memory_note_deleted" || message.type === "memory_note_renamed") {
        useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || message.type), { source: "operations" });
        if (message.type === "memory_note_deleted") {
          const deleted = normalizeStrings((message as { memoryNotes?: unknown }).memoryNotes);
          if (deleted.length > 0) {
            useBuildStore.setState({
              selectedMemoryNotes: useBuildStore.getState().selectedMemoryNotes.filter((name) => !deleted.includes(name))
            });
          }
        }
        useBuildStore.getState().loadMemoryNotes();
        useBuildStore.getState().loadConversations();
        return;
      }

      if (message.type === "groq_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, groq: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { groq: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "copilot_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, copilot: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { copilot: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "cerebras_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, cerebras: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { cerebras: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "gemini_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, gemini: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { gemini: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "nvidia_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, nvidia: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { nvidia: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "codex_models") {
        useBuildStore.setState((prev) => ({
          modelCatalogs: { ...prev.modelCatalogs, codex: normalizeModelIds(message.items) },
          selectedModels: { ...prev.selectedModels, ...(message.selected ? { codex: String(message.selected) } : {}) }
        }));
        return;
      }

      if (message.type === "rag_retrieval_preflight_snapshot") {
        useBuildStore.setState({
          ragPending: false,
          ragPreflight: normalizeRagPreflight((message.payload || {}) as Record<string, unknown>),
          ragExecution: null,
          lastError: null
        });
        return;
      }

      if (message.type === "memory_search_result" && store.ragExecution?.requestType === "memory_search") {
        useBuildStore.setState({ ragExecution: normalizeMemoryRagExecution(store.ragExecution, message) });
        return;
      }

      if (message.type === "memory_get_result" && store.ragMemoryPreview?.loading) {
        const requestedPath = String(readField(message, "requestedPath", "path") || "");
        if (!requestedPath || requestedPath === store.ragMemoryPreview.path) {
          useBuildStore.setState({
            ragMemoryPreview: {
              path: requestedPath || store.ragMemoryPreview.path,
              text: String(readField(message, "text", "Text") || ""),
              error: String(readField(message, "error", "Error") || ""),
              loading: false
            }
          });
          return;
        }
      }

      if (message.type === "web_search_result" && store.ragExecution?.requestType === "web_search") {
        useBuildStore.setState({ ragExecution: normalizeWebRagExecution(store.ragExecution, message) });
        return;
      }

      if (message.type === "code_repomap_snapshot" && store.ragExecution?.requestType === "code_repomap_snapshot_get") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        useBuildStore.setState({ ragExecution: normalizeRepomapRagExecution(store.ragExecution, payload) });
        return;
      }

      if (message.type === "session_replay_snapshot" && store.ragExecution?.requestType === "session_replay_get") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        useBuildStore.setState({ ragExecution: normalizeSessionReplayRagExecution(store.ragExecution, payload) });
        return;
      }

      if (message.type === "session_replay_result" && store.ragExecution?.requestType === "session_replay_get") {
        const payload = (message.payload || {}) as Record<string, unknown>;
        useBuildStore.setState({ ragExecution: normalizeSessionReplayResultExecution(store.ragExecution, payload) });
        return;
      }

      if (message.type === "coding_progress") {
        const scope = String(readField(message, "scope", "Scope") || "");
        if (scope !== "coding") return;
        const progress = normalizeProgress(message);
        useBuildStore.setState((prev) => ({
          progressByMode: { ...prev.progressByMode, [progress.mode]: progress },
          pending: progress.done ? prev.pending : true
        }));
        return;
      }

      if (message.type === "coding_result") {
        const result = normalizeCodingResult(message);
        const conversation = message.conversation && typeof message.conversation === "object"
          ? (message.conversation as Record<string, unknown>)
          : null;
        const activeConversation = conversation ? normalizeConversation(conversation) : null;
        if (activeConversation && activeConversation.scope !== "coding") return;
        const messages = conversation ? normalizeConversationMessages(conversation) : store.messages;
        const activeConversationId = result?.conversationId || activeConversation?.id || store.activeConversationId;
        useBuildStore.setState({
          activeConversationId,
          activeConversation: activeConversation?.id ? activeConversation : store.activeConversation,
          metaDraft: activeConversation?.id ? buildMetaDraft(activeConversation) : store.metaDraft,
          selectedMemoryNotes: activeConversation && activeConversation.linkedMemoryNotes.length > 0 ? activeConversation.linkedMemoryNotes : store.selectedMemoryNotes,
          messages,
          conversationContext: conversation ? normalizeConversationContext(conversation) : store.conversationContext,
          currentResult: result,
          selectedResultTarget: "main",
          runtime: null,
          filePreview: null,
          standardInput: activeConversationId ? store.standardInputByConversation[activeConversationId] || store.standardInput : store.standardInput,
          autoSpeakCandidate: buildAutoSpeakCandidate(activeConversationId, messages),
          pending: false,
          executionMessage: "",
          lastError: null
        });
        if (result) {
          const previewPath = resolveDefaultPreviewPath(result);
          if (previewPath) {
            window.setTimeout(() => useBuildStore.getState().previewFile(previewPath, "main", result.execution.runDirectory), 0);
          }
          if (result.autoMemoryNote?.name) {
            useBuildStore.getState().loadMemoryNotes();
            useUiLogStore.getState().recordLog("info", `자동 컨텍스트 압축 노트 생성: ${result.autoMemoryNote.name}`, { source: "operations" });
          }
        }
        useBuildStore.getState().loadConversations();
        return;
      }

      if (message.type === "coding_execute_result") {
        const runtime = normalizeRuntime(message);
        useBuildStore.setState({
          runtime,
          executionMessage: runtime.message || (runtime.ok ? "실행 완료" : "실행 실패"),
          lastError: runtime.ok ? null : runtime.message || "코딩 결과 실행 실패"
        });
        return;
      }

      if (message.type === "notebook_result" || message.type === "routine_result" || message.type === "plan_result") {
        useUiLogStore.getState().recordLog("info", String((message as { message?: string }).message || `${message.type} 수신`), { source: "operations" });
        return;
      }

      if (message.type === "skill_active_clear_result") {
        const payload = record(message.payload);
        const ok = readField(payload, "ok", "Ok") !== false;
        useBuildStore.setState({ lastError: ok ? null : String(readField(payload, "error", "Error") || "활성 스킬 해제 실패") });
        useUiLogStore.getState().recordLog(ok ? "info" : "warn", ok ? "활성 스킬을 해제했습니다." : "활성 스킬 해제 실패", { source: "operations" });
        return;
      }

      if (message.type === "refactor_result" && message.action === "restore") {
        const payload = record(message.payload);
        const rollbackResult = record(payload.rollbackResult);
        const ok = payload.ok !== false;
        useBuildStore.setState({
          rollbackStatus: {
            pending: false,
            ok,
            message: String(payload.message || (ok ? "rollback 복원 완료." : "rollback 복원 실패.")),
            changedPaths: normalizeStrings(rollbackResult.changedPaths)
          },
          rollbackId: String(rollbackResult.rollbackId || useBuildStore.getState().rollbackId)
        });
        return;
      }

      if (message.type === "error") {
        useBuildStore.setState({
          pending: false,
          ragPending: false,
          searching: false,
          loadingConversations: false,
          loadingMemoryNotes: false,
          lastError: String(message.message || "오류"),
          rollbackStatus: { ...useBuildStore.getState().rollbackStatus, pending: false }
        });
      }
    });
  }, []);
}
