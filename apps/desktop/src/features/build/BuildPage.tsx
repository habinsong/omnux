import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  BrainCircuit,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  Copy,
  Database,
  FileCode2,
  FileText,
  Folder,
  Inbox,
  Info,
  Mic,
  MicOff,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Replace,
  RotateCcw,
  Save,
  ScanText,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { shortcutMatches, useDesktopPreferenceStore, type ModelProviderId } from "../shell/preference-store";
import { MarkdownMessage } from "../ask/MarkdownMessage";
import { useRefactorPageBridge, useRefactorStore } from "../refactor/refactor-store";
import { useSkillPageBridge, useSkillStore } from "../skills/skill-store";
import {
  extractSpeechTranscript,
  getSpeechInputErrorMessage,
  getSpeechRecognitionConstructor,
  isSpeechInputSupported,
  isSpeechSupported,
  useSpeechStore,
  type SpeechRecognitionLike
} from "../ask/ask-speech";
import {
  BUILD_PROVIDER_OPTIONS,
  CODING_LANGUAGE_OPTIONS,
  getBuildResultTargets,
  modelOptionsForBuildProvider,
  type BuildConversationItem,
  type BuildInputAttachment,
  type BuildMessage,
  type BuildModelProvider,
  type BuildProvider,
  type BuildSelectedSkill,
  type CodingResult,
  type CodingExecution,
  type CodingMode,
  type CodingWorker,
  useBuildPageBridge,
  useBuildStore
} from "./build-store";
import { Badge, Button, EmptyState, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";
import { NONE_MODEL, PROVIDER_KEYS, PROVIDER_LABEL } from "../ask/ask-models";
import type { AskTokenUsage } from "../ask/ask-context";
import { ContextPickerPanel } from "../context-picker/ContextPickerPanel";
import { appendContextSelectionBundle } from "../context-picker/context-picker-store";

const MAX_ATTACHMENT_COUNT = 6;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  prefix?: ReactNode;
  disabled?: boolean;
};

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "0B";
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

function hasDraggedFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return (dataTransfer.files && dataTransfer.files.length > 0) || types.includes("Files") || types.includes("application/x-moz-file");
}

function readFileAsAttachment(file: File): Promise<BuildInputAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const marker = "base64,";
      const idx = result.indexOf(marker);
      const dataBase64 = idx >= 0 ? result.slice(idx + marker.length) : "";
      if (!dataBase64) {
        reject(new Error(`첨부 인코딩 실패: ${file.name}`));
        return;
      }
      resolve({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64,
        sizeBytes: file.size || 0,
        isImage: (file.type || "").startsWith("image/")
      });
    };
    reader.onerror = () => reject(new Error(`첨부 읽기 실패: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function filesToAttachments(files: FileList | File[] | null, existingCount: number): Promise<{ items: BuildInputAttachment[]; error: string | null }> {
  const list = Array.from(files || []);
  const items: BuildInputAttachment[] = [];
  for (const file of list) {
    if (existingCount + items.length >= MAX_ATTACHMENT_COUNT) {
      return { items, error: `첨부는 최대 ${MAX_ATTACHMENT_COUNT}개까지 가능합니다.` };
    }
    if ((file.size || 0) > MAX_ATTACHMENT_BYTES) {
      return { items, error: `첨부 파일 크기 제한 초과: ${file.name} (최대 ${formatBytes(MAX_ATTACHMENT_BYTES)})` };
    }
    items.push(await readFileAsAttachment(file));
  }
  return { items, error: null };
}

function formatTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatTokenShort(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(value || 0);
}

function composerRows(value: string) {
  const lineCount = String(value || "").split(/\r\n|\r|\n/).length;
  const softWrapCount = Math.ceil(String(value || "").length / 120);
  return Math.min(8, Math.max(3, lineCount, softWrapCount));
}

function statusTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const normalized = String(value || "").toLowerCase();
  if (/(ok|done|success|passed|complete|ready)/.test(normalized)) return "success";
  if (/(run|pending|progress|preview|browser)/.test(normalized)) return "primary";
  if (/(warn|timeout|blocked)/.test(normalized)) return "warning";
  if (/(error|fail|missing)/.test(normalized)) return "destructive";
  if (!normalized || normalized === "-") return "outline";
  return "default";
}

function progressWidthClass(percent: number) {
  if (percent >= 95) return "w-full";
  if (percent >= 80) return "w-4/5";
  if (percent >= 66) return "w-2/3";
  if (percent >= 50) return "w-1/2";
  if (percent >= 33) return "w-1/3";
  if (percent >= 20) return "w-1/5";
  if (percent > 0) return "w-1/12";
  return "w-0";
}

function defaultConversationFromSearch(
  item: { conversationId: string; title: string; scope: string; mode: CodingMode; snippet: string },
  base?: BuildConversationItem
): BuildConversationItem {
  return {
    id: item.conversationId,
    scope: item.scope || base?.scope || "coding",
    mode: item.mode || base?.mode || "single",
    title: item.title || base?.title || "제목 없음",
    preview: item.snippet || base?.preview || "",
    messageCount: base?.messageCount || 0,
    updatedUtc: base?.updatedUtc || "",
    project: base?.project || "검색 결과",
    category: base?.category || "코딩",
    tags: base?.tags || [],
    linkedMemoryNotes: base?.linkedMemoryNotes || []
  };
}

function groupConversations(items: BuildConversationItem[]) {
  const map = new Map<string, BuildConversationItem[]>();
  for (const item of items) {
    const folder = item.project?.trim() || "기본";
    map.set(folder, [...(map.get(folder) || []), item]);
  }
  return Array.from(map.entries()).map(([folder, folderItems]) => ({ folder, items: folderItems }));
}

function uniqueConversations(items: BuildConversationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function ChoiceMenu({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "선택",
  compact = false,
  searchable = false,
  className,
  triggerClassName
}: {
  label?: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  compact?: boolean;
  searchable?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.value} ${option.description || ""}`.toLowerCase().includes(normalizedQuery)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative min-w-0", compact ? "flex items-center gap-1 text-xs text-muted-foreground" : "space-y-1", className)}>
      {label ? (
        <span className={cn("shrink-0 truncate", compact ? "" : "block text-xs font-semibold text-muted-foreground")}>{label}</span>
      ) : null}
      <button
        type="button"
        className={cn(
          "flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card/70 px-2.5 text-left text-sm text-foreground shadow-sm backdrop-blur-xl transition-all duration-200 ease-out hover:-translate-y-px hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]",
          compact ? "h-8 text-xs" : "w-full",
          triggerClassName
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{selected?.label || placeholder}</span>
          {!compact && selected?.description ? <span className="block truncate text-[11px] text-muted-foreground">{selected.description}</span> : null}
        </span>
        <ChevronDown size={14} className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[80] mt-1 w-full min-w-[240px] max-w-[520px] rounded-lg border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-2xl">
          {searchable ? (
            <div className="relative mb-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="h-8 pl-8 text-xs" value={query} placeholder="검색" autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
            </div>
          ) : null}
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {visibleOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
                    active && "bg-primary/10 text-primary"
                  )}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary">
                    {active ? <Check size={14} aria-hidden="true" /> : option.prefix}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{option.label}</span>
                    {option.description ? <span className="block truncate text-[11px] text-muted-foreground">{option.description}</span> : null}
                  </span>
                </button>
              );
            })}
            {visibleOptions.length === 0 ? <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">일치하는 항목 없음</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function orderedProviders(priority: ModelProviderId[]): BuildModelProvider[] {
  const allowed = new Set<string>(PROVIDER_KEYS);
  const result = priority.filter((provider): provider is BuildModelProvider => allowed.has(provider));
  for (const provider of PROVIDER_KEYS) {
    if (!result.includes(provider)) result.push(provider);
  }
  return result;
}

function providerOptions(includeAuto: boolean, priority: ModelProviderId[]): ChoiceOption[] {
  const labels = new Map(BUILD_PROVIDER_OPTIONS.map((option) => [option.value, option.label]));
  const options = orderedProviders(priority).map((provider) => ({
    value: provider,
    label: labels.get(provider) || PROVIDER_LABEL[provider]
  }));
  return includeAuto ? [{ value: "auto", label: labels.get("auto") || "자동" }, ...options] : options;
}

function modelDescription(provider: BuildModelProvider, model: string) {
  if (model === NONE_MODEL) return "워커 제외";
  if (/preview/i.test(model)) return "preview";
  if (/mini|lite|flash/i.test(model)) return "빠른 응답";
  return PROVIDER_LABEL[provider];
}

function modelChoiceOptions(provider: BuildModelProvider, value: string, worker: boolean, allowNone: boolean): ChoiceOption[] {
  const store = useBuildStore.getState();
  const options: ChoiceOption[] = [
    { value: "", label: worker ? "기본값" : "기본 모델", description: `${PROVIDER_LABEL[provider]} 기본 라우팅` }
  ];
  if (allowNone) {
    options.push({ value: NONE_MODEL, label: "선택 안 함", description: `${PROVIDER_LABEL[provider]} 워커 비활성화` });
  }
  for (const model of modelOptionsForBuildProvider(provider, store.modelCatalogs)) {
    options.push({ value: model, label: model, description: modelDescription(provider, model) });
  }
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: value, description: "현재 선택값" });
  }
  return options;
}

function ModelSelect({
  provider,
  label,
  compact = false,
  worker = false,
  allowNone = false
}: {
  provider: BuildModelProvider;
  label?: string;
  compact?: boolean;
  worker?: boolean;
  allowNone?: boolean;
}) {
  const store = useBuildStore();
  const mode = store.codingMode;
  const value = worker && mode !== "single"
    ? store.workerModelsByMode[mode][provider] || ""
    : store.selectedModelsByMode[mode][provider] || store.selectedModels[provider] || "";
  const options = modelChoiceOptions(provider, value, worker, allowNone);
  return (
    <ChoiceMenu
      label={label || PROVIDER_LABEL[provider]}
      value={value}
      options={options}
      compact={compact}
      searchable={options.length > 8}
      placeholder={worker ? "기본값" : "기본 모델"}
      ariaLabel={`${PROVIDER_LABEL[provider]} 모델 선택`}
      triggerClassName={compact ? "w-44 max-w-[220px] sm:w-56" : "w-full"}
      onChange={(next) => {
        if (worker) store.setWorkerModel(provider, next);
        else store.setSelectedModel(provider, next);
      }}
    />
  );
}

function ProviderSelect({
  label,
  value,
  includeAuto,
  onChange,
  ariaLabel
}: {
  label: string;
  value: BuildProvider;
  includeAuto: boolean;
  onChange: (value: BuildProvider) => void;
  ariaLabel: string;
}) {
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  return (
    <ChoiceMenu
      label={label}
      value={value}
      options={providerOptions(includeAuto, priority)}
      compact
      ariaLabel={ariaLabel}
      triggerClassName="w-36 max-w-[180px] sm:w-44"
      onChange={(next) => onChange(next as BuildProvider)}
    />
  );
}

function LanguageSelect() {
  const store = useBuildStore();
  return (
    <ChoiceMenu
      label="언어"
      value={store.languageByMode[store.codingMode]}
      options={CODING_LANGUAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      compact
      searchable
      ariaLabel="코딩 언어 선택"
      triggerClassName="w-36 max-w-[180px] sm:w-44"
      onChange={store.setLanguage}
    />
  );
}

function skillScopeLabel(scope: string) {
  return scope === "global" ? "전역" : "프로젝트";
}

function skillKey(skill: Pick<BuildSelectedSkill, "name" | "scope">) {
  return `${skill.scope}:${skill.name}`;
}

function SkillSelectCompact({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  const skillStore = useSkillStore();
  const selectedKey = store.selectedSkill ? skillKey(store.selectedSkill) : "";
  const options = useMemo<ChoiceOption[]>(() => [
    { value: "", label: "스킬 없음", description: "기본 코딩 프롬프트", disabled: !canRequest },
    ...skillStore.skills.map((skill) => ({
      value: `${skill.scope}:${skill.name}`,
      label: skill.name,
      description: `${skillScopeLabel(skill.scope)} · ${skill.description || "설명 없음"}`,
      prefix: <Sparkles size={13} aria-hidden="true" />,
      disabled: !canRequest
    }))
  ], [canRequest, skillStore.skills]);

  return (
    <ChoiceMenu
      label="스킬"
      value={selectedKey}
      options={options}
      compact
      searchable={options.length > 7}
      ariaLabel="코딩 스킬 선택"
      triggerClassName="w-36 max-w-[180px] sm:w-44"
      onChange={(next) => {
        if (!next) {
          store.clearSelectedSkill();
          return;
        }
        const item = skillStore.skills.find((skill) => `${skill.scope}:${skill.name}` === next);
        if (item) {
          store.selectSkill({ name: item.name, scope: item.scope, description: item.description });
        }
      }}
    />
  );
}

function CodingModeSegmentedControl() {
  const store = useBuildStore();
  const modes: Array<{ value: CodingMode; label: string; title: string }> = [
    { value: "single", label: "Single", title: "단일 코딩" },
    { value: "orchestration", label: "Orch", title: "오케스트레이션 코딩" },
    { value: "multi", label: "Multi", title: "다중 코딩" }
  ];
  return (
    <div className="flex shrink-0 rounded-md border border-border bg-card/60 p-0.5 shadow-sm" role="radiogroup" aria-label="코딩 모드">
      {modes.map((mode) => {
        const active = store.codingMode === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            className={cn(
              "h-7 shrink-0 rounded px-2.5 text-xs font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            role="radio"
            aria-checked={active}
            title={mode.title}
            onClick={() => store.setCodingMode(mode.value)}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function CodingModeHint({ mode }: { mode: CodingMode }) {
  if (mode === "single") return null;
  const config = mode === "orchestration"
    ? {
        badge: "Orchestration",
        title: "기획 · 구현 · 검증 · 수정 역할 분담",
        detail: "주 구현 모델과 워커 모델을 함께 사용합니다."
      }
    : {
        badge: "Multi",
        title: "모델별 독립 구현 후 결과 비교",
        detail: "비교 요약 모델과 워커 모델을 분리해 선택합니다."
      };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/25 px-3 py-2">
      <Info size={14} className="shrink-0 text-primary" aria-hidden="true" />
      <Badge tone="outline" className="shrink-0">{config.badge}</Badge>
      <span className="min-w-0 truncate text-xs font-semibold text-muted-foreground">{config.title}</span>
      <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground 2xl:inline">{config.detail}</span>
    </div>
  );
}

function WorkerModelStrip() {
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  const providers = orderedProviders(priority);
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-2">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Sparkles size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">워커/비교 모델</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {providers.map((provider) => (
          <ModelSelect key={provider} provider={provider} worker allowNone />
        ))}
      </div>
    </div>
  );
}

function TokenUsageBadge({ usage }: { usage?: AskTokenUsage | null }) {
  if (!usage) return null;
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-1">
      <Badge tone="outline">{formatTokenShort(usage.totalTokens)} tok</Badge>
      {usage.source ? <Badge tone="outline">{usage.source}</Badge> : null}
    </div>
  );
}

function MessageMetaStrip({
  role,
  meta,
  provider,
  model,
  route,
  source,
  grounded,
  citationCount,
  inverse = false
}: {
  role: string;
  meta?: string;
  provider?: string;
  model?: string;
  route?: string;
  source?: "dashboard" | "telegram" | "system";
  grounded?: boolean;
  citationCount?: number;
  inverse?: boolean;
}) {
  const safeMeta = (meta || "").trim();
  const safeProvider = (provider || "").trim();
  const safeModel = (model || "").trim();
  const safeRoute = (route || "").trim();
  const sourceLabel = source === "telegram" ? "텔레그램" : source === "system" || role === "system" ? "시스템" : "대시보드";
  const badges = [
    { key: "source", label: sourceLabel },
    safeProvider ? { key: "provider", label: safeProvider } : null,
    safeModel ? { key: "model", label: safeModel } : null,
    safeRoute && safeRoute !== safeProvider && safeRoute !== safeModel ? { key: "route", label: safeRoute } : null,
    grounded ? { key: "web", label: citationCount && citationCount > 0 ? `Web ${citationCount}` : "Web" } : null,
    safeMeta && safeMeta.toLowerCase() !== `${safeProvider}:${safeModel}`.toLowerCase() ? { key: "meta", label: safeMeta } : null
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  const badgeClass = inverse
    ? "border-white/20 bg-white/15 text-primary-foreground/85"
    : "border-border bg-muted/50 text-muted-foreground";
  return (
    <div className="mb-1.5 flex max-w-full flex-wrap items-center gap-1">
      {badges.slice(0, 6).map((badge) => (
        <span key={`${badge.key}-${badge.label}`} className={cn("inline-flex h-5 max-w-full shrink-0 items-center rounded border px-1.5 text-[10px] font-medium leading-none", badgeClass)}>
          <span className="max-w-[160px] truncate">{badge.label}</span>
        </span>
      ))}
    </div>
  );
}

function MessageActions({ messageKey, messageIndex, text, meta = "", canRequest }: { messageKey: string; messageIndex: number; text: string; meta?: string; canRequest: boolean }) {
  const speakingKey = useSpeechStore((state) => state.speakingKey);
  const toggleSpeak = useSpeechStore((state) => state.toggle);
  const saveMessageToNotebook = useBuildStore((state) => state.saveMessageToNotebook);
  const createPlanFromMessage = useBuildStore((state) => state.createPlanFromMessage);
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  const speaking = speakingKey === messageKey;
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 클립보드 접근 불가 시 무시 */
    }
  };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-muted-foreground">
      <button
        type="button"
        onClick={() => saveMessageToNotebook(messageIndex, text, meta)}
        disabled={!canRequest}
        className="inline-flex h-6 shrink-0 items-center rounded-md border border-border bg-card/70 px-2 text-[11px] font-semibold transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="노트북에 저장"
        title="노트북에 저장"
      >
        NB
      </button>
      <button
        type="button"
        onClick={() => createPlanFromMessage(messageIndex, text, meta)}
        disabled={!canRequest}
        className="inline-flex h-6 shrink-0 items-center rounded-md border border-border bg-card/70 px-2 text-[11px] font-semibold transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="작업계획 만들기"
        title="이 답변으로 작업계획 만들기"
      >
        PL
      </button>
      {isSpeechSupported() ? (
        <button type="button" onClick={() => toggleSpeak(messageKey, text)} className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card/70 px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground", speaking && "border-primary/40 bg-primary/10 text-primary")} title={speaking ? "읽기 중지" : "읽어주기"} aria-pressed={speaking}>
          {speaking ? <VolumeX size={12} aria-hidden="true" /> : <Volume2 size={12} aria-hidden="true" />} {speaking ? "중지" : "읽기"}
        </button>
      ) : null}
      <button type="button" onClick={copy} className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground" title="복사">
        <Copy size={12} aria-hidden="true" /> {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

function MessageBubble({ message, index, canRequest }: { message: BuildMessage; index: number; canRequest: boolean }) {
  const key = `${message.createdUtc || index}-${message.role}`;
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          <MessageMetaStrip role={message.role} meta={message.meta} provider={message.provider} model={message.model} route={message.route || "dashboard-coding"} source={message.source} grounded={message.grounded} citationCount={message.citationCount} inverse />
          {message.text}
        </div>
      </div>
    );
  }
  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[92%] rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <MessageMetaStrip role={message.role} meta={message.meta || "system"} provider={message.provider} model={message.model} route={message.route} source={message.source || "system"} grounded={message.grounded} citationCount={message.citationCount} />
          <MarkdownMessage text={message.text} />
          <TokenUsageBadge usage={message.tokenUsage} />
          <MessageActions messageKey={key} messageIndex={index} text={message.text} meta={message.meta} canRequest={canRequest} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start gap-2">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-[10px] font-bold text-primary">
        DEV
      </div>
      <div className="prose-omnux max-w-[86%] rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2">
        <MessageMetaStrip role={message.role} meta={message.meta} provider={message.provider} model={message.model} route={message.route} source={message.source} grounded={message.grounded} citationCount={message.citationCount} />
        <MarkdownMessage text={message.text} />
        <TokenUsageBadge usage={message.tokenUsage} />
        <MessageActions messageKey={key} messageIndex={index} text={message.text} meta={message.meta} canRequest={canRequest} />
      </div>
    </div>
  );
}

function useBuildVoiceInput() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseDraftRef = useRef("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const setCodingInput = useBuildStore((state) => state.setCodingInput);

  const stop = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setActive(false);
      return;
    }
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
      setActive(false);
    }
  };

  const toggle = (currentInput: string) => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setError("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }
    if (recognitionRef.current) {
      stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    baseDraftRef.current = currentInput;
    setActive(true);
    setError("");
    recognition.onresult = (event) => {
      const transcript = extractSpeechTranscript(event);
      const base = baseDraftRef.current.trim();
      setCodingInput([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
    };
    recognition.onerror = (event) => {
      setError(getSpeechInputErrorMessage(event.error || ""));
      setActive(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setActive(false);
    };
    try {
      recognition.start();
    } catch (errorValue) {
      recognitionRef.current = null;
      setActive(false);
      setError(getSpeechInputErrorMessage(errorValue instanceof Error ? errorValue.name : ""));
    }
  };

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort();
    } catch {
      /* noop */
    }
  }, []);

  return { active, error, supported: isSpeechInputSupported(), toggle, stop };
}

function ConversationList({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const displayedConversations = store.searchQuery
    ? uniqueConversations(store.searchResults
        .map((item) => defaultConversationFromSearch(item, store.conversations.find((conversation) => conversation.id === item.conversationId)))
        .filter((item) => item.id && item.scope === "coding"))
    : store.conversations;
  const groups = groupConversations(displayedConversations);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "newConversation") {
        if (canRequest) useBuildStore.getState().createConversation();
      } else if (action === "searchConversations") {
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("omnux:shortcut", handleShortcut);
    return () => window.removeEventListener("omnux:shortcut", handleShortcut);
  }, [canRequest]);

  return (
    <>
      {store.lastError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" className="flex-1" onClick={store.createConversation} disabled={!canRequest}>
          <Plus size={15} aria-hidden="true" /> 새 작업
        </Button>
        <Button variant="outline" size="icon" aria-label="새로고침" onClick={store.loadConversations} disabled={!canRequest}>
          <RefreshCw size={15} aria-hidden="true" />
        </Button>
      </div>

      <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
          <div className="relative min-w-0">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              className="pl-8"
              value={store.searchInput}
              placeholder="코딩 작업 검색"
              onChange={(event) => store.setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (canRequest) store.searchConversations(store.searchInput);
                }
              }}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="코딩 작업 검색"
            title="코딩 작업 검색"
            onClick={() => store.searchConversations(store.searchInput)}
            disabled={!canRequest || store.searching || !store.searchInput.trim()}
          >
            {store.searching ? <Spinner size={14} /> : <Search size={15} aria-hidden="true" />}
          </Button>
        </div>
        <div className="flex min-h-5 items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate">
            {store.searching
              ? "검색 중..."
              : store.searchQuery
                ? `"${store.searchQuery}" 결과 ${store.searchResults.length}건`
                : "제목과 코딩 대화 본문을 검색합니다."}
          </span>
          {store.searchQuery ? (
            <button type="button" onClick={store.clearSearch} className="shrink-0 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground">
              해제
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {groups.map((group) => {
          const expanded = store.folderOpenByName[group.folder] !== false;
          return (
            <div key={group.folder} className="rounded-md border border-border bg-muted/20">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-200 hover:bg-accent/60"
                onClick={() => store.toggleFolder(group.folder)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                <Folder size={14} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.folder}</span>
                <Badge tone="outline">{group.items.length}</Badge>
              </button>
              {expanded ? (
                <div className="space-y-1 border-t border-border p-1.5">
                  {group.items.map((item) => {
                    const active = item.id === store.activeConversationId;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group rounded-md border px-2 py-2 transition-colors duration-200",
                          active ? "border-primary/40 bg-accent" : "border-transparent hover:bg-accent/60"
                        )}
                      >
                        <button type="button" className="flex w-full flex-col text-left" onClick={() => store.openConversation(item)} disabled={!canRequest}>
                          <span className="truncate text-sm font-medium">{item.title}</span>
                          <span className="truncate text-[11px] text-muted-foreground">{item.preview || `${item.messageCount}개 메시지`}</span>
                          <span className="truncate text-[10px] text-muted-foreground">{formatTime(item.updatedUtc) || item.mode}</span>
                        </button>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                          <Badge tone="outline" className="max-w-[100px] truncate">{item.mode}</Badge>
                          <Badge tone="outline" className="max-w-[110px] truncate">{item.category || "코딩"}</Badge>
                          {item.tags.slice(0, 1).map((tag) => <Badge key={tag} tone="outline" className="max-w-[90px] truncate">{tag}</Badge>)}
                        </div>
                        <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="정보" onClick={() => { store.openConversation(item); store.setSidePanel("info"); }} disabled={!canRequest}>
                            <Info size={13} aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="이름 변경" onClick={() => store.renameConversation(item)} disabled={!canRequest}>
                            <Tag size={13} aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="메모리" onClick={() => { store.openConversation(item); store.setSidePanel("memory"); }} disabled={!canRequest}>
                            <Database size={13} aria-hidden="true" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="메모리 노트 생성" onClick={() => store.saveConversationToMemory(item)} disabled={!canRequest}>
                            <BrainCircuit size={13} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => store.deleteConversation(item)}
                            disabled={!canRequest}
                            aria-label="삭제"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        {displayedConversations.length === 0 && !store.searching ? (
          <EmptyState
            icon={Inbox}
            title={store.searchQuery ? "검색 결과 없음" : "코딩 작업 없음"}
            description={store.searchQuery ? "다른 검색어로 다시 찾아보세요." : canRequest ? "새 코딩 작업을 시작하세요." : "미들웨어에 연결되면 작업이 표시됩니다."}
            action={store.searchQuery ? (
              <Button variant="outline" size="sm" onClick={store.clearSearch}>
                <X size={14} aria-hidden="true" /> 검색 해제
              </Button>
            ) : canRequest ? (
              <Button variant="primary" size="sm" onClick={store.createConversation}>
                <Plus size={14} aria-hidden="true" /> 새 작업
              </Button>
            ) : null}
          />
        ) : null}
      </div>

      <div className="border-t border-border pt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>공유 메모리</span>
          <span>{store.loadingMemoryNotes ? "조회 중" : `${store.memoryNotes.length}건`}</span>
        </div>
        <div className="mt-1.5 space-y-1">
          {store.memoryNotes.slice(0, 3).map((note) => (
            <button key={note.name} type="button" className="w-full rounded-md bg-muted/40 px-2 py-1.5 text-left transition-colors hover:bg-accent" onClick={() => { store.readMemoryNote(note.name); store.setSidePanel("memory"); }}>
              <p className="truncate text-xs font-medium">{note.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{note.excerpt || "메모리 노트"}</p>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function ConversationMetaPanel({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Info size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">작업 정보</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => store.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2">
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">대화방 이름</span>
          <Input value={store.metaDraft.title} placeholder="코딩 작업 제목" onChange={(event) => store.patchMetaDraft({ title: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">폴더명</span>
          <Input value={store.metaDraft.project} placeholder="기본" onChange={(event) => store.patchMetaDraft({ project: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">카테고리</span>
          <Input value={store.metaDraft.category} placeholder="코딩" onChange={(event) => store.patchMetaDraft({ category: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">태그명</span>
          <Input value={store.metaDraft.tags} placeholder="쉼표로 구분" onChange={(event) => store.patchMetaDraft({ tags: event.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          <Badge tone="outline" className="max-w-[160px] truncate"><Folder size={11} aria-hidden="true" /> {store.metaDraft.project || "기본"}</Badge>
          <Badge tone="outline" className="max-w-[160px] truncate"><Tag size={11} aria-hidden="true" /> {store.metaDraft.category || "코딩"}</Badge>
        </div>
        <Button variant="primary" size="sm" onClick={store.saveConversationMeta} disabled={!canRequest || !store.activeConversationId}>
          <Save size={14} aria-hidden="true" /> 메타 저장
        </Button>
      </div>
    </div>
  );
}

function MemoryDock({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Database size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">공유 메모리</span>
          <Badge tone="outline">{store.memoryNotes.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => store.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => store.createActiveConversationMemoryNote(false)} disabled={!canRequest || !store.activeConversationId}>
          <Plus size={14} aria-hidden="true" /> 수동 생성
        </Button>
        <Button variant="outline" size="sm" onClick={() => store.createActiveConversationMemoryNote(true)} disabled={!canRequest || !store.activeConversationId}>
          <BrainCircuit size={14} aria-hidden="true" /> 압축 생성
        </Button>
        <Button variant="outline" size="sm" onClick={store.loadMemoryNotes} disabled={!canRequest || store.loadingMemoryNotes}>
          <RefreshCw size={14} aria-hidden="true" /> 새로고침
        </Button>
        <Button variant="destructive" size="sm" onClick={store.deleteSelectedMemoryNotes} disabled={!canRequest || store.selectedMemoryNotes.length === 0}>
          <Trash2 size={14} aria-hidden="true" /> 삭제
        </Button>
      </div>
      <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
        {store.memoryNotes.map((note) => {
          const checked = store.selectedMemoryNotes.includes(note.name);
          return (
            <div key={note.name} className={cn("flex items-start gap-2 rounded-md border px-2 py-2", checked ? "border-primary/40 bg-primary/10" : "border-border bg-card/60")}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
                checked={checked}
                onChange={() => store.toggleMemoryNote(note.name)}
                aria-label={`${note.name} 선택`}
              />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => store.readMemoryNote(note.name)}>
                <span className="block truncate text-xs font-medium">{note.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{note.excerpt || note.fullPath || "메모리 노트"}</span>
              </button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="메모리 이름 변경" onClick={() => store.renameMemoryNote(note.name)}>
                <Tag size={13} aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        {store.memoryNotes.length === 0 ? (
          <EmptyState icon={Database} title="메모리 없음" description="코딩 작업에서 수동 생성하면 공유 메모리 노트가 표시됩니다." className="py-6" />
        ) : null}
      </div>
      <div className="min-h-[120px] rounded-md border border-border bg-background/50 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <FileText size={13} aria-hidden="true" /> 미리보기
        </div>
        <pre className="max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
          {store.memoryPreview?.content || "메모리 노트를 누르면 내용이 표시됩니다."}
        </pre>
      </div>
    </div>
  );
}

function ModelDock() {
  const store = useBuildStore();
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  const providers = orderedProviders(priority);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">모델 선택</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={store.loadModelCatalogs}>
            <RefreshCw size={14} aria-hidden="true" /> 카탈로그
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => store.setSidePanel(null)}>
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Sparkles size={13} aria-hidden="true" /> 응답 모델
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {providers.map((provider) => (
            <ModelSelect key={provider} provider={provider} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <BrainCircuit size={13} aria-hidden="true" /> 워커/비교 모델
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {providers.map((provider) => (
            <ModelSelect key={provider} provider={provider} worker allowNone />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkillDock({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  const skillStore = useSkillStore();
  const query = store.skillSearch.trim().toLowerCase();
  const selectedKey = store.selectedSkill ? skillKey(store.selectedSkill) : "";
  const filteredSkills = useMemo(() => {
    if (!query) return skillStore.skills;
    return skillStore.skills.filter((skill) =>
      `${skill.name} ${skill.scope} ${skill.description}`.toLowerCase().includes(query)
    );
  }, [query, skillStore.skills]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">스킬 선택</span>
          <Badge tone="outline">{skillStore.skills.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => store.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>

      {store.selectedSkill ? (
        <div className="rounded-lg border border-primary/25 bg-primary/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-primary">{store.selectedSkill.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{skillScopeLabel(store.selectedSkill.scope)} · 현재 코딩 요청에 적용</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="선택 스킬 해제" onClick={store.clearSelectedSkill}>
              <X size={13} aria-hidden="true" />
            </Button>
          </div>
          {store.selectedSkill.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{store.selectedSkill.description}</p> : null}
        </div>
      ) : null}

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="relative min-w-0">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-8"
            value={store.skillSearch}
            placeholder="스킬 검색"
            onChange={(event) => store.setSkillSearch(event.target.value)}
          />
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9" aria-label="스킬 새로고침" onClick={skillStore.load} disabled={!canRequest || skillStore.loading}>
          {skillStore.loading ? <Spinner size={14} /> : <RefreshCw size={15} aria-hidden="true" />}
        </Button>
      </div>

      <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
        {filteredSkills.map((skill) => {
          const key = `${skill.scope}:${skill.name}`;
          const active = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              className={cn(
                "flex w-full min-w-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active ? "border-primary/45 bg-primary/10" : "border-border bg-card/60"
              )}
              disabled={!canRequest}
              onClick={() => store.selectSkill({ name: skill.name, scope: skill.scope, description: skill.description })}
            >
              <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border", active ? "border-primary/40 bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground")}>
                {active ? <Check size={13} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">{skill.name}</span>
                  <Badge tone="outline" className="shrink-0">{skillScopeLabel(skill.scope)}</Badge>
                </span>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{skill.description || "설명 없음"}</span>
              </span>
            </button>
          );
        })}
        {filteredSkills.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={skillStore.loading ? "스킬 조회 중" : "스킬 없음"}
            description={query ? "다른 검색어로 다시 찾아보세요." : "스킬 탭에서 등록된 항목이 여기에 표시됩니다."}
            className="py-8"
            action={canRequest ? (
              <Button variant="outline" size="sm" onClick={skillStore.load}>
                <RefreshCw size={14} aria-hidden="true" /> 새로고침
              </Button>
            ) : null}
          />
        ) : null}
      </div>
    </div>
  );
}

function SafeRefactorDock({ canRequest }: { canRequest: boolean }) {
  const buildStore = useBuildStore();
  const store = useRefactorStore();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Replace size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">Safe Refactor</span>
          {store.previewId ? <Badge tone="primary" className="max-w-[120px] truncate font-mono">{store.previewId}</Badge> : null}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => buildStore.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <div className="rounded-lg border border-border bg-muted/25 p-3">
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">대상 파일</span>
          <div className="flex gap-2">
            <Input className="font-mono text-xs" value={store.path} placeholder="workspace 기준 상대 경로 또는 절대 경로" onChange={(event) => store.setField("path", event.target.value)} />
            <Button variant="outline" size="sm" onClick={store.read} disabled={!canRequest || store.pending || !store.path.trim()}>
              <FileCode2 size={14} aria-hidden="true" /> 읽기
            </Button>
          </div>
        </label>
        {store.loadedPath ? <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">loaded: {store.loadedPath}</p> : null}
        {store.content ? (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 font-mono text-[11px]">
            {store.content}
          </pre>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="rounded-lg border border-border bg-muted/25 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
              <ScanText size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">Anchor 교체</span>
            </div>
            {store.anchorLines.length > 0 ? <Badge tone="outline">{store.anchorLines.length} lines</Badge> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">시작 줄</span>
              <Input className="font-mono text-xs" type="number" min="1" value={store.anchorStartLine} placeholder="start" onChange={(event) => store.setField("anchorStartLine", event.target.value)} />
            </label>
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">끝 줄</span>
              <Input className="font-mono text-xs" type="number" min="1" value={store.anchorEndLine} placeholder="end" onChange={(event) => store.setField("anchorEndLine", event.target.value)} />
            </label>
          </div>
          <label className="mt-2 block min-w-0 space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">교체 코드</span>
            <Textarea rows={4} className="font-mono text-xs" value={store.anchorReplacement} placeholder="선택 범위를 대체할 코드" onChange={(event) => store.setField("anchorReplacement", event.target.value)} />
          </label>
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={store.anchorPreview} disabled={!canRequest || store.pending || !store.path.trim() || !store.anchorStartLine.trim() || !store.anchorEndLine.trim() || !store.anchorReplacement.trim() || store.anchorLines.length === 0}>
              <ScanText size={14} aria-hidden="true" /> 미리보기
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <ScanText size={13} aria-hidden="true" /> AST 치환
          </div>
          <label className="block min-w-0 space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">패턴</span>
            <Input className="font-mono text-xs" value={store.pattern} placeholder="ast-grep 패턴" onChange={(event) => store.setField("pattern", event.target.value)} />
          </label>
          <label className="mt-2 block min-w-0 space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">치환</span>
            <Textarea rows={3} className="font-mono text-xs" value={store.replacement} placeholder="치환 코드" onChange={(event) => store.setField("replacement", event.target.value)} />
          </label>
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={store.astReplace} disabled={!canRequest || store.pending || !store.path.trim() || !store.pattern.trim()}>
              <ScanText size={14} aria-hidden="true" /> 미리보기
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/25 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Type size={13} aria-hidden="true" /> LSP 이름 변경
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">심볼</span>
              <Input className="font-mono text-xs" value={store.symbol} placeholder="기존 심볼 이름" onChange={(event) => store.setField("symbol", event.target.value)} />
            </label>
            <label className="block min-w-0 space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">새 이름</span>
              <Input className="font-mono text-xs" value={store.newName} placeholder="새 심볼 이름" onChange={(event) => store.setField("newName", event.target.value)} />
            </label>
          </div>
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="sm" onClick={store.lspRename} disabled={!canRequest || store.pending || !store.path.trim() || !store.symbol.trim() || !store.newName.trim()}>
              <ScanText size={14} aria-hidden="true" /> 미리보기
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/25 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold text-muted-foreground">미리보기 & 적용</span>
            {store.applied ? <Badge tone="success"><Check size={11} aria-hidden="true" /> 적용됨</Badge> : null}
          </div>
          <Button variant="destructive" size="sm" onClick={store.apply} disabled={!canRequest || store.pending || !store.previewId.trim()}>
            {store.pending ? <Spinner size={14} /> : <Check size={14} aria-hidden="true" />}
            적용
          </Button>
        </div>
        {store.issues.length > 0 ? (
          <div className="mb-2 space-y-1 rounded-md border border-warning/30 bg-warning/10 p-2">
            {store.issues.map((issue, index) => (
              <div key={index} className="flex items-start gap-1.5 text-xs text-warning">
                <Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {issue}
              </div>
            ))}
          </div>
        ) : null}
        {store.previewDiff ? (
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 font-mono text-[11px]">
            {store.previewDiff}
          </pre>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">미리보기를 생성하면 diff와 previewId가 표시됩니다.</p>
        )}
      </div>
    </div>
  );
}

function executionText(execution: CodingExecution | null) {
  if (!execution) return "";
  return [execution.stdout, execution.stderr].filter(Boolean).join("\n");
}

function normalizeExecutionOutput(value: string) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function humanPath(pathValue: string, runDirectory = "") {
  const value = String(pathValue || "").replace(/\\/g, "/").trim();
  const root = String(runDirectory || "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (!value) return "-";
  if (root && value.toLowerCase().startsWith(root.toLowerCase())) {
    return value.slice(root.length).replace(/^\/+/, "") || value;
  }
  return value;
}

function ExecutionDetailsPanel({
  title,
  execution,
  runDirectory = "",
  showOutputs = false,
  emptyMessage = "이번 실행에서는 stdout/stderr가 비어 있습니다."
}: {
  title: string;
  execution: CodingExecution | null;
  runDirectory?: string;
  showOutputs?: boolean;
  emptyMessage?: string;
}) {
  if (!execution) return null;
  const stdout = normalizeExecutionOutput(execution.stdout);
  const stderr = normalizeExecutionOutput(execution.stderr);
  const runtimeDir = String(execution.runDirectory || runDirectory || "").trim();
  const entryFile = String(execution.entryFile || "").trim();
  const detailItems = [
    { key: "status", label: "상태", value: `${execution.status || "-"} · exit=${execution.exitCode ?? "-"}` },
    { key: "language", label: "언어", value: execution.language || "-" },
    { key: "command", label: "명령", value: execution.command || "(none)", wide: true, mono: true },
    runtimeDir ? { key: "run-directory", label: "작업 폴더", value: runtimeDir, wide: true, mono: true } : null,
    entryFile ? { key: "entry-file", label: "엔트리 파일", value: humanPath(entryFile, runtimeDir || runDirectory), mono: true } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; wide?: boolean; mono?: boolean }>;
  if (detailItems.length === 0 && !showOutputs) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      {title ? (
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Terminal size={13} aria-hidden="true" /> <span className="truncate">{title}</span>
        </div>
      ) : null}
      {detailItems.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {detailItems.map((item) => (
            <div key={item.key} className={cn("min-w-0 rounded-md border border-border bg-card/60 p-2", item.wide && "sm:col-span-2")}>
              <p className="truncate text-[11px] font-semibold text-muted-foreground">{item.label}</p>
              <p className={cn("mt-1 truncate text-xs", item.mono && "font-mono")}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {showOutputs ? (
        <div className="mt-2 space-y-2">
          {stdout ? (
            <div className="rounded-md border border-border bg-background/60">
              <div className="border-b border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">stdout</div>
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]">{stdout}</pre>
            </div>
          ) : null}
          {stderr ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10">
              <div className="border-b border-destructive/20 px-2 py-1 text-[11px] font-semibold text-destructive">stderr</div>
              <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px] text-destructive">{stderr}</pre>
            </div>
          ) : null}
          {!stdout && !stderr ? <p className="rounded-md border border-border bg-card/60 px-2 py-3 text-center text-xs text-muted-foreground">{emptyMessage}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function shouldAutoShowExecutionLogs(execution: CodingExecution | null) {
  if (!execution) return false;
  return /(error|fail|timeout|cancel|killed|aborted)/i.test(execution.status) || !!execution.stdout.trim() || !!execution.stderr.trim();
}

function hasMeaningfulToken(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 && normalized !== "-";
}

function displayToken(value: string | null | undefined) {
  return hasMeaningfulToken(value) ? String(value).trim() : "-";
}

function MultiSummaryPanel({ result }: { result: CodingResult }) {
  const sections = [
    { key: "summary", title: "공통 정리", body: result.commonSummary },
    { key: "points", title: "공통점", body: result.commonPoints },
    { key: "differences", title: "차이", body: result.differences },
    { key: "recommendation", title: "추천", body: result.recommendation }
  ].filter((section) => section.body.trim());
  if (sections.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <ClipboardList size={13} aria-hidden="true" /> 다중 결과 비교
      </div>
      <div className="grid gap-2">
        {sections.map((section) => (
          <div key={section.key} className="rounded-md border border-border bg-card/60 p-2">
            <p className="mb-1 truncate text-xs font-semibold">{section.title}</p>
            <div className="prose-omnux text-xs">
              <MarkdownMessage text={section.body} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultSafetyMetaPanel({ result }: { result: CodingResult }) {
  const hasGuard = hasMeaningfulToken(result.guardCategory) || hasMeaningfulToken(result.guardReason) || hasMeaningfulToken(result.guardDetail);
  const hasRetry =
    result.retryRequired ||
    hasMeaningfulToken(result.retryAction) ||
    hasMeaningfulToken(result.retryScope) ||
    hasMeaningfulToken(result.retryReason) ||
    hasMeaningfulToken(result.retryStopReason) ||
    result.retryAttempt > 0 ||
    result.retryMaxAttempts > 0;
  const hasCitation =
    result.citationCount > 0 ||
    result.citationMappingCount > 0 ||
    result.citationValidationPassed !== null ||
    hasMeaningfulToken(result.citationValidationReason);
  const hasMemory = !!(result.autoMemoryNote && (hasMeaningfulToken(result.autoMemoryNote.name) || hasMeaningfulToken(result.autoMemoryNote.fullPath)));
  if (!hasGuard && !hasRetry && !hasCitation && !hasMemory) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          {hasGuard || hasRetry ? <ShieldAlert size={13} className="shrink-0 text-warning" aria-hidden="true" /> : <ShieldCheck size={13} className="shrink-0 text-success" aria-hidden="true" />}
          <span className="truncate">검증 / 재시도 메타</span>
        </div>
        <Badge tone={hasGuard || result.retryRequired || result.citationValidationPassed === false ? "warning" : "success"}>
          {hasGuard || result.retryRequired || result.citationValidationPassed === false ? "확인 필요" : "통과"}
        </Badge>
      </div>
      <div className="grid gap-2">
        {hasGuard ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-2">
            <div className="mb-1 flex flex-wrap gap-1">
              <Badge tone="warning">guard</Badge>
              <Badge tone="outline">{displayToken(result.guardCategory)}</Badge>
              <Badge tone="outline">{displayToken(result.guardReason)}</Badge>
            </div>
            {hasMeaningfulToken(result.guardDetail) ? <p className="line-clamp-3 text-xs text-warning">{result.guardDetail}</p> : null}
          </div>
        ) : null}
        {hasRetry ? (
          <div className="rounded-md border border-border bg-card/60 p-2">
            <div className="mb-1 flex flex-wrap gap-1">
              <Badge tone={result.retryRequired ? "warning" : "outline"}>{result.retryRequired ? "retry required" : "retry meta"}</Badge>
              {result.retryAttempt || result.retryMaxAttempts ? <Badge tone="outline">{result.retryAttempt}/{result.retryMaxAttempts || "-"}</Badge> : null}
              {hasMeaningfulToken(result.retryAction) ? <Badge tone="outline">{result.retryAction}</Badge> : null}
              {hasMeaningfulToken(result.retryScope) ? <Badge tone="outline">{result.retryScope}</Badge> : null}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              {hasMeaningfulToken(result.retryReason) ? <p className="line-clamp-2">reason: {result.retryReason}</p> : null}
              {hasMeaningfulToken(result.retryStopReason) ? <p className="line-clamp-2">stop: {result.retryStopReason}</p> : null}
            </div>
          </div>
        ) : null}
        {hasCitation ? (
          <div className="rounded-md border border-border bg-card/60 p-2">
            <div className="mb-1 flex flex-wrap gap-1">
              <Badge tone={result.citationValidationPassed === false ? "destructive" : result.citationValidationPassed === true ? "success" : "outline"}>
                {result.citationValidationPassed === false ? "citation fail" : result.citationValidationPassed === true ? "citation pass" : "citation"}
              </Badge>
              <Badge tone="outline">citations {result.citationCount}</Badge>
              <Badge tone="outline">mapping {result.citationMappingCount}</Badge>
            </div>
            {hasMeaningfulToken(result.citationValidationReason) ? <p className="line-clamp-2 text-xs text-muted-foreground">reason: {result.citationValidationReason}</p> : null}
          </div>
        ) : null}
        {hasMemory && result.autoMemoryNote ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
            <div className="mb-1 flex flex-wrap gap-1">
              <Badge tone="primary">자동 메모리</Badge>
              <Badge tone="outline" className="max-w-full truncate">{displayToken(result.autoMemoryNote.name)}</Badge>
            </div>
            {hasMeaningfulToken(result.autoMemoryNote.fullPath) ? <p className="truncate font-mono text-xs text-muted-foreground">{result.autoMemoryNote.fullPath}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EvidencePackPanel({ result, runDirectory = "" }: { result: CodingResult; runDirectory?: string }) {
  const evidence = result.evidence;
  if (!evidence) return null;
  const stdout = normalizeExecutionOutput(evidence.stdoutSummary);
  const stderr = normalizeExecutionOutput(evidence.stderrSummary);
  const detailItems = [
    { key: "run-mode", label: "모드", value: evidence.runMode || "-" },
    { key: "status", label: "상태", value: `${evidence.status || "-"} · exit=${evidence.exitCode ?? "-"}` },
    evidence.command ? { key: "command", label: "명령", value: evidence.command, wide: true, mono: true } : null,
    evidence.previewUrl ? { key: "preview", label: "프리뷰", value: evidence.previewUrl, wide: true, mono: true } : null,
    evidence.previewEntry ? { key: "preview-entry", label: "엔트리", value: evidence.previewEntry, mono: true } : null,
    evidence.consoleSummary ? { key: "console", label: "콘솔", value: evidence.consoleSummary, wide: true } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; wide?: boolean; mono?: boolean }>;

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ClipboardList size={13} aria-hidden="true" /> <span className="truncate">생성 검증 근거</span>
        </div>
        <Badge tone="outline">{evidence.changedFiles.length} files</Badge>
      </div>
      {detailItems.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {detailItems.map((item) => (
            <div key={item.key} className={cn("min-w-0 rounded-md border border-border bg-card/60 p-2", item.wide && "sm:col-span-2")}>
              <p className="truncate text-[11px] font-semibold text-muted-foreground">{item.label}</p>
              <p className={cn("mt-1 truncate text-xs", item.mono && "font-mono")}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {evidence.changedFiles.length > 0 ? (
        <div className="mt-2">
          <p className="mb-1 truncate text-[11px] font-semibold text-muted-foreground">근거 파일</p>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
            {evidence.changedFiles.slice(0, 24).map((path) => (
              <Badge key={path} tone="outline" className="max-w-full truncate font-mono">{humanPath(path, runDirectory)}</Badge>
            ))}
          </div>
        </div>
      ) : null}
      {stdout || stderr ? (
        <div className="mt-2 space-y-2">
          {stdout ? (
            <div className="rounded-md border border-border bg-background/60">
              <div className="border-b border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">stdout summary</div>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px]">{stdout}</pre>
            </div>
          ) : null}
          {stderr ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10">
              <div className="border-b border-destructive/20 px-2 py-1 text-[11px] font-semibold text-destructive">stderr summary</div>
              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px] text-destructive">{stderr}</pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WorkerSummaryCard({ worker, index }: { worker: CodingWorker; index: number }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{worker.role || `worker-${index + 1}`}</p>
          <p className="truncate text-[11px] text-muted-foreground">{[worker.provider, worker.model].filter(Boolean).join(":") || "-"}</p>
        </div>
        <Badge tone={statusTone(worker.execution.status)}>{worker.execution.status || "-"}</Badge>
      </div>
      {worker.summary ? <p className="line-clamp-3 text-xs text-muted-foreground">{worker.summary}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone="outline">{worker.language || "auto"}</Badge>
        <Badge tone="outline">exit {worker.execution.exitCode ?? "-"}</Badge>
        <Badge tone="outline">files {worker.changedFiles.length}</Badge>
      </div>
    </div>
  );
}

type BuildResultTarget = {
  key: string;
  segment: string;
  execution: CodingExecution;
  changedFiles: string[];
};

function workerForTarget(result: CodingResult, segment: string) {
  if (!segment.startsWith("worker-")) return null;
  const index = Number(segment.replace("worker-", ""));
  if (!Number.isFinite(index) || index < 0) return null;
  return result.workers[index] || null;
}

function resultTargetHeading(result: CodingResult, target: BuildResultTarget) {
  const worker = workerForTarget(result, target.segment);
  if (!worker) return "Main";
  return worker.role || `Worker ${Number(target.segment.replace("worker-", "")) + 1}`;
}

function resultTargetModelLabel(result: CodingResult, target: BuildResultTarget) {
  const worker = workerForTarget(result, target.segment);
  const provider = worker?.provider || result.provider;
  const model = worker?.model || result.model;
  return [provider, model].filter(Boolean).join(":") || "-";
}

function resultTargetSummary(result: CodingResult, target: BuildResultTarget) {
  const worker = workerForTarget(result, target.segment);
  return worker?.summary || result.summary || result.commonSummary || "표시할 요약이 없습니다.";
}

function ResultTargetCarousel({
  result,
  targets,
  selectedTarget,
  onSelect
}: {
  result: CodingResult;
  targets: BuildResultTarget[];
  selectedTarget: BuildResultTarget;
  onSelect: (segment: string) => void;
}) {
  const activeIndex = Math.max(0, targets.findIndex((target) => target.segment === selectedTarget.segment));
  const canNavigate = targets.length > 1;
  const selectAt = (index: number) => {
    if (!canNavigate) return;
    const next = targets[(index + targets.length) % targets.length];
    if (next) onSelect(next.segment);
  };

  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted-foreground">최근 코딩 결과</p>
          <p className="truncate text-[11px] text-muted-foreground">{resultTargetModelLabel(result, selectedTarget)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="이전 결과" disabled={!canNavigate} onClick={() => selectAt(activeIndex - 1)}>
            <ChevronLeft size={14} aria-hidden="true" />
          </Button>
          <div className="flex h-7 min-w-[84px] items-center justify-center rounded-md border border-border bg-card/60 px-2 text-[11px] font-medium text-muted-foreground">
            <span className="truncate">{activeIndex + 1} / {targets.length}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="다음 결과" disabled={!canNavigate} onClick={() => selectAt(activeIndex + 1)}>
            <ChevronRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-[10px] font-bold text-primary">
          DEV
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-card/70 p-2">
          <div className="mb-1 flex flex-wrap gap-1">
            <Badge tone={statusTone(selectedTarget.execution.status)}>{selectedTarget.execution.status || "result"}</Badge>
            <Badge tone="outline">{resultTargetHeading(result, selectedTarget)}</Badge>
            <Badge tone="outline">exit {selectedTarget.execution.exitCode ?? "-"}</Badge>
            <Badge tone="outline">files {selectedTarget.changedFiles.length}</Badge>
          </div>
          <div className="prose-omnux text-xs">
            <MarkdownMessage text={resultTargetSummary(result, selectedTarget)} />
          </div>
        </div>
      </div>
      {canNavigate ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {targets.map((target) => (
            <button
              key={target.segment}
              type="button"
              onClick={() => onSelect(target.segment)}
              className={cn(
                "inline-flex h-6 max-w-[120px] shrink-0 items-center rounded-md border px-2 text-[11px] transition-colors hover:bg-accent",
                target.segment === selectedTarget.segment ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card/60 text-muted-foreground"
              )}
              title={resultTargetModelLabel(result, target)}
            >
              <span className="truncate">{resultTargetHeading(result, target)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkerComparisonPanel({ result }: { result: CodingResult }) {
  if (result.workers.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Sparkles size={13} aria-hidden="true" /> <span className="truncate">워커 결과</span>
        </div>
        <Badge tone="outline">{result.workers.length}</Badge>
      </div>
      <div className="grid gap-2">
        {result.workers.map((worker, index) => (
          <WorkerSummaryCard key={`${worker.provider}-${worker.model}-${index}`} worker={worker} index={index} />
        ))}
      </div>
    </div>
  );
}

function ResultDock({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  const [showResultLogs, setShowResultLogs] = useState(false);
  const [showRuntimeLogs, setShowRuntimeLogs] = useState(true);
  const result = store.currentResult;
  const targets = getBuildResultTargets(result);
  const selectedTarget = targets.find((target) => target.segment === store.selectedResultTarget) || targets[0] || null;
  const progress = store.progressByMode[store.codingMode];
  const changedFiles = selectedTarget?.changedFiles?.length ? selectedTarget.changedFiles : result?.changedFiles || [];
  const selectedExecution = selectedTarget?.execution || result?.execution || null;
  const runtimeLogs = executionText(store.runtime?.execution || null);
  const runtimePreviewUrl = store.runtime?.previewUrl || result?.evidence?.previewUrl || "";

  useEffect(() => {
    setShowResultLogs(shouldAutoShowExecutionLogs(selectedExecution));
  }, [result?.conversationId, selectedTarget?.segment, selectedExecution?.status, selectedExecution?.stdout, selectedExecution?.stderr]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">결과 도크</span>
          <Badge tone={store.pending ? "primary" : result ? "success" : "outline"}>{store.pending ? "running" : result ? result.mode : "idle"}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="도크 닫기" onClick={() => store.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>

      {progress ? (
        <div className="rounded-lg border border-border bg-muted/25 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-muted-foreground">{progress.stageTitle || progress.phase || "진행 중"}</span>
            <Badge tone={progress.done ? "success" : "primary"}>{progress.percent || 0}%</Badge>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-primary transition-all duration-200", progressWidthClass(progress.percent))} />
          </div>
          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{progress.stageDetail || progress.message || "코딩 실행 중..."}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {progress.provider ? <Badge tone="outline">{progress.provider}</Badge> : null}
            {progress.model ? <Badge tone="outline" className="max-w-full truncate">{progress.model}</Badge> : null}
            {progress.stageIndex > 0 && progress.stageTotal > 0 ? <Badge tone="outline">stage {progress.stageIndex}/{progress.stageTotal}</Badge> : null}
            {progress.maxIterations ? <Badge tone="outline">{progress.iteration}/{progress.maxIterations}</Badge> : null}
          </div>
        </div>
      ) : null}

      {result ? (
        <>
          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={statusTone(result.execution.status)}>{result.execution.status || "result"}</Badge>
              <Badge tone="outline">{result.language || "auto"}</Badge>
              <Badge tone="outline" className="max-w-full truncate">{[result.provider, result.model].filter(Boolean).join(":") || "-"}</Badge>
            </div>
            <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">{result.summary || result.commonSummary || "요약 없음"}</p>
            {result.recommendation ? <p className="mt-2 line-clamp-3 text-xs text-primary">{result.recommendation}</p> : null}
          </div>

          {result.mode === "multi" ? <MultiSummaryPanel result={result} /> : null}
          <ExecutionDetailsPanel title="생성 실행 상세" execution={selectedExecution} runDirectory={selectedExecution?.runDirectory || result.execution.runDirectory} />
          <ResultSafetyMetaPanel result={result} />
          {selectedTarget && targets.length > 1 ? <ResultTargetCarousel result={result} targets={targets} selectedTarget={selectedTarget} onSelect={store.setSelectedResultTarget} /> : null}
          <WorkerComparisonPanel result={result} />

          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-muted-foreground">생성/수정 파일</span>
              <Badge tone="outline">{changedFiles.length}</Badge>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {changedFiles.map((path) => (
                <button
                  key={path}
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-card/60 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  onClick={() => store.previewFile(path, selectedTarget?.segment || "main", selectedExecution?.runDirectory)}
                >
                  <FileCode2 size={13} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono">{path}</span>
                </button>
              ))}
              {changedFiles.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground">변경 파일 없음</p> : null}
            </div>
          </div>

          {store.filePreview ? (
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-xs font-semibold">{store.filePreview.path}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="파일 프리뷰 닫기" onClick={store.clearFilePreview}>
                  <X size={14} aria-hidden="true" />
                </Button>
              </div>
              {store.filePreview.loading ? (
                <div className="flex h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Spinner size={14} /> 파일 로딩 중
                </div>
              ) : store.filePreview.error ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{store.filePreview.error}</p>
              ) : (
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 font-mono text-[11px] leading-relaxed">
                  {store.filePreview.content || "내용 없음"}
                </pre>
              )}
            </div>
          ) : null}

          <div className="rounded-lg border border-border bg-muted/25 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-muted-foreground">실행</span>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => setShowResultLogs((current) => !current)}>
                  <MoreHorizontal size={13} aria-hidden="true" /> 생성 로그
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={store.executeLatest} disabled={!canRequest || !result.conversationId}>
                  <Play size={13} aria-hidden="true" /> 최신 실행
                </Button>
              </div>
            </div>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              value={store.standardInput}
              placeholder={"stdin 선택 입력\n예: 1\n12\n3"}
              onChange={(event) => store.setStandardInput(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap justify-end gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={store.executeLatest} disabled={!canRequest || !result.conversationId}>
                <Play size={13} aria-hidden="true" /> 입력 포함 실행
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => store.setStandardInput("")} disabled={!store.standardInput || store.pending}>
                비우기
              </Button>
            </div>
            {store.executionMessage ? <p className="mt-2 truncate text-xs text-muted-foreground">{store.executionMessage}</p> : null}
            {showResultLogs ? (
              <div className="mt-2">
                <ExecutionDetailsPanel title="생성 단계 실행 로그" execution={selectedExecution} runDirectory={selectedExecution?.runDirectory || result.execution.runDirectory} showOutputs emptyMessage="생성 단계에서는 stdout/stderr가 남지 않았습니다." />
              </div>
            ) : null}
            {store.runtime ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge tone={store.runtime.ok ? "success" : "destructive"}>{store.runtime.runMode || "runtime"}</Badge>
                  {store.runtime.targetProvider ? <Badge tone="outline">{store.runtime.targetProvider}</Badge> : null}
                  {store.runtime.targetModel ? <Badge tone="outline" className="max-w-full truncate">{store.runtime.targetModel}</Badge> : null}
                  <button type="button" onClick={() => setShowRuntimeLogs((current) => !current)} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    실행 로그 {showRuntimeLogs ? "닫기" : "보기"}
                  </button>
                </div>
                {showRuntimeLogs ? (
                  store.runtime.execution ? (
                    <ExecutionDetailsPanel title="재실행 상세" execution={store.runtime.execution} runDirectory={store.runtime.execution.runDirectory || selectedExecution?.runDirectory} showOutputs emptyMessage={store.runtime.message || "실행 로그 없음"} />
                  ) : (
                    <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 font-mono text-[11px]">
                      {runtimeLogs || store.runtime.message || "실행 로그 없음"}
                    </pre>
                  )
                ) : null}
              </div>
            ) : null}
          </div>

          {runtimePreviewUrl ? (
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-muted-foreground">브라우저 프리뷰</span>
                <div className="flex min-w-0 shrink-0 items-center gap-1">
                  <Badge tone="outline" className="max-w-[160px] truncate">{store.runtime?.previewEntry || result.evidence?.previewEntry || "index.html"}</Badge>
                  <a
                    href={runtimePreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 shrink-0 items-center rounded-md border border-border px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground"
                  >
                    새 탭
                  </a>
                </div>
              </div>
              <iframe title="코딩 결과 프리뷰" src={runtimePreviewUrl} className="h-56 w-full rounded-md border border-border bg-background" sandbox="allow-scripts allow-same-origin allow-forms" />
            </div>
          ) : null}

          <EvidencePackPanel result={result} runDirectory={selectedExecution?.runDirectory || result.execution.runDirectory} />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={store.saveResultToNotebook} disabled={!canRequest}>
              NB
            </Button>
            <Button variant="outline" size="sm" onClick={store.createPlanFromResult} disabled={!canRequest}>
              PL
            </Button>
            <Button variant="outline" size="sm" onClick={store.clearResult} disabled={store.pending}>
              <Trash2 size={14} aria-hidden="true" /> 비우기
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Terminal}
          title={store.pending ? "코딩 실행 중" : "결과 없음"}
          description={store.pending ? "진행 상태가 들어오면 이 도크에 표시됩니다." : "요청을 보내면 변경 파일, 실행 로그, 프리뷰가 표시됩니다."}
          className="py-8"
        />
      )}

      <RollbackPanel canRequest={canRequest} compact />
    </div>
  );
}

function RollbackPanel({ canRequest, compact = false }: { canRequest: boolean; compact?: boolean }) {
  const store = useBuildStore();
  const rollback = store.rollbackStatus;
  const rollbackBadge = rollback.pending ? "진행 중" : rollback.ok === true ? "완료" : rollback.ok === false ? "확인 필요" : "대기";
  return (
    <div className={cn("rounded-lg border border-border bg-muted/25 p-3", !compact && "space-y-3")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <RotateCcw size={14} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-xs font-semibold text-muted-foreground">롤백 복원</span>
        </div>
        <Badge tone={rollback.ok === false ? "destructive" : rollback.ok === true ? "success" : "default"} className="shrink-0 font-mono">
          {rollbackBadge}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <Input className="h-8 font-mono text-xs" value={store.rollbackId} placeholder="rollback_... ID" onChange={(event) => store.setRollbackId(event.target.value)} />
        <Button variant="destructive" size="sm" onClick={store.restoreRollback} disabled={!canRequest || rollback.pending || !store.rollbackId.trim()}>
          {rollback.pending ? <Spinner size={14} /> : <RotateCcw size={14} aria-hidden="true" />}
          복원
        </Button>
      </div>
      {rollback.message ? <p className="mt-2 text-xs text-muted-foreground">{rollback.message}</p> : null}
      {rollback.changedPaths.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {rollback.changedPaths.slice(0, 6).map((path) => (
            <Badge key={path} tone="outline" className="max-w-full truncate font-mono">{path}</Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RagPanel({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  if (!store.ragPreflight) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(store.ragPreflight.status)}>{store.ragPreflight.status || "preflight"}</Badge>
            <Badge tone={statusTone(store.ragPreflight.primaryStrategy)}>{store.ragPreflight.primaryStrategy || "none"}</Badge>
            <Badge tone={store.ragPreflight.retrievalRecommended ? "primary" : "outline"}>
              {store.ragPreflight.retrievalRecommended ? "retrieval" : "no retrieval"}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{store.ragPreflight.queryPreview}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="RAG preflight 닫기" onClick={store.clearRagPreflight}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-2 space-y-1">
        {store.ragPreflight.candidates.slice(0, 4).map((candidate) => (
          <div key={`${candidate.kind}-${candidate.suggestedRequestType}`} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/60 px-2.5 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{candidate.kind}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{candidate.reason}</span>
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Badge tone={statusTone(candidate.priority)}>{candidate.suggestedRequestType || candidate.priority}</Badge>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => store.runRagCandidate(candidate)}
                disabled={
                  !canRequest ||
                  store.ragExecution?.loading ||
                  candidate.kind === "none" ||
                  !candidate.suggestedRequestType ||
                  (candidate.suggestedRequestType === "session_replay_get" && !store.activeConversationId)
                }
              >
                조회
              </Button>
            </div>
          </div>
        ))}
      </div>
      {store.ragExecution ? (
        <div className="mt-2 rounded-md border border-border bg-background/50 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(store.ragExecution.status)}>{store.ragExecution.status}</Badge>
            <Badge tone="outline">{store.ragExecution.requestType}</Badge>
            {store.ragExecution.loading ? <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Spinner size={12} /> 조회 중</span> : null}
          </div>
          {store.ragExecution.error ? <p className="mt-1 truncate text-xs text-destructive">{store.ragExecution.error}</p> : null}
          <div className="mt-2 space-y-1">
            {store.ragExecution.items.slice(0, 6).map((item) => (
              <div key={`${item.title}-${item.badge}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{item.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.detail || "detail -"}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="flex flex-wrap justify-end gap-1">
                    <Badge tone="outline">{item.badge || "-"}</Badge>
                    {item.badges?.slice(0, 2).map((badge) => <Badge key={badge} tone="outline">{badge}</Badge>)}
                  </span>
                  {store.ragExecution?.requestType === "memory_search" && item.path ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => store.openRagMemoryItem(item)}
                      disabled={!canRequest || !!store.ragMemoryPreview?.loading}
                    >
                      <FileText size={12} aria-hidden="true" /> 열기
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {store.ragMemoryPreview ? (
            <div className="mt-2 overflow-hidden rounded-md border border-border bg-card/70">
              <div className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText size={13} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate text-xs font-medium" title={store.ragMemoryPreview.path}>{store.ragMemoryPreview.path}</span>
                  {store.ragMemoryPreview.loading ? <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"><Spinner size={12} /> 읽는 중</span> : null}
                </div>
                <Button variant="ghost" size="icon" aria-label="메모리 원문 닫기" onClick={store.clearRagMemoryPreview}>
                  <X size={13} aria-hidden="true" />
                </Button>
              </div>
              {store.ragMemoryPreview.error ? <p className="px-2.5 py-2 text-xs text-destructive">{store.ragMemoryPreview.error}</p> : null}
              {store.ragMemoryPreview.text ? (
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-5 text-foreground">{store.ragMemoryPreview.text}</pre>
              ) : null}
              {!store.ragMemoryPreview.loading && !store.ragMemoryPreview.error && !store.ragMemoryPreview.text ? (
                <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">표시할 원문이 없습니다.</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SelectedSkillStrip() {
  const store = useBuildStore();
  const selectedSkill = store.selectedSkill;
  if (!selectedSkill) return null;
  return (
    <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Sparkles size={14} className="shrink-0 text-primary" aria-hidden="true" />
        <Badge tone="primary" className="shrink-0">{skillScopeLabel(selectedSkill.scope)}</Badge>
        <span className="min-w-0 truncate text-xs font-semibold text-primary">{selectedSkill.name}</span>
        {selectedSkill.description ? <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground md:inline">{selectedSkill.description}</span> : null}
      </div>
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        onClick={store.clearSelectedSkill}
      >
        <X size={12} aria-hidden="true" /> 해제
      </button>
    </div>
  );
}

function BuildComposer({ canRequest }: { canRequest: boolean }) {
  const store = useBuildStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceInput = useBuildVoiceInput();
  const shortcuts = useDesktopPreferenceStore((state) => state.shortcuts);
  const currentInput = store.inputByMode[store.codingMode];
  const canSend = canRequest && !store.pending && (!!currentInput.trim() || store.attachments.length > 0);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "focusComposer") composerTextareaRef.current?.focus();
    };
    window.addEventListener("omnux:shortcut", handleShortcut);
    return () => window.removeEventListener("omnux:shortcut", handleShortcut);
  }, []);

  const handleAttachmentFiles = async (files: FileList | File[] | null) => {
    try {
      const result = await filesToAttachments(files, store.attachments.length);
      if (result.items.length > 0) store.addAttachments(result.items);
      if (result.error) useBuildStore.setState({ lastError: result.error });
    } catch (error) {
      useBuildStore.setState({ lastError: error instanceof Error ? error.message : "첨부 파일을 읽지 못했다." });
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    store.setAttachmentDragActive(false);
    void handleAttachmentFiles(event.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card/70 p-2 shadow-sm backdrop-blur-xl transition-colors duration-200",
        store.attachmentDragActive && "border-primary/50 bg-primary/10"
      )}
      onDragEnter={(event) => {
        if (hasDraggedFiles(event.dataTransfer)) {
          event.preventDefault();
          store.setAttachmentDragActive(true);
          store.setAttachmentPanelOpen(true);
        }
      }}
      onDragOver={(event) => {
        if (hasDraggedFiles(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          store.setAttachmentDragActive(false);
        }
      }}
      onDrop={handleDrop}
    >
      {store.attachmentDragActive ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border border-dashed border-primary/60 bg-background/80 text-sm font-semibold text-primary backdrop-blur-xl">
          첨부 파일 추가
        </div>
      ) : null}
      {voiceInput.error ? <p className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{voiceInput.error}</p> : null}
      <SelectedSkillStrip />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          void handleAttachmentFiles(files);
          event.currentTarget.value = "";
        }}
      />
      {store.attachmentPanelOpen || store.attachments.length > 0 || store.attachmentDragActive ? (
        <div className="mb-2 rounded-lg border border-border bg-muted/25 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <Paperclip size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{store.attachmentDragActive ? "여기에 파일을 놓으세요" : `첨부 ${store.attachments.length}개`}</span>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => fileInputRef.current?.click()}>
                <Plus size={13} aria-hidden="true" /> 추가
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={store.clearAttachments} disabled={store.attachments.length === 0}>
                지우기
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="첨부 패널 닫기" onClick={() => store.setAttachmentPanelOpen(false)}>
                <X size={13} aria-hidden="true" />
              </Button>
            </div>
          </div>
          {store.attachments.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {store.attachments.map((item) => (
                <span key={`${item.name}-${item.sizeBytes}`} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px]">
                  <FileText size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="max-w-[180px] truncate">{item.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
                  <button type="button" className="shrink-0 text-muted-foreground transition-colors hover:text-foreground" onClick={() => store.removeAttachment(item.name)} aria-label={`${item.name} 첨부 제거`}>
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <Textarea
        ref={composerTextareaRef}
        rows={composerRows(currentInput)}
        className="min-h-[84px] max-h-[240px]"
        value={currentInput}
        placeholder="예: apps/desktop의 빌드 오류를 찾아 수정하고 검증까지 정리해줘"
        onChange={(event) => store.setCodingInput(event.target.value)}
        onKeyDown={(event) => {
          if (shortcutMatches(event.nativeEvent, shortcuts.send) || (event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
            event.preventDefault();
            if (canSend) store.runCoding();
          }
        }}
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Button
          variant={voiceInput.active ? "primary" : "outline"}
          size="icon"
          className="h-8 w-8"
          aria-label={voiceInput.active ? "음성 입력 중지" : "음성 입력"}
          title={voiceInput.active ? "음성 입력 중지" : "음성 입력"}
          onClick={() => voiceInput.toggle(currentInput)}
          disabled={!voiceInput.supported || (store.pending && !voiceInput.active)}
        >
          {voiceInput.active ? <MicOff size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
        </Button>
        <Button
          variant={store.attachmentPanelOpen ? "primary" : "outline"}
          size="icon"
          className="h-8 w-8"
          aria-label="첨부"
          title="첨부"
          onClick={() => store.setAttachmentPanelOpen(!store.attachmentPanelOpen)}
        >
          <Paperclip size={14} aria-hidden="true" />
        </Button>
        <Button variant={store.thinkPlus ? "primary" : "outline"} size="icon" className="h-8 w-8" aria-label="Think+" title="Think+" onClick={() => store.setThinkPlus(!store.thinkPlus)} aria-pressed={store.thinkPlus}>
          <Sparkles size={14} aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="입력을 루틴으로 저장" title="입력을 루틴으로 저장" onClick={store.saveInputAsRoutine} disabled={!canRequest || currentInput.trim().length < 5}>
          <CalendarPlus size={14} aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="입력으로 작업계획 만들기" title="입력으로 작업계획 만들기" onClick={store.createPlanFromInput} disabled={!canRequest || currentInput.trim().length < 5}>
          <ClipboardList size={14} aria-hidden="true" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" aria-label="검색 점검" title="검색 점검" onClick={store.runRagPreflight} disabled={!canRequest || store.ragPending || !currentInput.trim()}>
          {store.ragPending ? <Spinner size={14} /> : <BrainCircuit size={14} aria-hidden="true" />}
        </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone="outline" className="max-w-[180px] truncate">{store.attachments.length > 0 ? `첨부 ${store.attachments.length}` : store.thinkPlus ? "Think+ 켜짐" : "대기"}</Badge>
          <Button variant="primary" size="icon" className="h-8 w-8" aria-label="전송" title="전송" onClick={store.runCoding} disabled={!canSend}>
            {store.pending ? <Spinner size={14} /> : <Send size={16} aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BuildPage() {
  useBuildPageBridge();
  useRefactorPageBridge();
  useSkillPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const routePayload = useDesktopNavigationStore((state) => state.routePayload);
  const routeVersion = useDesktopNavigationStore((state) => state.routeVersion);
  const clearRoutePayload = useDesktopNavigationStore((state) => state.clearRoutePayload);
  const store = useBuildStore();
  const skillStore = useSkillStore();
  const autoSpeak = useSpeechStore((state) => state.autoSpeak);
  const toggleAutoSpeak = useSpeechStore((state) => state.toggleAutoSpeak);
  const lastAutoSpeakKeyRef = useRef<string | null>(null);
  const attachmentDragDepthRef = useRef(0);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const currentProvider = store.providerByMode[store.codingMode] !== "auto" ? store.providerByMode[store.codingMode] : "groq";
  const activeModelProvider = currentProvider as BuildModelProvider;
  const context = store.conversationContext;
  const rightPanel = store.sidePanel || "result";

  useEffect(() => {
    if (canRequest) {
      store.loadConversations();
      store.loadMemoryNotes();
      store.loadModelCatalogs();
      skillStore.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  useEffect(() => {
    if (!routePayload) return;
    const input = String(routePayload.input || "").trim();
    const mode = String(routePayload.mode || "").trim();
    const nextMode: CodingMode | null =
      mode === "multi" || mode === "orchestration" || mode === "single" ? mode : null;
    if (nextMode && useBuildStore.getState().codingMode !== nextMode) {
      useBuildStore.getState().setCodingMode(nextMode);
    }
    if (input) useBuildStore.getState().setCodingInput(input);
    if (routePayload.projectName || routePayload.projectKey) {
      useBuildStore.getState().patchMetaDraft({
        project: String(routePayload.projectName || routePayload.projectKey || ""),
        ...(input ? {} : { title: `프로젝트 작업 · ${routePayload.projectName || routePayload.projectKey}` })
      });
    }
    if (routePayload.openAttachmentPanel) {
      useBuildStore.getState().setAttachmentPanelOpen(true);
    }
    clearRoutePayload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  useEffect(() => () => useSpeechStore.getState().stop(), []);

  useEffect(() => {
    const handleWindowDragEnter = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      attachmentDragDepthRef.current += 1;
      useBuildStore.getState().setAttachmentPanelOpen(true);
      useBuildStore.getState().setAttachmentDragActive(true);
    };
    const handleWindowDragOver = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      if (attachmentDragDepthRef.current <= 0) attachmentDragDepthRef.current = 1;
      useBuildStore.getState().setAttachmentPanelOpen(true);
      useBuildStore.getState().setAttachmentDragActive(true);
    };
    const handleWindowDragLeave = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);
      if (attachmentDragDepthRef.current === 0) {
        useBuildStore.getState().setAttachmentDragActive(false);
      }
    };
    const handleWindowDrop = (event: globalThis.DragEvent) => {
      if (!hasDraggedFiles(event.dataTransfer)) return;
      event.preventDefault();
      attachmentDragDepthRef.current = 0;
      useBuildStore.getState().setAttachmentDragActive(false);
    };

    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    return () => {
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      attachmentDragDepthRef.current = 0;
      useBuildStore.getState().setAttachmentDragActive(false);
    };
  }, []);

  useEffect(() => {
    const candidate = store.autoSpeakCandidate;
    if (!candidate) return;
    if (!autoSpeak || !isSpeechSupported()) {
      lastAutoSpeakKeyRef.current = candidate.key;
      return;
    }
    if (lastAutoSpeakKeyRef.current === candidate.key) return;
    lastAutoSpeakKeyRef.current = candidate.key;
    useSpeechStore.getState().speak(candidate.key, candidate.text);
  }, [autoSpeak, store.autoSpeakCandidate]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[620px] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">빌드</h1>
        <p className="text-sm text-muted-foreground">코딩 작업, 모델 라우팅, 변경 파일과 실행 결과를 한 화면에서 제어합니다.</p>
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_380px]">
        <CardBoundary title="코딩 작업함" card="navigation" onError={recordCardError}>
          <ConversationList canRequest={canRequest} />
        </CardBoundary>

        <CardBoundary title="코딩 본문" card="operations" onError={recordCardError}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="outline" className="max-w-[220px] truncate">세션 {store.activeConversationId || "-"}</Badge>
            {context.tokenUsageTotal ? (
              <Badge tone="primary" title={`${context.tokenUsageTotal.totalTokens.toLocaleString("ko-KR")} tokens`}>
                {formatTokenShort(context.tokenUsageTotal.totalTokens)} tokens
              </Badge>
            ) : null}
            {context.linkedMemoryNotes.length > 0 ? <Badge tone="outline">memory {context.linkedMemoryNotes.length}</Badge> : null}
            {store.thinkPlus ? <Badge tone="primary"><Sparkles size={11} aria-hidden="true" /> Think+</Badge> : null}
            {store.selectedSkill ? <Badge tone="primary" className="max-w-[180px] truncate"><Sparkles size={11} aria-hidden="true" /> {store.selectedSkill.name}</Badge> : null}
            <CodingModeSegmentedControl />
            <ProviderSelect
              label={store.codingMode === "orchestration" ? "주 구현" : store.codingMode === "multi" ? "비교 요약" : "모델"}
              value={store.providerByMode[store.codingMode]}
              includeAuto
              ariaLabel="코딩 제공자 선택"
              onChange={store.setProvider}
            />
            {store.providerByMode[store.codingMode] !== "auto" ? <ModelSelect provider={activeModelProvider} compact /> : null}
            <LanguageSelect />
            <SkillSelectCompact canRequest={canRequest} />
            {store.pending ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Spinner size={13} /> 실행 중
              </span>
            ) : null}
            {isSpeechSupported() ? (
              <Button
                variant={autoSpeak ? "primary" : "outline"}
                size="sm"
                onClick={toggleAutoSpeak}
                aria-pressed={autoSpeak}
                title={autoSpeak ? "자동 읽기 끄기" : "자동 읽기 켜기"}
              >
                {autoSpeak ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
                자동 {autoSpeak ? "ON" : "OFF"}
              </Button>
            ) : null}
            <Button variant={store.sidePanel === "info" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "info" ? null : "info")}>
              <Info size={14} aria-hidden="true" /> 정보
            </Button>
            <Button variant={store.sidePanel === "memory" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "memory" ? null : "memory")}>
              <Database size={14} aria-hidden="true" /> 메모리
            </Button>
            <Button variant={store.sidePanel === "models" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "models" ? null : "models")}>
              <Sparkles size={14} aria-hidden="true" /> 모델
            </Button>
            <Button variant={store.sidePanel === "skills" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "skills" ? null : "skills")}>
              <Sparkles size={14} aria-hidden="true" /> 스킬
            </Button>
            <Button variant={store.sidePanel === "context" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "context" ? null : "context")}>
              <ClipboardList size={14} aria-hidden="true" /> 문맥
            </Button>
            <Button variant={rightPanel === "result" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel("result")}>
              <Terminal size={14} aria-hidden="true" /> 결과
            </Button>
            <Button variant={store.sidePanel === "refactor" ? "primary" : "outline"} size="sm" onClick={() => store.setSidePanel(store.sidePanel === "refactor" ? null : "refactor")}>
              <Replace size={14} aria-hidden="true" /> 리팩터
            </Button>
          </div>

          <CodingModeHint mode={store.codingMode} />
          {store.codingMode !== "single" ? <WorkerModelStrip /> : null}
          <RagPanel canRequest={canRequest} />

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {context.linkedMemoryNotes.length > 0 || context.compressionEvents.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {context.linkedMemoryNotes.slice(0, 4).map((name) => <Badge key={name} tone="outline" className="max-w-full truncate">{name}</Badge>)}
                  {context.linkedMemoryNotes.length > 4 ? <Badge tone="outline">+{context.linkedMemoryNotes.length - 4}</Badge> : null}
                  {context.compressionEvents.slice(0, 2).map((event) => <Badge key={`${event.createdUtc}-${event.preview}`} tone="warning">auto-compress</Badge>)}
                </div>
                {context.compressionEvents[0] ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{context.compressionEvents[0].preview || "이전 코딩 대화가 압축 요약으로 보존되었습니다."}</p>
                ) : null}
              </div>
            ) : null}
            {store.pending && store.activeConversationId && store.messages.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-border bg-muted/25">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size={16} /> 코딩 기록을 불러오는 중
                </div>
              </div>
            ) : null}
            {store.messages.map((message, index) => (
              <MessageBubble key={`${index}-${message.role}`} message={message} index={index} canRequest={canRequest} />
            ))}
            {store.messages.length === 0 && !store.pending ? (
              <EmptyState
                icon={Code2}
                title="코딩 요청 대기"
                description={canRequest ? "변경 요청을 입력하면 코딩 실행 결과가 연결됩니다." : "미들웨어 인증 후 사용할 수 있습니다."}
                action={canRequest ? (
                  <Button variant="outline" size="sm" onClick={() => useBuildStore.getState().setCodingInput("현재 프로젝트의 빌드 오류를 찾아 수정해줘")}>
                    <Sparkles size={14} aria-hidden="true" /> 예시 입력
                  </Button>
                ) : null}
              />
            ) : null}
          </div>

          <BuildComposer canRequest={canRequest} />
        </CardBoundary>

        <CardBoundary title={rightPanel === "info" ? "작업 정보" : rightPanel === "memory" ? "공유 메모리" : rightPanel === "models" ? "모델" : rightPanel === "skills" ? "스킬" : rightPanel === "context" ? "문맥 Picker" : rightPanel === "refactor" ? "Safe Refactor" : "결과 도크"} card="operations" onError={recordCardError}>
          {rightPanel === "info" ? <ConversationMetaPanel canRequest={canRequest} /> : null}
          {rightPanel === "memory" ? <MemoryDock canRequest={canRequest} /> : null}
          {rightPanel === "models" ? <ModelDock /> : null}
          {rightPanel === "skills" ? <SkillDock canRequest={canRequest} /> : null}
          {rightPanel === "context" ? (
            <ContextPickerPanel
              canRequest={canRequest}
              surface="build"
              applyLabel="입력에 붙이기"
              onApply={(items) => {
                const state = useBuildStore.getState();
                state.setCodingInput(appendContextSelectionBundle(state.inputByMode[state.codingMode], items));
              }}
            />
          ) : null}
          {rightPanel === "refactor" ? <SafeRefactorDock canRequest={canRequest} /> : null}
          {rightPanel === "result" ? <ResultDock canRequest={canRequest} /> : null}
        </CardBoundary>
      </section>
    </div>
  );
}
