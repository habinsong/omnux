import type { AskProvider } from "./ask-store";

// 기존 대화탭의 모델 선택을 이식한다.
// groq/copilot/cerebras 는 미들웨어 카탈로그(라이브)를 합치고, gemini/nvidia/codex 는 상수 목록을 유지한다.

export const PROVIDER_KEYS: Exclude<AskProvider, "auto">[] = ["groq", "gemini", "cerebras", "nvidia", "copilot", "codex"];
export const NONE_MODEL = "none";
// 2026-06 각 제공자 공식 문서/체인지로그 기준. llama-4-scout(Groq deprecate)→gpt-oss로 교체.
export const DEFAULT_GROQ_SINGLE_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_GROQ_WORKER_MODEL = "openai/gpt-oss-20b";
export const DEFAULT_GEMINI_WORKER_MODEL = "gemini-3.5-flash";
export const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";
export const DEFAULT_NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";
export const DEFAULT_COPILOT_MODEL = "gpt-5-mini";
export const DEFAULT_CODEX_MODEL = "gpt-5.5";

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
  // Groq/Copilot/Cerebras 는 백엔드 라이브 카탈로그가 이 목록을 덮어쓴다(여긴 fallback).
  groq: [DEFAULT_GROQ_SINGLE_MODEL, DEFAULT_GROQ_WORKER_MODEL, "qwen/qwen3-32b"],
  gemini: [
    "gemini-3.5-flash",
    "gemini-3.1-pro",
    "gemini-3-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ],
  cerebras: [DEFAULT_CEREBRAS_MODEL, "qwen-3-32b", "zai-glm-4.7"],
  nvidia: [
    DEFAULT_NVIDIA_MODEL,
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "openai/gpt-oss-120b"
  ],
  copilot: [
    "gpt-5.5",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    DEFAULT_COPILOT_MODEL,
    "gpt-4.1",
    "claude-sonnet-4.5",
    "claude-haiku-4.5",
    "gemini-3.1-pro",
    "gemini-3-flash",
    "gemini-2.5-pro"
  ],
  codex: [DEFAULT_CODEX_MODEL, "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.3-codex", "gpt-5.2-codex"]
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
