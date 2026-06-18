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
