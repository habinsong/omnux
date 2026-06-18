/**
 * ask-models.ts — 기존 API 호환 래퍼.
 * 모든 모델 데이터는 apps/shared/model-registry.json이 단일 소스.
 * 직접 모델 ID를 하드코딩하지 말 것.
 */
export {
  PROVIDER_KEYS,
  NONE_MODEL,
  PROVIDER_LABEL,
  DEFAULT_GROQ_SINGLE_MODEL,
  DEFAULT_GROQ_WORKER_MODEL,
  DEFAULT_GEMINI_WORKER_MODEL,
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_NVIDIA_MODEL,
  DEFAULT_COPILOT_MODEL,
  DEFAULT_CODEX_MODEL,
  STATIC_MODEL_OPTIONS,
  mergeModelOptions,
  modelOptionsForProvider,
  getDefaultVisionModel,
  type ProviderCatalogs
} from "./model-registry";
