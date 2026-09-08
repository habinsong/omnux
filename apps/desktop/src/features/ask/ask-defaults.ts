import { DEFAULT_CEREBRAS_MODEL, DEFAULT_CODEX_MODEL, DEFAULT_COPILOT_MODEL, DEFAULT_GEMINI_WORKER_MODEL, DEFAULT_GROK_MODEL, DEFAULT_GROQ_SINGLE_MODEL, DEFAULT_GROQ_WORKER_MODEL, DEFAULT_NVIDIA_MODEL, NONE_MODEL, STATIC_MODEL_OPTIONS } from "./ask-models";
import type { AskProvider, AskModelProvider } from "./ask-types";

export const ASK_PROVIDER_OPTIONS: Array<{ value: AskProvider; label: string }> = [
  { value: "auto", label: "자동" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
  { value: "cerebras", label: "Cerebras" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "copilot", label: "Copilot" },
  { value: "codex", label: "Codex" },
  { value: "grok", label: "Grok" }
];

export const DEFAULT_MODEL_CATALOGS: Record<AskModelProvider, string[]> = {
  groq: STATIC_MODEL_OPTIONS.groq ?? [],
  gemini: STATIC_MODEL_OPTIONS.gemini ?? [],
  cerebras: STATIC_MODEL_OPTIONS.cerebras ?? [],
  nvidia: STATIC_MODEL_OPTIONS.nvidia ?? [],
  copilot: STATIC_MODEL_OPTIONS.copilot ?? [],
  codex: STATIC_MODEL_OPTIONS.codex ?? [],
  grok: STATIC_MODEL_OPTIONS.grok ?? []
};

export const DEFAULT_SELECTED_MODELS: Partial<Record<AskModelProvider, string>> = {
  groq: DEFAULT_GROQ_SINGLE_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: DEFAULT_COPILOT_MODEL,
  codex: DEFAULT_CODEX_MODEL,
  grok: DEFAULT_GROK_MODEL
};

export const DEFAULT_WORKER_MODELS: Partial<Record<AskModelProvider, string>> = {
  groq: DEFAULT_GROQ_WORKER_MODEL,
  gemini: DEFAULT_GEMINI_WORKER_MODEL,
  cerebras: DEFAULT_CEREBRAS_MODEL,
  nvidia: DEFAULT_NVIDIA_MODEL,
  copilot: NONE_MODEL,
  codex: NONE_MODEL,
  grok: NONE_MODEL
};
