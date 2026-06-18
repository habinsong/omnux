export const CHAT_MODES = [
  { key: "single", label: "단일 모델" },
  { key: "orchestration", label: "오케스트레이션" },
  { key: "multi", label: "다중 LLM" }
];

export const CODING_MODES = [
  { key: "single", label: "단일 코딩" },
  { key: "orchestration", label: "오케스트레이션 코딩" },
  { key: "multi", label: "다중 코딩" }
];

export const CODING_LANGUAGES = [
  ["auto", "자동 (언어/프로젝트 구조)"],
  ["python", "Python"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["react-vite", "React/Vite"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["java", "Java"],
  ["kotlin", "Kotlin"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["php", "PHP"],
  ["ruby", "Ruby"],
  ["swift", "Swift"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["bash", "Bash"]
];

export const ROUTINE_WEEKDAY_OPTIONS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" }
];

import registry from "../../shared/model-registry.json" with { type: "json" };

const codexProvider = registry.providers.codex;

export const DEFAULT_ROUTINE_AGENT_PROVIDER = "codex";
export const DEFAULT_ROUTINE_AGENT_MODEL = codexProvider.default;
export const DEFAULT_CODEX_MODEL = codexProvider.default;

export const CODEX_MODEL_CHOICES = codexProvider.fallback.map((id) => ({ id, label: id }));

export const DEFAULT_MOBILE_PANES = {
  chat: "thread",
  coding: "thread",
  routine: "overview",
  logic: "canvas",
  settings: "auth"
};
