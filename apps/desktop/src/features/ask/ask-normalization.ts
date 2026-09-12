import {
  type DesktopServerMessage
} from "../middleware/desktop-message-gateway";
import {
  normalizeAskMessage,
  normalizeCitations,
  normalizeCitationValidation,
  normalizeGuardInfo,
  normalizeLatency,
  normalizeResponseNotes,
  normalizeRetrievalTrace,
  type AskActionSuggestion,
  type AskMessage
} from "./ask-context";
import {
  NONE_MODEL
} from "./ask-models";
import type { AskChatMode, AskConversationItem, AskConversationMetaDraft, AskMemoryNoteItem, AskMultiResult } from "./ask-store";


export const EMPTY_META_DRAFT: AskConversationMetaDraft = {
  title: "",
  project: "기본",
  category: "일반",
  tags: ""
};


export function readField(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (payload[key] !== undefined && payload[key] !== null) return payload[key];
  }
  return undefined;
}


export function normalizeConversation(item: unknown): AskConversationItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    id: String(readField(payload, "id", "Id") || ""),
    scope: String(readField(payload, "scope", "Scope") || "chat"),
    mode: normalizeChatMode(readField(payload, "mode", "Mode")),
    title: String(readField(payload, "title", "Title") || "제목 없음"),
    preview: String(readField(payload, "preview", "Preview") || ""),
    messageCount: Number(readField(payload, "messageCount", "MessageCount") || 0),
    updatedUtc: String(readField(payload, "updatedUtc", "UpdatedUtc") || ""),
    project: String(readField(payload, "project", "Project") || "기본"),
    category: String(readField(payload, "category", "Category") || "일반"),
    tags: normalizeStrings(readField(payload, "tags", "Tags")),
    linkedMemoryNotes: normalizeStrings(readField(payload, "linkedMemoryNotes", "LinkedMemoryNotes"))
  };
}


export function normalizeChatMode(value: unknown): AskChatMode {
  return value === "orchestration" || value === "multi" ? value : "single";
}


export function normalizeStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}


export function normalizeModelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return String(record.id || record.model || record.name || "");
    })
    .map((item) => item.trim())
    .filter(Boolean);
}


export function normalizeMemoryNote(item: unknown): AskMemoryNoteItem {
  const payload = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    name: String(payload.name || ""),
    fullPath: String(payload.fullPath || ""),
    excerpt: String(payload.excerpt || ""),
    sizeBytes: Number(payload.sizeBytes || 0),
    lastWriteUtc: String(payload.lastWriteUtc || "")
  };
}


export function tagsToText(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
}


export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}


export function buildMetaDraft(item: AskConversationItem | null): AskConversationMetaDraft {
  if (!item) return { ...EMPTY_META_DRAFT };
  return {
    title: item.title || "",
    project: item.project || "기본",
    category: item.category || "일반",
    tags: tagsToText(item.tags)
  };
}


export function parseWebUrls(value: string): string[] {
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


export function normalizeConversationMessages(conversation: Record<string, unknown>): AskMessage[] {
  const rawMessages = readField(conversation, "messages", "Messages");
  return Array.isArray(rawMessages) ? rawMessages.map(normalizeAskMessage) : [];
}


export function normalizeActionSuggestions(raw: unknown): AskActionSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const result: AskActionSuggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const payload = item as Record<string, unknown>;
    const kind = String(payload.kind || "");
    const label = String(payload.label || "").trim();
    const prompt = String(payload.prompt || "").trim();
    if ((kind === "plan" || kind === "routine" || kind === "agent") && label && prompt) {
      const scheduleKind = String(payload.scheduleKind || "");
      const scheduleTime = String(payload.scheduleTime || "").trim();
      const weekdaysRaw = payload.scheduleWeekdays;
      const scheduleWeekdays = Array.isArray(weekdaysRaw)
        ? weekdaysRaw.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6)
        : undefined;
      const dayRaw = Number(payload.scheduleDayOfMonth);
      result.push({
        kind,
        label,
        prompt,
        scheduleKind: scheduleKind === "daily" || scheduleKind === "weekly" || scheduleKind === "monthly" ? scheduleKind : undefined,
        scheduleTime: scheduleTime || undefined,
        scheduleWeekdays: scheduleWeekdays && scheduleWeekdays.length > 0 ? scheduleWeekdays : undefined,
        scheduleDayOfMonth: Number.isInteger(dayRaw) && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : undefined
      });
    }
  }
  return result;
}


export function enrichLatestAssistantMessage(messages: AskMessage[], message: DesktopServerMessage): AskMessage[] {
  if (messages.length === 0) return messages;
  const provider = String(readField(message, "provider", "Provider") || "");
  const model = String(readField(message, "model", "Model") || "");
  const route = String(readField(message, "route", "Route") || "");
  const citations = normalizeCitations(readField(message, "citations", "Citations"));
  const citationCount = citations.length;
  const grounded = citationCount > 0 || /web|url|ground|citation|검색|근거/i.test(route);
  const actionSuggestions = normalizeActionSuggestions(readField(message, "actionSuggestions", "ActionSuggestions"));
  const citationValidation = normalizeCitationValidation(readField(message, "citationValidation", "CitationValidation"));
  const latency = normalizeLatency(readField(message, "latency", "Latency"));
  const guard = normalizeGuardInfo(message as Record<string, unknown>);
  const responseNotes = normalizeResponseNotes(
    readField(message, "notebookAction", "NotebookAction"),
    readField(message, "autoMemoryNote", "AutoMemoryNote")
  );
  const retrievalTrace = normalizeRetrievalTrace(readField(message, "retrievalTrace", "RetrievalTrace"));
  if (
    !provider && !model && !route && !grounded &&
    actionSuggestions.length === 0 && citations.length === 0 &&
    !citationValidation && !latency && !guard && responseNotes.length === 0 && !retrievalTrace
  ) {
    return messages;
  }
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const current = next[index];
    if (current.role !== "ai") continue;
    next[index] = {
      ...current,
      provider: provider || current.provider,
      model: model || current.model,
      route: route || current.route,
      grounded: grounded || current.grounded,
      citationCount: citationCount || current.citationCount,
      actionSuggestions: actionSuggestions.length > 0 ? actionSuggestions : current.actionSuggestions,
      citations: citations.length > 0 ? citations : current.citations,
      citationValidation: citationValidation ?? current.citationValidation,
      latency: latency ?? current.latency,
      guard: guard ?? current.guard,
      responseNotes: responseNotes.length > 0 ? responseNotes : current.responseNotes,
      retrievalTrace: retrievalTrace ?? current.retrievalTrace
    };
    break;
  }
  return next;
}


export function normalizeMultiResult(message: DesktopServerMessage): AskMultiResult {
  const definitions = [
    { key: "groq", label: "Groq", modelKey: "groqModel" },
    { key: "gemini", label: "Gemini", modelKey: "geminiModel" },
    { key: "cerebras", label: "Cerebras", modelKey: "cerebrasModel" },
    { key: "nvidia", label: "NVIDIA NIM", modelKey: "nvidiaModel" },
    { key: "deepseek", label: "DeepSeek", modelKey: "deepseekModel" },
    { key: "copilot", label: "Copilot", modelKey: "copilotModel" },
    { key: "codex", label: "Codex", modelKey: "codexModel" },
    { key: "grok", label: "Grok", modelKey: "grokModel" }
  ];
  return {
    summary: String(message.summary || message.commonSummary || ""),
    providers: definitions
      .map((definition) => ({
        key: definition.key,
        label: definition.label,
        model: String(message[definition.modelKey] || ""),
        text: String(message[definition.key] || "")
      }))
      .filter((item) => (item.model || item.text) && !(item.model === NONE_MODEL && (!item.text || item.text === "선택 안함")))
  };
}
