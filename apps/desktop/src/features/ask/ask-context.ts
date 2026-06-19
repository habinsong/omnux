export type AskTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: string;
};

export type AskActionSuggestion = {
  kind: "plan" | "routine" | "agent";
  label: string;
  prompt: string;
  /** routine 카드에서 자연어 스케줄 파싱이 성공했을 때만 — create_routine 에 그대로 사용. */
  scheduleKind?: "daily" | "weekly" | "monthly";
  scheduleTime?: string;
  /** DayOfWeek 정수(0=일 … 6=토). */
  scheduleWeekdays?: number[];
  scheduleDayOfMonth?: number;
};

/** 웹검색 근거 — llm_chat_result.citations 원소. 제목/URL/스니펫으로 출처 카드를 만든다. */
export type AskCitation = {
  id: string;
  title: string;
  url: string;
  published: string;
  snippet: string;
  sourceType: string;
};

/** 인용 무결성 요약 — 문장 중 몇 개가 출처 태깅됐는지. */
export type AskCitationValidation = {
  totalSentences: number;
  taggedSentences: number;
  missingSentences: number;
  unknownCitationSentences: number;
  passed: boolean;
};

/** 응답 지연 메트릭 — 첫 토큰까지 시간(FirstChunkMs) 등 관찰용. */
export type AskLatency = {
  decisionMs: number;
  promptBuildMs: number;
  firstChunkMs: number;
  fullResponseMs: number;
  sanitizeMs: number;
  decisionPath: string;
};

/** 가드/재시도 상태 — 결과가 가드 사유나 재시도와 함께 왔을 때만 채워진다. */
export type AskGuardInfo = {
  category: string;
  reason: string;
  detail: string;
  retryRequired: boolean;
  retryAttempt: number;
  retryMaxAttempts: number;
  retryStopReason: string;
};

/** 턴 단위 자동 저장 결과 — 노트북/메모리 저장 확인 칩에 사용. */
export type AskResponseNote = {
  kind: "notebook" | "memory";
  ok: boolean;
  label: string;
};

/** 자동검색 단계 — 메모리/웹 검색이 무엇을 실행·주입했는지(읽기 전용 노출). */
export type AskRetrievalStep = {
  tool: string;       // memory_search | memory_get | web_search
  status: string;     // ok | skip | disabled | error
  skipReason: string; // - | casual_query | llm_not_required | web_disabled_by_user ...
  result: string;     // "2/4" | 건수 | "1"/"0"
  detail: string;
  injected: boolean;
};

/** Self-RAG 자동주입 트레이스 — 이번 턴 자동 메모리/웹 검색이 무엇을 찾아 주입했는지 요약. */
export type AskRetrievalTrace = {
  webDecision: string;
  memoryInjected: boolean;
  webInjected: boolean;
  steps: AskRetrievalStep[];
};

export type AskMessage = {
  role: "user" | "ai" | "system";
  text: string;
  meta: string;
  createdUtc: string;
  tokenUsage: AskTokenUsage | null;
  provider: string;
  model: string;
  route: string;
  source: "dashboard" | "telegram" | "system";
  grounded: boolean;
  citationCount: number;
  /** P0-6 제안 카드 — 서버가 입력 의도에서 감지해 최신 응답에만 첨부. */
  actionSuggestions?: AskActionSuggestion[];
  /** llm_chat_result 봉투에서 최신 AI 답변에만 첨부되는 보강 정보. */
  citations?: AskCitation[];
  citationValidation?: AskCitationValidation | null;
  latency?: AskLatency | null;
  guard?: AskGuardInfo | null;
  responseNotes?: AskResponseNote[];
  retrievalTrace?: AskRetrievalTrace | null;
};

export type AskConversationContext = {
  linkedMemoryNotes: string[];
  tokenUsageTotal: AskTokenUsage | null;
  compressionEvents: Array<{ createdUtc: string; preview: string }>;
};

export function emptyAskContext(): AskConversationContext {
  return { linkedMemoryNotes: [], tokenUsageTotal: null, compressionEvents: [] };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function field(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}

function textFromPayload(payload: Record<string, unknown>): string {
  const value = field(payload, "text", "Text", "content", "Content", "message", "Message", "body", "Body");
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        const partRecord = record(part);
        return String(field(partRecord, "text", "Text", "content", "Content") || "");
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function tokenUsage(value: unknown): AskTokenUsage | null {
  const payload = record(value);
  const totalTokens = Number(field(payload, "totalTokens", "TotalTokens") || 0);
  if (!totalTokens) return null;
  return {
    promptTokens: Number(field(payload, "promptTokens", "PromptTokens") || 0),
    completionTokens: Number(field(payload, "completionTokens", "CompletionTokens") || 0),
    totalTokens,
    source: String(field(payload, "source", "Source") || "unknown")
  };
}

function parseMessageMeta(meta: string, role: string) {
  const normalized = meta.trim();
  const lower = normalized.toLowerCase();
  const source = role === "system"
    ? "system"
    : lower.startsWith("telegram") || lower.includes(":telegram")
      ? "telegram"
      : "dashboard";
  const grounded = /web|url|ground|citation|검색|근거/.test(lower);
  const result = {
    provider: "",
    model: "",
    route: "",
    source: source as "dashboard" | "telegram" | "system",
    grounded,
    citationCount: 0
  };
  if (!normalized) return result;

  const parts = normalized.split(":").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.startsWith("telegram")) {
    result.route = parts[0] || "";
    if (parts[0] === "telegram-user" || parts[0] === "telegram" || parts[1] === "user") return result;
    if (parts[0] === "telegram-single") {
      result.provider = parts[1] || "";
      result.model = parts[2] || "";
      result.route = parts.slice(3).join(":") || parts[0];
      return result;
    }
    if (parts.length > 1) {
      result.route = parts.slice(1).join(":") || parts[0];
    }
    return result;
  }

  if (parts.length >= 2 && /^(groq|gemini|cerebras|nvidia|copilot|codex)$/i.test(parts[0])) {
    result.provider = parts[0];
    result.model = parts.slice(1).join(":");
    return result;
  }

  if (/^(gemini|groq|cerebras|nvidia|copilot|codex)[-_]/i.test(normalized)) {
    result.provider = normalized.split(/[-_:]/)[0] || "";
    result.route = normalized;
    return result;
  }

  result.route = normalized;
  return result;
}

export function normalizeAskMessage(message: unknown): AskMessage {
  const payload = record(message);
  const role = String(field(payload, "role", "Role") || "").toLowerCase();
  const normalizedRole = role === "user" ? "user" : role === "system" ? "system" : "ai";
  const meta = String(field(payload, "meta", "Meta") || "");
  const parsedMeta = parseMessageMeta(meta, normalizedRole);
  return {
    role: normalizedRole,
    text: textFromPayload(payload),
    meta,
    createdUtc: String(field(payload, "createdUtc", "CreatedUtc") || ""),
    tokenUsage: tokenUsage(field(payload, "tokenUsage", "TokenUsage")),
    provider: String(field(payload, "provider", "Provider") || parsedMeta.provider),
    model: String(field(payload, "model", "Model") || parsedMeta.model),
    route: String(field(payload, "route", "Route") || parsedMeta.route),
    source: parsedMeta.source,
    grounded: Boolean(field(payload, "grounded", "Grounded") || parsedMeta.grounded),
    citationCount: Number(field(payload, "citationCount", "CitationCount") || parsedMeta.citationCount || 0)
  };
}

export function normalizeCitations(value: unknown): AskCitation[] {
  if (!Array.isArray(value)) return [];
  const result: AskCitation[] = [];
  for (const item of value) {
    const payload = record(item);
    const citation: AskCitation = {
      id: String(field(payload, "citationId", "CitationId", "id", "Id") || ""),
      title: String(field(payload, "title", "Title") || "").trim(),
      url: String(field(payload, "url", "Url") || "").trim(),
      published: String(field(payload, "published", "Published") || "").trim(),
      snippet: String(field(payload, "snippet", "Snippet") || "").trim(),
      sourceType: String(field(payload, "sourceType", "SourceType") || "").trim()
    };
    if (citation.title || citation.url || citation.snippet) result.push(citation);
  }
  return result;
}

export function normalizeCitationValidation(value: unknown): AskCitationValidation | null {
  if (!value || typeof value !== "object") return null;
  const payload = record(value);
  const total = Number(field(payload, "totalSentences", "TotalSentences") || 0);
  const tagged = Number(field(payload, "taggedSentences", "TaggedSentences") || 0);
  const missing = Number(field(payload, "missingSentences", "MissingSentences") || 0);
  const unknown = Number(field(payload, "unknownCitationSentences", "UnknownCitationSentences") || 0);
  if (!total && !tagged && !missing && !unknown) return null;
  return {
    totalSentences: total,
    taggedSentences: tagged,
    missingSentences: missing,
    unknownCitationSentences: unknown,
    passed: Boolean(field(payload, "passed", "Passed"))
  };
}

export function normalizeLatency(value: unknown): AskLatency | null {
  if (!value || typeof value !== "object") return null;
  const payload = record(value);
  const latency: AskLatency = {
    decisionMs: Number(field(payload, "decisionMs", "DecisionMs") || 0),
    promptBuildMs: Number(field(payload, "promptBuildMs", "PromptBuildMs") || 0),
    firstChunkMs: Number(field(payload, "firstChunkMs", "FirstChunkMs") || 0),
    fullResponseMs: Number(field(payload, "fullResponseMs", "FullResponseMs") || 0),
    sanitizeMs: Number(field(payload, "sanitizeMs", "SanitizeMs") || 0),
    decisionPath: String(field(payload, "decisionPath", "DecisionPath") || "").trim()
  };
  if (!latency.firstChunkMs && !latency.fullResponseMs && !latency.decisionMs && !latency.decisionPath) return null;
  return latency;
}

export function normalizeGuardInfo(payload: Record<string, unknown>): AskGuardInfo | null {
  // 백엔드는 값 없음을 "-" 센티넬로 보낸다 → 빈 값으로 취급.
  const clean = (value: unknown): string => {
    const text = String(value || "").trim();
    return text === "-" ? "" : text;
  };
  const category = clean(field(payload, "guardCategory", "GuardCategory"));
  const reason = clean(field(payload, "guardReason", "GuardReason"));
  const detail = clean(field(payload, "guardDetail", "GuardDetail"));
  const retryRequired = Boolean(field(payload, "retryRequired", "RetryRequired"));
  const retryAttempt = Number(field(payload, "retryAttempt", "RetryAttempt") || 0);
  const retryMaxAttempts = Number(field(payload, "retryMaxAttempts", "RetryMaxAttempts") || 0);
  const retryStopReason = clean(field(payload, "retryStopReason", "RetryStopReason"));
  // 실제 가드 실패(카테고리/사유/상세)나 실제 재시도가 있을 때만 노출한다.
  // retryStopReason 단독(llm_not_required, web_disabled_by_user 등)은 정상 흐름의 메타라 경고로 띄우지 않는다.
  const hasGuardFailure = !!category || !!reason || !!detail;
  const hasRetry = retryRequired || retryAttempt > 0;
  if (!hasGuardFailure && !hasRetry) return null;
  return { category, reason, detail, retryRequired, retryAttempt, retryMaxAttempts, retryStopReason };
}

export function normalizeResponseNotes(notebookAction: unknown, autoMemoryNote: unknown): AskResponseNote[] {
  const notes: AskResponseNote[] = [];
  const nb = record(notebookAction);
  if (Object.keys(nb).length > 0) {
    const message = String(field(nb, "message", "Message") || "").trim();
    const kind = String(field(nb, "kind", "Kind") || "").trim();
    notes.push({
      kind: "notebook",
      ok: Boolean(field(nb, "ok", "Ok")),
      label: message || (kind ? `노트북 ${kind}` : "노트북 저장")
    });
  }
  const mem = record(autoMemoryNote);
  if (Object.keys(mem).length > 0) {
    const name = String(field(mem, "name", "Name") || "").trim();
    if (name) notes.push({ kind: "memory", ok: true, label: name });
  }
  return notes;
}

/** llm_chat_result.retrievalTrace 정규화. 자동검색이 아무것도 실행하지 않았으면 null(트레이스 미표시). */
export function normalizeRetrievalTrace(value: unknown): AskRetrievalTrace | null {
  if (!value || typeof value !== "object") return null;
  const payload = record(value);
  const rawSteps = field(payload, "steps", "Steps");
  const steps: AskRetrievalStep[] = Array.isArray(rawSteps)
    ? rawSteps.map((item) => {
        const step = record(item);
        return {
          tool: String(field(step, "tool", "Tool") || "").trim(),
          status: String(field(step, "status", "Status") || "").trim(),
          skipReason: String(field(step, "skipReason", "SkipReason") || "").trim(),
          result: String(field(step, "result", "Result") || "").trim(),
          detail: String(field(step, "detail", "Detail") || "").trim(),
          injected: Boolean(field(step, "injected", "Injected"))
        };
      })
    : [];
  const trace: AskRetrievalTrace = {
    webDecision: String(field(payload, "webDecision", "WebDecision") || "").trim(),
    memoryInjected: Boolean(field(payload, "memoryInjected", "MemoryInjected")),
    webInjected: Boolean(field(payload, "webInjected", "WebInjected")),
    steps
  };
  // 캐주얼 질문처럼 메모리/웹 모두 그냥 skip된 턴은 노출 가치가 없어 숨긴다.
  const ran = steps.some((step) => step.status !== "skip" || step.injected);
  if (!ran) return null;
  return trace;
}

export function normalizeConversationContext(conversation: Record<string, unknown>): AskConversationContext {
  const rawMessages = field(conversation, "messages", "Messages");
  const messages = Array.isArray(rawMessages) ? rawMessages.map(normalizeAskMessage) : [];
  return {
    linkedMemoryNotes: strings(field(conversation, "linkedMemoryNotes", "LinkedMemoryNotes")),
    tokenUsageTotal: tokenUsage(field(conversation, "tokenUsageTotal", "TokenUsageTotal")),
    compressionEvents: messages
      .filter((message) => message.meta.includes("auto-compress"))
      .map((message) => ({ createdUtc: message.createdUtc, preview: message.text.slice(0, 180) }))
  };
}
