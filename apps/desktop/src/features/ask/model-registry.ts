/**
 * 통합 모델 레지스트리 — apps/shared/model-registry.json이 단일 소스.
 * 데스크탑(TS)과 대시보드(JS) 모두 이 모듈을 통해 모델 정보를 얻는다.
 * 직접 모델 ID를 하드코딩하지 말고 여기서 가져올 것.
 */
import registry from "../../../../shared/model-registry.json";

type ProviderKey = "groq" | "gemini" | "cerebras" | "nvidia" | "copilot" | "codex";
type AnyProvider = ProviderKey | "auto";

interface ProviderConfig {
  label: string;
  default: string;
  workerDefault: string;
  fallback: string[];
  knownMeta?: Record<string, { owner: string; costMultiplier: string }>;
}

const providers = registry.providers as Record<ProviderKey, ProviderConfig>;
const providerKeys: ProviderKey[] = Object.keys(providers) as ProviderKey[];

/** 모델이 "사용 안 함"인지 확인 */
export const NONE_MODEL = "none";

/** 질문/빌드 탭 제공자 키 */
export const PROVIDER_KEYS: Exclude<AnyProvider, "auto">[] = providerKeys;

/** 제공자 표시명 */
const providerLabelsEntries = [
  ["auto", "자동"] as const,
  ...providerKeys.map((k) => [k, providers[k].label] as const)
];
export const PROVIDER_LABEL: Record<AnyProvider, string> = Object.fromEntries(providerLabelsEntries) as Record<AnyProvider, string>;

// ── 기본 모델 상수 (기존 DEFAULT_*_MODEL 대체) ──

export const DEFAULT_GROQ_SINGLE_MODEL = providers.groq.default;
export const DEFAULT_GROQ_WORKER_MODEL = providers.groq.workerDefault;
export const DEFAULT_GEMINI_WORKER_MODEL = providers.gemini.workerDefault;
export const DEFAULT_CEREBRAS_MODEL = providers.cerebras.default;
export const DEFAULT_NVIDIA_MODEL = providers.nvidia.default;
export const DEFAULT_COPILOT_MODEL = providers.copilot.default;
export const DEFAULT_CODEX_MODEL = providers.codex.default;

// ── 정적 폴백 모델 목록 (기존 STATIC_MODEL_OPTIONS 대체) ──

export const STATIC_MODEL_OPTIONS: Partial<Record<AnyProvider, string[]>> = Object.fromEntries(
  providerKeys.map((k) => [k, providers[k].fallback])
);

// ── 유틸리티 ──

export type ProviderCatalogs = Partial<Record<Exclude<AnyProvider, "auto">, string[]>>;

/**
 * 정적 폴백 목록을 최종 목록으로 사용한다.
 * API에서 받아온 모델은 정적 목록에 있는 것만 유지하고, 나머지는 무시한다.
 * (Gemini 등 모델이 수십 개씩 오는 제공자에서 노이즈를 방지하기 위함.)
 */
export function mergeModelOptions(provider: AnyProvider, ...sets: Array<string[] | undefined>): string[] {
  const staticList = STATIC_MODEL_OPTIONS[provider] ?? [];
  if (staticList.length === 0) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of sets.flatMap((set) => set ?? [])) {
      const value = String(item || "").trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
    return result;
  }
  return staticList.filter(Boolean);
}

export function modelOptionsForProvider(provider: AnyProvider, catalogs: ProviderCatalogs): string[] {
  if (provider === "auto") return [];
  return mergeModelOptions(provider, catalogs[provider]);
}

/** 비전 등 특수 목적의 기본 Gemini 모델 반환 — 하드코딩 금지 */
export function getDefaultVisionModel(): { provider: "gemini"; model: string } {
  return { provider: "gemini", model: providers.gemini.default };
}
