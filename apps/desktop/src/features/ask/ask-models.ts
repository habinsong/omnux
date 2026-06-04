import type { AskProvider } from "./ask-store";

// 기존 대화탭의 모델 선택을 이식한다.
// groq/copilot/cerebras 는 미들웨어 카탈로그(라이브)를 합치고, gemini/nvidia/codex 는 상수 목록을 유지한다.

export const PROVIDER_KEYS: Exclude<AskProvider, "auto">[] = ["groq", "gemini", "cerebras", "nvidia", "copilot", "codex"];
export const NONE_MODEL = "none";
export const DEFAULT_GROQ_SINGLE_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const DEFAULT_GROQ_WORKER_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_GEMINI_WORKER_MODEL = "gemini-3-flash-preview";
export const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
export const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";
export const DEFAULT_COPILOT_MODEL = "gpt-5-mini";
export const DEFAULT_CODEX_MODEL = "gpt-5.4";

export const PROVIDER_LABEL: Record<AskProvider, string> = {
  auto: "자동",
  groq: "Groq",
  gemini: "Gemini",
  cerebras: "Cerebras",
  nvidia: "NVIDIA NIM",
  copilot: "Copilot",
  codex: "Codex"
};

// 미들웨어 응답이 비어 있거나 늦어져도 질문탭 선택지가 비지 않도록 하는 정적 모델 목록.
export const STATIC_MODEL_OPTIONS: Partial<Record<AskProvider, string[]>> = {
  groq: [DEFAULT_GROQ_SINGLE_MODEL, DEFAULT_GROQ_WORKER_MODEL],
  gemini: [
    DEFAULT_GEMINI_WORKER_MODEL,
    "gemini-3-pro-preview",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-pro"
  ],
  cerebras: [DEFAULT_CEREBRAS_MODEL, "zai-glm-4.7"],
  nvidia: [
    DEFAULT_NVIDIA_MODEL,
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "nvidia/nemotron-3-super-120b-a12b",
    "openai/gpt-oss-120b",
    "qwen/qwen3-coder-480b-a35b-instruct"
  ],
  copilot: [
    "claude-sonnet-4.6",
    "claude-sonnet-4.5",
    "claude-sonnet-4",
    "claude-haiku-4.5",
    "claude-opus-4.7",
    "claude-opus-4.6",
    "claude-opus-4.6-fast",
    "claude-opus-4.5",
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.2",
    DEFAULT_COPILOT_MODEL,
    "gpt-4.1",
    "grok-code-fast-1"
  ],
  codex: [DEFAULT_CODEX_MODEL, "gpt-5.5", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2-codex", "gpt-5.2"]
};

export type ProviderCatalogs = Partial<Record<Exclude<AskProvider, "auto">, string[]>>;

export function mergeModelOptions(provider: AskProvider, ...sets: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...(STATIC_MODEL_OPTIONS[provider] ?? []), ...sets.flatMap((set) => set ?? [])]) {
    const value = String(item || "").trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

// 제공자별 선택 가능한 모델 목록을 반환한다. 라이브 카탈로그가 와도 정적 기본 선택지는 유지한다.
export function modelOptionsForProvider(provider: AskProvider, catalogs: ProviderCatalogs): string[] {
  if (provider === "auto") return [];
  return mergeModelOptions(provider, catalogs[provider]);
}
