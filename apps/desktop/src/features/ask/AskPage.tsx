import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
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
  FileImage,
  FileText,
  Folder,
  Inbox,
  Info,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Send,
  SlidersHorizontal,
  Tag,
  Trash2,
  Volume2,
  VolumeX,
  Workflow,
  X
} from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useDesktopNavigationStore } from "../shell/navigation-store";
import { shortcutMatches, useDesktopPreferenceStore, type ModelProviderId } from "../shell/preference-store";
import { ASK_PROVIDER_OPTIONS, useAskPageBridge, useAskStore, type AskChatMode, type AskConversationItem, type AskInputAttachment, type AskModelProvider } from "./ask-store";
import type { AskActionSuggestion, AskTokenUsage } from "./ask-context";
import { filesToVisionAttachments } from "./ask-vision";
import {
  extractSpeechTranscript,
  getSpeechInputErrorMessage,
  getSpeechRecognitionConstructor,
  isSpeechInputSupported,
  isSpeechSupported,
  useSpeechStore,
  type SpeechRecognitionLike
} from "./ask-speech";
import { AskVisionPanel } from "./AskVisionPanel";
import { MarkdownMessage } from "./MarkdownMessage";
import { Badge, Button, Card, EmptyState, Input, Spinner, cn } from "../../components/ui/primitives";
import { NONE_MODEL, PROVIDER_KEYS, PROVIDER_LABEL, modelOptionsForProvider } from "./ask-models";
import { ContextPickerPanel } from "../context-picker/ContextPickerPanel";
import { appendContextSelectionBundle } from "../context-picker/context-picker-store";

const MAX_ATTACHMENT_COUNT = 6;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

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

function readFileAsAttachment(file: File): Promise<AskInputAttachment> {
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

async function filesToAttachments(files: FileList | File[] | null, existingCount: number): Promise<{ items: AskInputAttachment[]; error: string | null }> {
  const list = Array.from(files || []);
  const items: AskInputAttachment[] = [];
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

function defaultConversationFromSearch(item: { conversationId: string; title: string; snippet: string }, base?: AskConversationItem): AskConversationItem {
  return {
    id: item.conversationId,
    scope: base?.scope || "chat",
    mode: base?.mode || "single",
    title: item.title || base?.title || "제목 없음",
    preview: item.snippet || base?.preview || "",
    messageCount: base?.messageCount || 0,
    updatedUtc: base?.updatedUtc || "",
    project: base?.project || "검색 결과",
    category: base?.category || "일반",
    tags: base?.tags || [],
    linkedMemoryNotes: base?.linkedMemoryNotes || []
  };
}

function groupConversations(items: AskConversationItem[]) {
  const map = new Map<string, AskConversationItem[]>();
  for (const item of items) {
    const folder = item.project?.trim() || "기본";
    map.set(folder, [...(map.get(folder) || []), item]);
  }
  return Array.from(map.entries()).map(([folder, folderItems]) => ({ folder, items: folderItems }));
}

function uniqueConversations(items: AskConversationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildMessageHandoff(kind: "build" | "automate" | "compare", text: string, meta = "") {
  const header =
    kind === "build"
      ? "아래 Ask 답변을 바탕으로 필요한 코드 작업을 정리하고 적용해줘."
      : kind === "automate"
        ? "아래 Ask 답변을 반복 실행 가능한 자동화 루틴 초안으로 정리해줘."
        : "아래 Ask 답변을 여러 모델 관점에서 비교하고 놓친 점을 찾아줘.";
  return [
    header,
    "",
    meta.trim() ? `응답 메타: ${meta.trim()}` : "",
    "답변:",
    text.trim()
  ].filter(Boolean).join("\n");
}

const SUGGESTION_ICON: Record<AskActionSuggestion["kind"], typeof CalendarPlus> = {
  routine: CalendarPlus,
  plan: ClipboardList,
  agent: Workflow
};

function MessageActions({ messageKey, messageIndex, text, meta = "", canRequest, suggestions }: { messageKey: string; messageIndex: number; text: string; meta?: string; canRequest: boolean; suggestions?: AskActionSuggestion[] }) {
  const navigate = useDesktopNavigationStore((state) => state.setActivePage);
  const speakingKey = useSpeechStore((state) => state.speakingKey);
  const toggleSpeak = useSpeechStore((state) => state.toggle);
  const saveMessageToNotebook = useAskStore((state) => state.saveMessageToNotebook);
  const createPlanFromMessage = useAskStore((state) => state.createPlanFromMessage);
  const runActionSuggestion = useAskStore((state) => state.runActionSuggestion);
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
      {(suggestions || []).map((suggestion) => {
        const Icon = SUGGESTION_ICON[suggestion.kind];
        return (
          <button
            key={`${suggestion.kind}-${suggestion.label}`}
            type="button"
            onClick={() => runActionSuggestion(suggestion)}
            disabled={!canRequest}
            title={suggestion.prompt}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-primary/35 bg-primary/10 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon size={12} aria-hidden="true" /> {suggestion.label}
          </button>
        );
      })}
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
      <button
        type="button"
        onClick={() => navigate("build", { input: buildMessageHandoff("build", text, meta) })}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card/70 px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground"
        title="Build로 열기"
      >
        <Code2 size={12} aria-hidden="true" /> 빌드
      </button>
      <button
        type="button"
        onClick={() => navigate("automate", { input: buildMessageHandoff("automate", text, meta), create: true })}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card/70 px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground"
        title="자동화 초안 만들기"
      >
        <CalendarPlus size={12} aria-hidden="true" /> 루틴
      </button>
      <button
        type="button"
        onClick={() => navigate("ask", { input: buildMessageHandoff("compare", text, meta), mode: "compare" })}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-card/70 px-2 text-[11px] transition-colors hover:bg-accent hover:text-foreground"
        title="모델 비교로 열기"
      >
        <Scale size={12} aria-hidden="true" /> 비교
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

function useVoiceInput() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseDraftRef = useRef("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const setInput = useAskStore((state) => state.setInput);

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
      setInput([base, transcript].filter(Boolean).join(base && transcript ? " " : ""));
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

function formatTokenShort(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return String(value || 0);
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
  const normalizedProviderModel = safeProvider && safeModel ? `${safeProvider}:${safeModel}`.toLowerCase() : "";
  const metaLower = safeMeta.toLowerCase();
  const metaIsCovered = !safeMeta
    || metaLower === normalizedProviderModel
    || metaLower === safeRoute.toLowerCase()
    || metaLower === `${source || ""}:user`;
  const badges = [
    { key: "source", label: sourceLabel },
    safeProvider ? { key: "provider", label: safeProvider } : null,
    safeModel ? { key: "model", label: safeModel } : null,
    safeRoute && safeRoute !== safeProvider && safeRoute !== safeModel ? { key: "route", label: safeRoute } : null,
    grounded ? { key: "web", label: citationCount && citationCount > 0 ? `Web ${citationCount}` : "Web" } : null,
    !metaIsCovered ? { key: "meta", label: safeMeta } : null
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  if (badges.length === 0) return null;
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

function MessageBubble({
  messageKey,
  messageIndex,
  role,
  text,
  meta,
  tokenUsage,
  canRequest,
  provider,
  model,
  route,
  source,
  grounded,
  citationCount,
  actionSuggestions
}: {
  messageKey: string;
  messageIndex: number;
  role: string;
  text: string;
  meta?: string;
  tokenUsage?: AskTokenUsage | null;
  canRequest: boolean;
  provider?: string;
  model?: string;
  route?: string;
  source?: "dashboard" | "telegram" | "system";
  grounded?: boolean;
  citationCount?: number;
  actionSuggestions?: AskActionSuggestion[];
}) {
  const safeMeta = meta || "";
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
          <MessageMetaStrip role={role} meta={safeMeta} provider={provider} model={model} route={route} source={source} grounded={grounded} citationCount={citationCount} inverse />
          {text}
        </div>
      </div>
    );
  }
  if (role === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[92%] rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <MessageMetaStrip role={role} meta={safeMeta || "system"} provider={provider} model={model} route={route} source={source || "system"} grounded={grounded} citationCount={citationCount} />
          <MarkdownMessage text={text} />
          <TokenUsageBadge usage={tokenUsage} />
          <MessageActions messageKey={messageKey} messageIndex={messageIndex} text={text} meta={safeMeta} canRequest={canRequest} suggestions={actionSuggestions} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="prose-omnux max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2">
        <MessageMetaStrip role={role} meta={safeMeta} provider={provider} model={model} route={route} source={source} grounded={grounded} citationCount={citationCount} />
        <MarkdownMessage text={text} />
        <TokenUsageBadge usage={tokenUsage} />
        <MessageActions messageKey={messageKey} messageIndex={messageIndex} text={text} meta={safeMeta} canRequest={canRequest} suggestions={actionSuggestions} />
      </div>
    </div>
  );
}

function formatTime(value: string) {
  const parsed = new Date(value || "");
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function ragTone(value: string): "success" | "warning" | "destructive" | "primary" | "default" | "outline" {
  const normalized = value.toLowerCase();
  if (/(recommended|hybrid|memory|code|web|session|repomap)/.test(normalized)) return "primary";
  if (/(none|no_retrieval|skipped)/.test(normalized)) return "outline";
  if (/(blocked|error|fail)/.test(normalized)) return "destructive";
  if (/(warn|pending)/.test(normalized)) return "warning";
  if (/(ready|ok)/.test(normalized)) return "success";
  return "default";
}

type ChoiceOption = {
  value: string;
  label: string;
  description?: string;
  prefix?: ReactNode;
  disabled?: boolean;
};

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
      if (event.key === "Escape") {
        setOpen(false);
      }
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
        <div className="absolute left-0 top-full z-[70] mt-1 w-full min-w-[240px] max-w-[520px] rounded-lg border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-2xl">
          {searchable ? (
            <div className="relative mb-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="h-8 pl-8 text-xs"
                value={query}
                placeholder="모델 검색"
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
              />
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
            {visibleOptions.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">일치하는 모델 없음</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function orderedProviders(priority: ModelProviderId[]): AskModelProvider[] {
  const allowed = new Set<string>(PROVIDER_KEYS);
  const result = priority.filter((provider): provider is AskModelProvider => allowed.has(provider));
  for (const provider of PROVIDER_KEYS) {
    if (!result.includes(provider)) result.push(provider);
  }
  return result;
}

function providerOptions(includeAuto: boolean, priority: ModelProviderId[]): ChoiceOption[] {
  const labels = new Map(ASK_PROVIDER_OPTIONS.map((option) => [option.value, option.label]));
  const options = orderedProviders(priority).map((provider) => ({
    value: provider,
    label: labels.get(provider) || PROVIDER_LABEL[provider]
  }));
  return includeAuto ? [{ value: "auto", label: labels.get("auto") || "자동" }, ...options] : options;
}

const SUGGESTED_PROMPTS: Array<{ label: string; text: string; mode: AskChatMode; attachment?: boolean }> = [
  {
    label: "요약",
    text: "현재 작업 맥락을 초보자도 이해할 수 있게 핵심만 요약해줘.",
    mode: "single"
  },
  {
    label: "리뷰",
    text: "아래 변경 내용을 기준으로 버그, 회귀 위험, 빠진 검증을 먼저 찾아줘.",
    mode: "orchestration"
  },
  {
    label: "관점 비교",
    text: "이 문제를 여러 관점으로 나누어 보고 가장 실용적인 결론을 골라줘.",
    mode: "multi"
  },
  {
    label: "파일 분석",
    text: "첨부한 파일의 핵심 내용, 위험 신호, 다음 액션을 정리해줘.",
    mode: "single",
    attachment: true
  }
];

function modelDescription(provider: AskModelProvider, model: string) {
  if (model === NONE_MODEL) return "이 제공자 워커를 요청에서 제외합니다.";
  if (provider === "copilot" && /^claude|^gemini|^grok/i.test(model)) return "Copilot CLI 카탈로그";
  if (/preview/i.test(model)) return "preview";
  if (/mini|lite|flash/i.test(model)) return "빠른 응답";
  return PROVIDER_LABEL[provider];
}

function modelChoiceOptions(provider: AskModelProvider, catalogs: Record<AskModelProvider, string[]>, value: string, worker: boolean, allowNone: boolean): ChoiceOption[] {
  const options: ChoiceOption[] = [
    { value: "", label: worker ? "기본값" : "기본 모델", description: `${PROVIDER_LABEL[provider]} 기본 라우팅 사용` }
  ];
  if (allowNone) {
    options.push({ value: NONE_MODEL, label: "선택 안 함", description: `${PROVIDER_LABEL[provider]} 워커 비활성화` });
  }
  for (const model of modelOptionsForProvider(provider, catalogs)) {
    options.push({ value: model, label: model, description: modelDescription(provider, model) });
  }
  if (value && !options.some((option) => option.value === value)) {
    options.push({ value, label: value, description: "현재 선택값" });
  }
  return options;
}

function ChatModeSegmentedControl() {
  const store = useAskStore();
  const modes: Array<{ value: typeof store.chatMode; label: string; title: string }> = [
    { value: "single", label: "단일", title: "단일 모델" },
    { value: "orchestration", label: "흐름", title: "오케스트레이션" },
    { value: "multi", label: "비교", title: "다중 비교" }
  ];
  return (
    <div className="flex shrink-0 rounded-md border border-border bg-card/60 p-0.5 shadow-sm" role="radiogroup" aria-label="대화 모드">
      {modes.map((mode) => {
        const active = store.chatMode === mode.value;
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
            onClick={() => store.setChatMode(mode.value)}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelSelect({
  provider,
  label,
  compact = false,
  worker = false,
  allowNone = false
}: {
  provider: AskModelProvider;
  label?: string;
  compact?: boolean;
  worker?: boolean;
  allowNone?: boolean;
}) {
  const store = useAskStore();
  const value = (worker ? store.workerModels[provider] : store.selectedModels[provider]) || "";
  const options = modelChoiceOptions(provider, store.modelCatalogs, value, worker, allowNone);
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
  value: string;
  includeAuto: boolean;
  onChange: (value: string) => void;
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
      onChange={onChange}
    />
  );
}

function WorkerModelStrip() {
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  const providers = orderedProviders(priority);
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-2">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <SlidersHorizontal size={13} className="shrink-0" aria-hidden="true" />
        <span className="truncate">워커/비교 모델</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {providers.map((provider) => (
          <ModelSelect key={provider} provider={provider} worker allowNone compact={false} />
        ))}
      </div>
    </div>
  );
}

function ConversationMetaPanel({ canRequest }: { canRequest: boolean }) {
  const store = useAskStore();
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Info size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">대화 정보</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="정보 패널 닫기" onClick={() => store.setSidePanel(null)}>
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block min-w-0 space-y-1 md:col-span-2">
          <span className="text-xs font-semibold text-muted-foreground">대화방 이름</span>
          <Input value={store.metaDraft.title} placeholder="대화 제목" onChange={(event) => store.patchMetaDraft({ title: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">폴더명</span>
          <Input value={store.metaDraft.project} placeholder="기본" onChange={(event) => store.patchMetaDraft({ project: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">카테고리</span>
          <Input value={store.metaDraft.category} placeholder="일반" onChange={(event) => store.patchMetaDraft({ category: event.target.value })} />
        </label>
        <label className="block min-w-0 space-y-1 md:col-span-2">
          <span className="text-xs font-semibold text-muted-foreground">태그명</span>
          <Input value={store.metaDraft.tags} placeholder="쉼표로 구분" onChange={(event) => store.patchMetaDraft({ tags: event.target.value })} />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          <Badge tone="outline" className="max-w-[180px] truncate"><Folder size={11} aria-hidden="true" /> {store.metaDraft.project || "기본"}</Badge>
          <Badge tone="outline" className="max-w-[180px] truncate"><Tag size={11} aria-hidden="true" /> {store.metaDraft.category || "일반"}</Badge>
        </div>
        <Button variant="primary" size="sm" onClick={store.saveConversationMeta} disabled={!canRequest || !store.activeConversationId}>
          <Save size={14} aria-hidden="true" /> 메타 저장
        </Button>
      </div>
    </div>
  );
}

function MemoryDock({ canRequest }: { canRequest: boolean }) {
  const store = useAskStore();
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Database size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">공유 메모리</span>
          <Badge tone="outline">{store.memoryNotes.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="메모리 패널 닫기" onClick={() => store.setSidePanel(null)}>
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
        <Button variant="destructive" size="sm" onClick={store.clearScopeMemory} disabled={!canRequest || store.loadingConversations || store.loadingMemoryNotes}>
          <Trash2 size={14} aria-hidden="true" /> 대화 메모리 초기화
        </Button>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
        <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
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
            <EmptyState icon={Database} title="메모리 없음" description="대화에서 수동 생성하면 공유 메모리 노트가 표시됩니다." className="py-6" />
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
    </div>
  );
}

function ModelDock() {
  const store = useAskStore();
  const priority = useDesktopPreferenceStore((state) => state.modelProviderPriority);
  const providers = orderedProviders(priority);
  return (
    <div className="rounded-lg border border-border bg-muted/25 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-sm font-semibold">모델 선택</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={store.loadModelCatalogs}>
            <RefreshCw size={14} aria-hidden="true" /> 카탈로그
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="모델 패널 닫기" onClick={() => store.setSidePanel(null)}>
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <SlidersHorizontal size={13} aria-hidden="true" /> 응답 모델
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <ModelSelect key={provider} provider={provider} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <BrainCircuit size={13} aria-hidden="true" /> 워커/비교 모델
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((provider) => (
            <ModelSelect key={provider} provider={provider} worker allowNone />
          ))}
        </div>
      </div>
    </div>
  );
}

/* 점진 노출용 보조 도구 메뉴 항목 — 한 줄, 차분한 톤(아이콘 + 라벨 + 활성 체크). */
function ToolMenuItem({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check size={13} className="shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

/* 컴포저 pill 내부의 둥근 아이콘 버튼 — 홈 HeroComposer와 동일한 조작 단위. */
function ComposerRoundButton({
  icon: Icon,
  label,
  active = false,
  pulse = false,
  disabled = false,
  className,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  pulse?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40",
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        className
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {pulse ? <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" aria-hidden="true" /> : null}
    </button>
  );
}

export function AskPage() {
  useAskPageBridge();
  const visionFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoSpeakKeyRef = useRef<string | null>(null);
  const [multiIndex, setMultiIndex] = useState(0);
  const [headerToolsOpen, setHeaderToolsOpen] = useState(false);
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const headerToolsRef = useRef<HTMLDivElement>(null);
  const composerToolsRef = useRef<HTMLDivElement>(null);
  const voiceInput = useVoiceInput();
  const autoSpeak = useSpeechStore((state) => state.autoSpeak);
  const toggleAutoSpeak = useSpeechStore((state) => state.toggleAutoSpeak);
  const shortcuts = useDesktopPreferenceStore((state) => state.shortcuts);
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const routePayload = useDesktopNavigationStore((state) => state.routePayload);
  const routeVersion = useDesktopNavigationStore((state) => state.routeVersion);
  const clearRoutePayload = useDesktopNavigationStore((state) => state.clearRoutePayload);
  const store = useAskStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const context = store.conversationContext;
  const displayedConversations = store.searchQuery
    ? uniqueConversations(store.searchResults
        .map((item) => defaultConversationFromSearch(item, store.conversations.find((conversation) => conversation.id === item.conversationId)))
        .filter((item) => item.id))
    : store.conversations;
  const conversationGroups = groupConversations(displayedConversations);
  const currentProvider = store.provider !== "auto" ? store.provider : "groq";
  const activeModelProvider = currentProvider as AskModelProvider;
  const canSend = canRequest && !store.pending && (!!store.input.trim() || store.attachments.length > 0);
  const selectedConversationCount = store.selectedConversationIds.length;
  const activeConversationTitle =
    store.conversations.find((conversation) => conversation.id === store.activeConversationId)?.title
    || (store.activeConversationId ? "대화" : "새 대화");
  const secondaryPanelOpen = store.sidePanel !== null;

  const applySuggestedPrompt = (prompt: (typeof SUGGESTED_PROMPTS)[number]) => {
    store.setInput(prompt.text);
    store.setChatMode(prompt.mode);
    if (prompt.attachment) store.setAttachmentPanelOpen(true);
    window.setTimeout(() => composerTextareaRef.current?.focus(), 0);
  };

  const handleVisionFiles = async (files: FileList | null) => {
    try {
      const attachments = await filesToVisionAttachments(files);
      useAskStore.setState({
        visionFiles: attachments,
        visionPreflight: null,
        lastError: attachments.length > 0 ? null : "지원되는 이미지 파일을 선택하세요."
      });
    } catch (error) {
      useAskStore.setState({ lastError: error instanceof Error ? error.message : "이미지 파일을 읽지 못했다." });
    }
  };

  const handleAttachmentFiles = async (files: FileList | File[] | null) => {
    try {
      const result = await filesToAttachments(files, store.attachments.length);
      if (result.items.length > 0) {
        store.addAttachments(result.items);
      }
      if (result.error) {
        useAskStore.setState({ lastError: result.error });
      }
    } catch (error) {
      useAskStore.setState({ lastError: error instanceof Error ? error.message : "첨부 파일을 읽지 못했다." });
    }
  };

  const handleAttachmentDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    store.setAttachmentDragActive(false);
    void handleAttachmentFiles(event.dataTransfer.files);
  };

  useEffect(() => {
    if (canRequest) {
      store.loadConversations();
      store.loadMemoryNotes();
      store.loadModelCatalogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  useEffect(() => {
    if (!routePayload) return;
    const input = String(routePayload.input || "").trim();
    const mode = String(routePayload.mode || "").trim();
    if (mode === "compare" || mode === "multi") store.setChatMode("multi");
    else if (mode === "orchestration") store.setChatMode("orchestration");
    else if (mode === "single") store.setChatMode("single");
    if (input) store.setInput(input);
    if (routePayload.projectName || routePayload.projectKey) {
      store.patchMetaDraft({ project: String(routePayload.projectName || routePayload.projectKey || "") });
    }
    if (routePayload.openAttachmentPanel || mode === "file") {
      store.setAttachmentPanelOpen(true);
    }
    clearRoutePayload();
    window.setTimeout(() => composerTextareaRef.current?.focus(), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeVersion]);

  useEffect(() => {
    setMultiIndex(0);
  }, [store.multiResult]);

  useEffect(() => () => useSpeechStore.getState().stop(), []);

  // 도구 오버플로(헤더/컴포저)는 바깥 클릭·Esc 로 닫는다.
  useEffect(() => {
    if (!headerToolsOpen && !composerToolsOpen) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (headerToolsRef.current && !headerToolsRef.current.contains(target)) setHeaderToolsOpen(false);
      if (composerToolsRef.current && !composerToolsRef.current.contains(target)) setComposerToolsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHeaderToolsOpen(false);
        setComposerToolsOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [headerToolsOpen, composerToolsOpen]);

  // 입력 길이에 따라 컴포저가 아래로 자동 성장(최대 200px 후 스크롤) — 홈 컴포저와 동일.
  useLayoutEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [store.input]);

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "focusComposer") {
        composerTextareaRef.current?.focus();
      } else if (action === "newConversation") {
        if (canRequest) useAskStore.getState().createConversation();
      } else if (action === "searchConversations") {
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("omnux:shortcut", handleShortcut);
    return () => window.removeEventListener("omnux:shortcut", handleShortcut);
  }, [canRequest]);

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

  const multiProviders = store.multiResult?.providers ?? [];
  const activeMultiIndex = multiProviders.length > 0 ? Math.min(multiIndex, multiProviders.length - 1) : 0;
  const activeMultiProvider = multiProviders[activeMultiIndex];

  return (
    <div className="dashboard-tab worktab-root flex flex-col gap-4">
      <div className="worktab-header">
        <div className="min-w-0">
          <h1 className="worktab-title">질문</h1>
          <p className="worktab-subtitle">묻고, 저장하고, 다음 작업으로 넘깁니다.</p>
        </div>
      </div>

      {/* 모바일 pane 전환 (좁은 화면에서 보관함/대화 한 번에 하나만 표시) */}
      <div className="worktab-mobile-switch lg:hidden">
        {([["list", "보관함"], ["thread", "대화"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => store.setMobilePane(key)}
            className={cn(
              "flex-1 rounded px-2 py-1.5 font-medium transition-colors",
              store.mobilePane === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* 대화 목록 */}
        <div className={cn("flex min-h-0 flex-col", store.mobilePane === "list" ? "" : "hidden", "lg:flex")}>
        <CardBoundary title="메시지 보관함" card="navigation" onError={recordCardError}>
          {store.lastError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" className="flex-1" onClick={store.createConversation} disabled={!canRequest}>
              <Plus size={15} aria-hidden="true" /> 새 대화
            </Button>
            <Button
              variant={store.conversationSelectionMode ? "primary" : "outline"}
              size="sm"
              onClick={() => store.setConversationSelectionMode(!store.conversationSelectionMode)}
              disabled={!canRequest || displayedConversations.length === 0}
            >
              <Check size={15} aria-hidden="true" /> {store.conversationSelectionMode ? "해제" : "선택"}
            </Button>
            <Button variant="outline" size="icon" aria-label="새로고침" onClick={store.loadConversations} disabled={!canRequest}>
              <RefreshCw size={15} aria-hidden="true" />
            </Button>
          </div>

          {store.conversationSelectionMode ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2">
              <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                {selectedConversationCount > 0 ? `${selectedConversationCount}개 선택됨` : "삭제할 대화를 선택하세요."}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={store.clearConversationSelection} disabled={selectedConversationCount === 0}>
                  선택 해제
                </Button>
                <Button variant="destructive" size="sm" onClick={store.deleteSelectedConversations} disabled={!canRequest || selectedConversationCount === 0}>
                  <Trash2 size={14} aria-hidden="true" /> 일괄 삭제
                </Button>
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="relative min-w-0">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={searchInputRef}
                  className="pl-8"
                  value={store.searchInput}
                  placeholder="메시지 보관함 대화 검색"
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
                aria-label="대화 검색"
                title="대화 검색"
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
                    : "제목과 대화 본문을 검색합니다."}
              </span>
              {store.searchQuery ? (
                <button type="button" onClick={store.clearSearch} className="shrink-0 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground">
                  해제
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {conversationGroups.map((group) => {
              const expanded = store.folderOpenByName[group.folder] !== false;
              const groupIds = group.items.map((item) => item.id).filter(Boolean);
              const selectedInGroup = groupIds.filter((id) => store.selectedConversationIds.includes(id)).length;
              const groupSelected = groupIds.length > 0 && selectedInGroup === groupIds.length;
              return (
                <div key={group.folder} className="rounded-md border border-border bg-muted/20">
                  <div className="flex items-center gap-2 px-2.5 py-2 transition-colors duration-200 hover:bg-accent/60">
                    {store.conversationSelectionMode ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={groupSelected}
                        onChange={() => store.toggleConversationFolderSelection(group.items)}
                        aria-label={`${group.folder} 폴더 대화 선택`}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => store.toggleFolder(group.folder)}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <Folder size={14} className="shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.folder}</span>
                    </button>
                    {store.conversationSelectionMode && selectedInGroup > 0 ? <Badge tone="primary">{selectedInGroup}</Badge> : null}
                    <Badge tone="outline">{group.items.length}</Badge>
                  </div>
                  {expanded ? (
                    <div className="space-y-1 border-t border-border p-1.5">
                      {group.items.map((item) => {
                        const active = item.id === store.activeConversationId;
                        const selected = store.selectedConversationIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "group rounded-md border px-2 py-2 transition-colors duration-200",
                              active
                                ? "border-primary/40 bg-accent"
                                : selected
                                  ? "border-primary/40 bg-primary/10"
                                  : "border-transparent hover:bg-accent/60"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {store.conversationSelectionMode ? (
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                                  checked={selected}
                                  onChange={() => store.toggleConversationSelection(item.id)}
                                  aria-label={`${item.title} 대화 선택`}
                                />
                              ) : null}
                              <button
                                type="button"
                                className="flex min-w-0 flex-1 flex-col text-left"
                                onClick={() => store.conversationSelectionMode ? store.toggleConversationSelection(item.id) : store.openConversation(item)}
                                disabled={!canRequest}
                              >
                                <span className="truncate text-sm font-medium">{item.title}</span>
                                <span className="truncate text-[11px] text-muted-foreground">{item.preview || `${item.messageCount}개 메시지`}</span>
                                <span className="truncate text-[10px] text-muted-foreground">{formatTime(item.updatedUtc) || item.category || "대화"}</span>
                              </button>
                            </div>
                            <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
                              <Badge tone="outline" className="max-w-[120px] truncate">{item.category || "일반"}</Badge>
                              {item.tags.slice(0, 2).map((tag) => <Badge key={tag} tone="outline" className="max-w-[90px] truncate">{tag}</Badge>)}
                            </div>
                            {!store.conversationSelectionMode ? <div className="row-actions mt-1.5 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
                            </div> : null}
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
                title={store.searchQuery ? "검색 결과 없음" : "대화 없음"}
                description={store.searchQuery ? "다른 검색어로 다시 찾아보세요." : canRequest ? "새 대화를 시작해 보세요." : "미들웨어에 연결되면 대화가 표시됩니다."}
                action={store.searchQuery ? (
                  <Button variant="outline" size="sm" onClick={store.clearSearch}>
                    <X size={14} aria-hidden="true" /> 검색 해제
                  </Button>
                ) : canRequest ? (
                  <Button variant="primary" size="sm" onClick={store.createConversation}>
                    <Plus size={14} aria-hidden="true" /> 새 대화
                  </Button>
                ) : null}
              />
            ) : null}
          </div>

          <div className="border-t border-border pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>메모리</span>
              <span>{store.loadingMemoryNotes ? "조회 중" : `${store.memoryNotes.length}건`}</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {store.memoryNotes.slice(0, 3).map((note) => (
                <div key={note.name} className="rounded-md bg-muted/40 px-2 py-1.5">
                  <p className="truncate text-xs font-medium">{note.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{note.excerpt || "메모리 노트"}</p>
                </div>
              ))}
            </div>
          </div>
        </CardBoundary>
        </div>

        {/* 대화 본문 */}
        <div className={cn("flex min-h-0 flex-col", store.mobilePane === "thread" ? "" : "hidden", "lg:flex")}>
        <CardBoundary title="대화 본문" card="operations" onError={recordCardError}>
          {/* 대화 헤더 — 제목과 핵심 컨트롤(모드·모델)만 상시 노출, 보조 도구는 오버플로로 점진 노출 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold" title={activeConversationTitle}>{activeConversationTitle}</h2>
              {store.pending ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Spinner size={12} /> 생성 중
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <ChatModeSegmentedControl />
              {store.chatMode !== "multi" ? (
                <ProviderSelect
                  label={store.chatMode === "orchestration" ? "워커" : "모델"}
                  value={store.provider}
                  includeAuto={store.chatMode !== "single"}
                  ariaLabel="응답 제공자 선택"
                  onChange={(value) => store.setProvider(value as typeof store.provider)}
                />
              ) : null}
              {store.chatMode !== "multi" && store.provider !== "auto" ? <ModelSelect provider={activeModelProvider} compact /> : null}
              <input
                ref={visionFileInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  void handleVisionFiles(files);
                  event.currentTarget.value = "";
                }}
              />
              <div ref={headerToolsRef} className="relative">
                <Button
                  variant={secondaryPanelOpen || headerToolsOpen ? "primary" : "outline"}
                  size="sm"
                  aria-haspopup="menu"
                  aria-expanded={headerToolsOpen}
                  title="도구"
                  onClick={() => setHeaderToolsOpen((open) => !open)}
                >
                  <SlidersHorizontal size={14} aria-hidden="true" /> 도구
                </Button>
                {headerToolsOpen ? (
                  <div role="menu" className="absolute right-0 top-full z-[70] mt-1.5 w-60 rounded-xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-2xl">
                    {store.chatMode !== "single" ? (
                      <div className="px-0.5 pb-1.5">
                        <ProviderSelect
                          label="요약 모델"
                          value={store.summaryProvider}
                          includeAuto
                          ariaLabel="요약 제공자 선택"
                          onChange={(value) => store.setSummaryProvider(value as typeof store.summaryProvider)}
                        />
                      </div>
                    ) : null}
                    <ToolMenuItem icon={Info} label="대화 정보" active={store.sidePanel === "info"} onClick={() => store.setSidePanel(store.sidePanel === "info" ? null : "info")} />
                    <ToolMenuItem icon={Database} label="공유 메모리" active={store.sidePanel === "memory"} onClick={() => store.setSidePanel(store.sidePanel === "memory" ? null : "memory")} />
                    <ToolMenuItem icon={SlidersHorizontal} label="모델 선택" active={store.sidePanel === "models"} onClick={() => store.setSidePanel(store.sidePanel === "models" ? null : "models")} />
                    <ToolMenuItem icon={ClipboardList} label="문맥 가져오기" active={store.sidePanel === "context"} onClick={() => store.setSidePanel(store.sidePanel === "context" ? null : "context")} />
                    <div className="my-1 border-t border-border" />
                    <ToolMenuItem icon={BrainCircuit} label={store.ragPending ? "검색 점검 중…" : "검색 점검"} disabled={!canRequest || store.ragPending || !store.input.trim()} onClick={() => { store.runRagPreflight(); setHeaderToolsOpen(false); }} />
                    <ToolMenuItem icon={Paperclip} label="이미지 첨부" onClick={() => { visionFileInputRef.current?.click(); setHeaderToolsOpen(false); }} />
                    <ToolMenuItem icon={FileImage} label={store.visionPending ? "이미지 점검 중…" : store.visionFiles.length > 0 ? `이미지 점검 (${store.visionFiles.length})` : "이미지 점검"} disabled={!canRequest || store.visionPending || store.visionFiles.length === 0} onClick={() => { store.runVisionPreflight(); setHeaderToolsOpen(false); }} />
                    {isSpeechSupported() ? (
                      <>
                        <div className="my-1 border-t border-border" />
                        <ToolMenuItem icon={autoSpeak ? Volume2 : VolumeX} label={autoSpeak ? "자동 읽기 켜짐" : "자동 읽기 꺼짐"} active={autoSpeak} onClick={toggleAutoSpeak} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {store.chatMode !== "single" ? <WorkerModelStrip /> : null}
          {store.sidePanel === "info" ? <ConversationMetaPanel canRequest={canRequest} /> : null}
          {store.sidePanel === "memory" ? <MemoryDock canRequest={canRequest} /> : null}
          {store.sidePanel === "models" ? <ModelDock /> : null}
          {store.sidePanel === "context" ? (
            <ContextPickerPanel
              canRequest={canRequest}
              surface="ask"
              applyLabel="입력에 붙이기"
              onApply={(items) => useAskStore.getState().setInput(appendContextSelectionBundle(useAskStore.getState().input, items))}
            />
          ) : null}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {context.linkedMemoryNotes.length > 0 || context.compressionEvents.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {context.linkedMemoryNotes.slice(0, 4).map((name) => <Badge key={name} tone="outline" className="max-w-full truncate">{name}</Badge>)}
                  {context.linkedMemoryNotes.length > 4 ? <Badge tone="outline">+{context.linkedMemoryNotes.length - 4}</Badge> : null}
                  {context.compressionEvents.slice(0, 2).map((event) => <Badge key={`${event.createdUtc}-${event.preview}`} tone="warning">auto-compress</Badge>)}
                </div>
                {context.compressionEvents[0] ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{context.compressionEvents[0].preview || "이전 대화가 압축 요약으로 보존되었습니다."}</p>
                ) : null}
              </div>
            ) : null}
            {store.ragPreflight ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ragTone(store.ragPreflight.status)}>{store.ragPreflight.status || "preflight"}</Badge>
                      <Badge tone={ragTone(store.ragPreflight.primaryStrategy)}>{store.ragPreflight.primaryStrategy || "none"}</Badge>
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
                        <Badge tone={ragTone(candidate.priority)}>{candidate.suggestedRequestType || candidate.priority}</Badge>
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
                  {store.ragPreflight.candidates.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">검색 후보 없음</p> : null}
                </div>
                {store.ragPreflight.signals.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {store.ragPreflight.signals.slice(0, 6).map((signal) => <Badge key={signal} tone="outline">{signal}</Badge>)}
                  </div>
                ) : null}
                {store.ragExecution ? (
                  <div className="mt-2 rounded-md border border-border bg-background/50 p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={ragTone(store.ragExecution.status)}>{store.ragExecution.status}</Badge>
                      <Badge tone="outline">{store.ragExecution.requestType}</Badge>
                      <Badge tone={ragTone(store.ragExecution.kind)}>{store.ragExecution.kind}</Badge>
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
                              {item.badges?.slice(0, 3).map((badge) => <Badge key={badge} tone="outline">{badge}</Badge>)}
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
                      {!store.ragExecution.loading && store.ragExecution.items.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">조회 결과 없음</p> : null}
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
            ) : null}
            <AskVisionPanel files={store.visionFiles} preflight={store.visionPreflight} pending={store.visionPending} onClear={store.clearVisionPreflight} />
            {store.pending && store.activeConversationId && store.messages.length === 0 ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-border bg-muted/25">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner size={16} /> 대화 기록을 불러오는 중
                </div>
              </div>
            ) : null}
            {store.messages.map((message, index) => (
              <MessageBubble
                key={`${index}-${message.role}`}
                messageKey={`${store.activeConversationId || "new"}-${index}`}
                messageIndex={index}
                role={message.role}
                text={message.text}
                meta={message.meta}
                tokenUsage={message.tokenUsage}
                canRequest={canRequest}
                provider={message.provider}
                model={message.model}
                route={message.route}
                source={message.source}
                grounded={message.grounded}
                citationCount={message.citationCount}
                actionSuggestions={message.actionSuggestions}
              />
            ))}
            {store.messages.length === 0 && !(store.pending && store.activeConversationId) ? (
              <EmptyState
                icon={Send}
                title="확인할 내용"
                description="짧게 묻고, 필요하면 문맥·파일·메모리를 붙입니다."
                action={(
                  <div className="flex max-w-xl flex-col items-center gap-2">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {SUGGESTED_PROMPTS.map((prompt) => (
                        <button
                          key={prompt.label}
                          type="button"
                          onClick={() => applySuggestedPrompt(prompt)}
                          className="rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          {prompt.label}
                        </button>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => composerTextareaRef.current?.focus()}>
                      <Send size={14} aria-hidden="true" /> 입력하기
                    </Button>
                  </div>
                )}
              />
            ) : null}

            {store.multiResult ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                {store.multiResult.summary ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">공통 요약</p>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(store.multiResult?.summary || "")} className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="요약 복사">
                        <Copy size={12} aria-hidden="true" /> 복사
                      </button>
                    </div>
                    <p className="prose-omnux mt-1 text-sm">{store.multiResult.summary}</p>
                  </div>
                ) : null}
                {multiProviders.length > 0 && activeMultiProvider ? (
                  <div className="rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{activeMultiProvider.label}</span>
                        <Badge tone="primary" className="max-w-[160px] truncate font-mono">{activeMultiProvider.model || "model -"}</Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => navigator.clipboard?.writeText(activeMultiProvider.text || "")} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="복사">
                          <Copy size={12} aria-hidden="true" /> 복사
                        </button>
                        <Button variant="outline" size="icon" className="h-7 w-7" aria-label="이전 모델" onClick={() => setMultiIndex((index) => (index - 1 + multiProviders.length) % multiProviders.length)} disabled={multiProviders.length < 2}>
                          <ChevronLeft size={14} aria-hidden="true" />
                        </Button>
                        <span className="text-[11px] tabular-nums text-muted-foreground">{activeMultiIndex + 1}/{multiProviders.length}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" aria-label="다음 모델" onClick={() => setMultiIndex((index) => (index + 1) % multiProviders.length)} disabled={multiProviders.length < 2}>
                          <ChevronRight size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                    <div className="prose-omnux mt-1.5 text-sm text-muted-foreground">
                      <MarkdownMessage text={activeMultiProvider.text || "응답 없음"} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "space-y-2 border-t border-border pt-3",
              store.attachmentDragActive && "rounded-lg bg-primary/10 ring-2 ring-primary/35"
            )}
            onDragEnter={(event) => {
              if (!hasDraggedFiles(event.dataTransfer)) return;
              event.preventDefault();
              store.setAttachmentDragActive(true);
              store.setAttachmentPanelOpen(true);
            }}
            onDragOver={(event) => {
              if (!hasDraggedFiles(event.dataTransfer)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDragLeave={() => store.setAttachmentDragActive(false)}
            onDrop={handleAttachmentDrop}
          >
            {voiceInput.error ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{voiceInput.error}</p>
            ) : null}
            {(store.attachmentPanelOpen || store.attachments.length > 0 || store.attachmentDragActive) ? (
              <div className="rounded-lg border border-border bg-muted/25 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip size={14} aria-hidden="true" />
                    <span className="truncate">{store.attachmentDragActive ? "여기에 파일을 놓으세요" : `첨부 ${store.attachments.length}개`}</span>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={() => attachmentFileInputRef.current?.click()}>
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
                    {store.attachments.map((file) => (
                      <span key={`${file.name}-${file.sizeBytes}`} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px]">
                        <FileText size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="max-w-[180px] truncate">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                        <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => store.removeAttachment(file.name)} aria-label={`${file.name} 첨부 제거`}>
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <input
              ref={attachmentFileInputRef}
              className="sr-only"
              type="file"
              multiple
              onChange={(event) => {
                void handleAttachmentFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
            {/* 입력 pill — 홈 HeroComposer와 동일한 조작 단위(라운드 버튼·자동 성장·점진 노출) */}
            <Card className="!rounded-3xl !bg-card/60 overflow-visible transition-all duration-300 focus-within:!bg-card focus-within:shadow-xl">
              <div className="flex items-end gap-1 py-2 pl-2 pr-2">
                <div ref={composerToolsRef} className="relative shrink-0 self-center">
                  <ComposerRoundButton
                    icon={Plus}
                    label="추가 작업"
                    active={composerToolsOpen}
                    className={cn("transition-transform duration-300", composerToolsOpen && "rotate-45")}
                    onClick={() => setComposerToolsOpen((open) => !open)}
                  />
                  {composerToolsOpen ? (
                    <div role="menu" className="absolute bottom-full left-0 z-[70] mb-2 w-52 rounded-xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-2xl">
                      <ToolMenuItem
                        icon={Paperclip}
                        label={store.attachments.length > 0 ? `첨부 (${store.attachments.length})` : "파일 첨부"}
                        active={store.attachmentPanelOpen}
                        onClick={() => { store.setAttachmentPanelOpen(!store.attachmentPanelOpen); setComposerToolsOpen(false); }}
                      />
                      <ToolMenuItem
                        icon={CalendarPlus}
                        label="루틴으로 저장"
                        disabled={!canRequest || store.input.trim().length < 5}
                        onClick={() => { store.saveInputAsRoutine(); setComposerToolsOpen(false); }}
                      />
                      <ToolMenuItem
                        icon={ClipboardList}
                        label="작업계획 만들기"
                        disabled={!canRequest || store.input.trim().length < 5}
                        onClick={() => { store.createPlanFromInput(); setComposerToolsOpen(false); }}
                      />
                    </div>
                  ) : null}
                </div>

                <textarea
                  ref={composerTextareaRef}
                  aria-label="메시지 입력"
                  rows={1}
                  value={store.input}
                  placeholder="무엇을 도와드릴까요?  ·  Enter 전송, Shift+Enter 줄바꿈"
                  className="block max-h-[200px] min-h-[24px] min-w-0 flex-1 resize-none self-center whitespace-pre-wrap break-keep bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none [overflow-wrap:anywhere]"
                  onChange={(event) => useAskStore.setState({ input: event.target.value })}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" && !event.shiftKey) || shortcutMatches(event.nativeEvent, shortcuts.send) || ((event.metaKey || event.ctrlKey) && event.key === "Enter")) {
                      event.preventDefault();
                      if (canSend) store.sendMessage();
                    }
                  }}
                />

                {voiceInput.supported ? (
                  <ComposerRoundButton
                    icon={voiceInput.active ? MicOff : Mic}
                    label={voiceInput.active ? "음성 입력 중지" : "음성 입력"}
                    active={voiceInput.active}
                    pulse={voiceInput.active}
                    disabled={store.pending && !voiceInput.active}
                    onClick={() => voiceInput.toggle(store.input)}
                  />
                ) : null}
                <ComposerRoundButton
                  icon={SlidersHorizontal}
                  label="확장 추론 (Think+)"
                  active={store.thinkPlus}
                  onClick={() => store.setThinkPlus(!store.thinkPlus)}
                />
                <button
                  type="button"
                  onClick={store.sendMessage}
                  disabled={!canSend}
                  aria-label="전송"
                  title="전송 (Enter)"
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-transparent text-primary/80 transition-all duration-300 hover:!bg-primary hover:text-primary-foreground active:scale-95 disabled:opacity-40"
                >
                  <Send size={16} aria-hidden="true" />
                </button>
              </div>
            </Card>
          </div>
        </CardBoundary>
        </div>
      </section>
    </div>
  );
}
