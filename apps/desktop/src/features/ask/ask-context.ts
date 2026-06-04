export type AskTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  source: string;
};

export type AskMessage = {
  role: "user" | "ai" | "system";
  text: string;
  meta: string;
  createdUtc: string;
  tokenUsage: AskTokenUsage | null;
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

function tokenUsage(value: unknown): AskTokenUsage | null {
  const payload = record(value);
  const totalTokens = Number(payload.totalTokens || 0);
  if (!totalTokens) return null;
  return {
    promptTokens: Number(payload.promptTokens || 0),
    completionTokens: Number(payload.completionTokens || 0),
    totalTokens,
    source: String(payload.source || "unknown")
  };
}

export function normalizeAskMessage(message: unknown): AskMessage {
  const payload = record(message);
  const role = String(payload.role || "").toLowerCase();
  return {
    role: role === "user" ? "user" : role === "system" ? "system" : "ai",
    text: String(payload.text || ""),
    meta: String(payload.meta || ""),
    createdUtc: String(payload.createdUtc || ""),
    tokenUsage: tokenUsage(payload.tokenUsage)
  };
}

export function normalizeConversationContext(conversation: Record<string, unknown>): AskConversationContext {
  const messages = Array.isArray(conversation.messages) ? conversation.messages.map(normalizeAskMessage) : [];
  return {
    linkedMemoryNotes: strings(conversation.linkedMemoryNotes),
    tokenUsageTotal: tokenUsage(conversation.tokenUsageTotal),
    compressionEvents: messages
      .filter((message) => message.meta.includes("auto-compress"))
      .map((message) => ({ createdUtc: message.createdUtc, preview: message.text.slice(0, 180) }))
  };
}
