/* ============================================================================
   Logic 노드 라이브러리 — 정적 대시보드 logic-state.js LOGIC_NODE_LIBRARY를
   현재 백엔드 LogicGraphValidationPolicy.SupportedNodeTypes(31종)와 노드별 config 키에
   맞춰 재구성한 정본. 비주얼 에디터의 팔레트/인스펙터/포트 정보가 모두 여기서 나온다.
   ============================================================================ */

export type LogicFieldControl = "text" | "textarea" | "number" | "select";

export interface LogicFieldDef {
  key: string;
  label: string;
  control: LogicFieldControl;
  placeholder?: string;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
  default?: string;
}

export interface LogicNodeTypeDef {
  type: string;
  label: string;
  category: string;
  description: string;
  fields: LogicFieldDef[];
  /** 출력 포트(분기). 비우면 main 단일 출력. end 계열은 [] (출력 없음). */
  sourcePorts: string[];
  /** main 외에 추가로 바인딩 가능한 입력 포트. */
  bindablePorts: string[];
  defaultSize: { width: number; height: number };
}

export interface LogicNodeGroup {
  key: string;
  label: string;
  types: string[];
}

export const LOGIC_NODE_GROUPS: LogicNodeGroup[] = [
  { key: "flow", label: "흐름", types: ["start", "end", "output", "if", "delay", "parallel_split", "parallel_join", "set_var", "template"] },
  { key: "ai", label: "문답 · 코딩", types: ["chat_single", "chat_orchestration", "chat_multi", "coding_single", "coding_orchestration", "coding_multi"] },
  { key: "automation", label: "자동화", types: ["routine_run"] },
  { key: "data", label: "데이터 · 도구", types: ["memory_search", "memory_get", "web_search", "web_fetch", "file_read", "file_write"] },
  { key: "ops", label: "운영", types: ["session_list", "session_spawn", "session_send", "cron_status", "cron_run", "browser_execute", "canvas_execute", "nodes_pending", "nodes_invoke", "telegram_stub"] }
];

export const LOGIC_OPERATOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "equals", label: "같음 (=)" },
  { value: "not_equals", label: "다름 (≠)" },
  { value: "contains", label: "포함" },
  { value: "not_contains", label: "미포함" },
  { value: "starts_with", label: "~로 시작" },
  { value: "ends_with", label: "~로 끝남" },
  { value: "gt", label: "초과 (>)" },
  { value: "gte", label: "이상 (≥)" },
  { value: "lt", label: "미만 (<)" },
  { value: "lte", label: "이하 (≤)" },
  { value: "is_truthy", label: "값이 있음" },
  { value: "is_falsy", label: "값이 없음" }
];

const PROVIDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "AUTO" },
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
  { value: "cerebras", label: "Cerebras" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "copilot", label: "Copilot" },
  { value: "codex", label: "Codex" }
];

const ENABLED_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "기본값" },
  { value: "true", label: "사용" },
  { value: "false", label: "사용 안 함" }
];

const field = (key: string, label: string, control: LogicFieldControl, extras: Partial<LogicFieldDef> = {}): LogicFieldDef => ({
  key,
  label,
  control,
  ...extras
});

const chatFields = (withInput = true): LogicFieldDef[] => [
  ...(withInput ? [field("input", "질문 / 프롬프트", "textarea", { rows: 4, placeholder: "오늘 회의 내용을 5줄로 요약해 줘." })] : []),
  field("provider", "공급자", "select", { options: PROVIDER_OPTIONS, default: "" }),
  field("model", "모델", "text", { placeholder: "공급자 기본값" }),
  field("memoryNotes", "메모리 노트", "text", { placeholder: "project-summary, release-checklist" }),
  field("webSearchEnabled", "웹 참고", "select", { options: ENABLED_OPTIONS }),
  field("webUrls", "참고 URL", "textarea", { rows: 2, placeholder: "https://example.com" })
];

const codingFields = (): LogicFieldDef[] => [
  field("input", "구현 요청", "textarea", { rows: 4, placeholder: "CSV를 읽어 합계를 출력하는 파이썬 스크립트를 작성해 줘." }),
  field("language", "언어", "text", { placeholder: "auto / python / typescript ..." }),
  field("provider", "공급자", "select", { options: PROVIDER_OPTIONS, default: "" }),
  field("model", "모델", "text", { placeholder: "공급자 기본값" })
];

export const LOGIC_NODE_DEFS: Record<string, LogicNodeTypeDef> = {
  start: {
    type: "start", label: "시작", category: "flow",
    description: "흐름이 여기서 시작됩니다. 입력값을 적으면 첫 단계에 그대로 전달합니다.",
    fields: [field("input", "시작 입력", "textarea", { rows: 3, placeholder: "흐름 실행 시 전달할 입력값" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 188, height: 120 }
  },
  end: {
    type: "end", label: "끝내기", category: "flow",
    description: "마지막 결과를 정리합니다. 비우면 직전 단계 결과를 그대로 씁니다.",
    fields: [field("result", "마무리 문장", "textarea", { rows: 3, placeholder: "비우면 직전 결과 사용" })],
    sourcePorts: [], bindablePorts: ["result"], defaultSize: { width: 200, height: 120 }
  },
  output: {
    type: "output", label: "출력", category: "flow",
    description: "출력 텍스트를 생략 없이 확인합니다. 비우면 연결된 입력을 그대로 보여줍니다.",
    fields: [field("result", "출력 텍스트", "textarea", { rows: 4, placeholder: "비우면 연결된 입력 출력" })],
    sourcePorts: [], bindablePorts: ["result"], defaultSize: { width: 240, height: 150 }
  },
  if: {
    type: "if", label: "조건 갈래", category: "flow",
    description: "값을 비교해 true/false 두 갈래 중 하나로 보냅니다. 출력 포트에서 갈래를 고르세요.",
    fields: [
      field("leftRef", "비교할 값", "text", { placeholder: "{{nodes.review.text}} 또는 직접 입력" }),
      field("operator", "연산자", "select", { options: LOGIC_OPERATOR_OPTIONS, default: "equals" }),
      field("rightValue", "비교 대상", "text", { placeholder: "승인" })
    ],
    sourcePorts: ["true", "false"], bindablePorts: ["leftref"], defaultSize: { width: 230, height: 160 }
  },
  delay: {
    type: "delay", label: "잠깐 기다리기", category: "flow",
    description: "지정한 시간만큼 기다린 뒤 다음 단계를 실행합니다.",
    fields: [
      field("seconds", "지연(초)", "number", { placeholder: "10" }),
      field("milliseconds", "지연(밀리초)", "number", { placeholder: "10000" })
    ],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 190, height: 120 }
  },
  parallel_split: {
    type: "parallel_split", label: "동시에 시작", category: "flow",
    description: "같은 입력을 여러 갈래로 동시에 보냅니다. 각 출력 포트 이름으로 갈래를 구분하세요.",
    fields: [],
    sourcePorts: ["a", "b"], bindablePorts: [], defaultSize: { width: 200, height: 110 }
  },
  parallel_join: {
    type: "parallel_join", label: "모두 기다리기", category: "flow",
    description: "앞선 갈래가 모두 끝날 때까지 기다립니다. 들어오는 연결이 2개 이상이어야 합니다.",
    fields: [],
    sourcePorts: ["main"], bindablePorts: ["in"], defaultSize: { width: 200, height: 110 }
  },
  set_var: {
    type: "set_var", label: "값 기억하기", category: "flow",
    description: "나중 단계에서 다시 쓸 값을 이름 붙여 저장합니다. {{vars.이름}}으로 참조합니다.",
    fields: [
      field("name", "변수 이름", "text", { placeholder: "customerName" }),
      field("value", "값", "textarea", { rows: 3, placeholder: "{{nodes.start.text}} 또는 직접 입력" })
    ],
    sourcePorts: ["main"], bindablePorts: ["value"], defaultSize: { width: 220, height: 130 }
  },
  template: {
    type: "template", label: "문장 만들기", category: "flow",
    description: "여러 값을 끼워 넣어 한 문장/문단을 만듭니다. {{...}} 참조를 자유롭게 씁니다.",
    fields: [field("template", "문장 초안", "textarea", { rows: 4, placeholder: "안녕하세요 {{vars.name}}님, 현재 상태: {{nodes.status.text}}" })],
    sourcePorts: ["main"], bindablePorts: ["template"], defaultSize: { width: 232, height: 140 }
  },
  chat_single: {
    type: "chat_single", label: "한 모델로 답변", category: "ai",
    description: "한 모델에게 바로 질문해 답을 받습니다.",
    fields: chatFields(), sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 260, height: 180 }
  },
  chat_orchestration: {
    type: "chat_orchestration", label: "역할 나눠 답변", category: "ai",
    description: "초안·검토처럼 역할을 나눠 답을 만듭니다.",
    fields: [...chatFields(), field("summaryProvider", "요약 공급자", "select", { options: PROVIDER_OPTIONS, default: "" })],
    sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 270, height: 200 }
  },
  chat_multi: {
    type: "chat_multi", label: "여러 답변 비교", category: "ai",
    description: "여러 모델의 답을 받아 비교·요약합니다.",
    fields: [field("input", "질문 / 프롬프트", "textarea", { rows: 4, placeholder: "여러 모델로 비교할 질문" }), field("summaryProvider", "요약 공급자", "select", { options: PROVIDER_OPTIONS, default: "" }), field("memoryNotes", "메모리 노트", "text", {})],
    sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 270, height: 180 }
  },
  coding_single: {
    type: "coding_single", label: "한 모델로 구현", category: "ai",
    description: "한 모델로 코드를 작성·실행합니다.",
    fields: codingFields(), sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 260, height: 180 }
  },
  coding_orchestration: {
    type: "coding_orchestration", label: "역할 나눠 구현", category: "ai",
    description: "역할을 나눠 코드를 구현합니다.",
    fields: [...codingFields(), field("summaryProvider", "요약 공급자", "select", { options: PROVIDER_OPTIONS, default: "" })],
    sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 270, height: 200 }
  },
  coding_multi: {
    type: "coding_multi", label: "구현안 비교", category: "ai",
    description: "여러 구현안을 비교합니다.",
    fields: [field("input", "구현 요청", "textarea", { rows: 4 }), field("language", "언어", "text", { placeholder: "auto" }), field("summaryProvider", "요약 공급자", "select", { options: PROVIDER_OPTIONS, default: "" })],
    sourcePorts: ["main"], bindablePorts: ["input"], defaultSize: { width: 270, height: 180 }
  },
  routine_run: {
    type: "routine_run", label: "루틴 실행", category: "automation",
    description: "등록된 루틴을 실행합니다.",
    fields: [field("routineId", "루틴 ID", "text", { placeholder: "routine-id" }), field("task", "작업 입력", "textarea", { rows: 2 })],
    sourcePorts: ["main"], bindablePorts: ["task"], defaultSize: { width: 230, height: 150 }
  },
  memory_search: {
    type: "memory_search", label: "기억에서 찾기", category: "data",
    description: "메모리 인덱스에서 관련 기록을 찾습니다.",
    fields: [field("query", "검색어", "text", { placeholder: "{{nodes.start.text}} 또는 키워드" }), field("maxResults", "최대 결과", "number", { placeholder: "10" }), field("minScore", "최소 점수", "number", { placeholder: "0" }), field("scope", "범위", "text", { placeholder: "chat" })],
    sourcePorts: ["main"], bindablePorts: ["query"], defaultSize: { width: 232, height: 160 }
  },
  memory_get: {
    type: "memory_get", label: "메모리 문서 읽기", category: "data",
    description: "지정한 메모리 노트 원문을 읽습니다.",
    fields: [field("noteName", "노트 이름", "text", { placeholder: "project-summary.md" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 220, height: 130 }
  },
  web_search: {
    type: "web_search", label: "웹에서 찾기", category: "data",
    description: "웹 검색 결과를 가져옵니다.",
    fields: [field("query", "검색어", "text", { placeholder: "검색어" }), field("count", "결과 수", "number", { placeholder: "8" }), field("freshness", "신선도", "text", { placeholder: "day / week / month" })],
    sourcePorts: ["main"], bindablePorts: ["query"], defaultSize: { width: 232, height: 150 }
  },
  web_fetch: {
    type: "web_fetch", label: "웹페이지 읽기", category: "data",
    description: "URL 본문을 가져옵니다.",
    fields: [field("url", "URL", "text", { placeholder: "https://example.com" }), field("extractMode", "추출 모드", "text", { placeholder: "text" }), field("maxChars", "최대 글자수", "number", { placeholder: "8000" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 246, height: 160 }
  },
  file_read: {
    type: "file_read", label: "파일 읽기", category: "data",
    description: "워크스페이스 파일을 읽습니다.",
    fields: [field("path", "파일 경로", "text", { placeholder: "src/index.ts" }), field("maxChars", "최대 글자수", "number", { placeholder: "8000" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 220, height: 130 }
  },
  file_write: {
    type: "file_write", label: "파일 저장", category: "data",
    description: "워크스페이스 파일에 내용을 씁니다.",
    fields: [field("path", "파일 경로", "text", { placeholder: "out/result.md" }), field("content", "내용", "textarea", { rows: 3, placeholder: "{{nodes.summary.text}}" })],
    sourcePorts: ["main"], bindablePorts: ["content"], defaultSize: { width: 232, height: 150 }
  },
  session_list: {
    type: "session_list", label: "열린 세션 보기", category: "ops",
    description: "활성 에이전트 세션 목록을 가져옵니다.",
    fields: [field("limit", "개수", "number", { placeholder: "30" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 220, height: 120 }
  },
  session_spawn: {
    type: "session_spawn", label: "새 작업 세션", category: "ops",
    description: "새 에이전트 세션을 생성합니다.",
    fields: [field("task", "작업", "textarea", { rows: 2 }), field("runtime", "런타임", "text", { placeholder: "acp" }), field("label", "라벨", "text", {}), field("runTimeoutSeconds", "타임아웃(초)", "number", { placeholder: "900" })],
    sourcePorts: ["main"], bindablePorts: ["task"], defaultSize: { width: 246, height: 170 }
  },
  session_send: {
    type: "session_send", label: "세션에 보내기", category: "ops",
    description: "기존 세션에 메시지를 보냅니다.",
    fields: [field("sessionKey", "세션 키", "text", {}), field("message", "메시지", "textarea", { rows: 2 }), field("timeoutSeconds", "타임아웃(초)", "number", { placeholder: "60" })],
    sourcePorts: ["main"], bindablePorts: ["message"], defaultSize: { width: 236, height: 170 }
  },
  cron_status: {
    type: "cron_status", label: "예약 작업 상태", category: "ops",
    description: "Cron 스케줄러 상태를 가져옵니다.",
    fields: [], sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 212, height: 100 }
  },
  cron_run: {
    type: "cron_run", label: "예약 작업 실행", category: "ops",
    description: "지정한 cron job을 실행합니다.",
    fields: [field("jobId", "Job ID", "text", {}), field("runMode", "실행 모드", "text", { placeholder: "manual" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 220, height: 130 }
  },
  browser_execute: {
    type: "browser_execute", label: "브라우저 제어", category: "ops",
    description: "브라우저 액션을 실행합니다.",
    fields: [field("action", "액션", "text", { placeholder: "open / read / click" }), field("targetUrl", "대상 URL", "text", {}), field("profile", "프로필", "text", {}), field("targetId", "대상 ID", "text", {})],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 248, height: 170 }
  },
  canvas_execute: {
    type: "canvas_execute", label: "캔버스 제어", category: "ops",
    description: "캔버스 도구 액션을 실행합니다.",
    fields: [field("action", "액션", "text", {}), field("javaScript", "JavaScript", "textarea", { rows: 2 }), field("outputFormat", "출력 형식", "text", {}), field("targetId", "대상 ID", "text", {})],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 248, height: 170 }
  },
  nodes_pending: {
    type: "nodes_pending", label: "승인 대기 보기", category: "ops",
    description: "노드 페어링 대기 요청을 가져옵니다.",
    fields: [field("profile", "프로필", "text", {})],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 216, height: 110 }
  },
  nodes_invoke: {
    type: "nodes_invoke", label: "노드 명령 보내기", category: "ops",
    description: "연결된 node에 명령을 보냅니다.",
    fields: [field("node", "노드", "text", {}), field("invokeCommand", "명령", "text", {}), field("invokeParamsJson", "파라미터(JSON)", "textarea", { rows: 2, placeholder: "{}" })],
    sourcePorts: ["main"], bindablePorts: [], defaultSize: { width: 248, height: 160 }
  },
  telegram_stub: {
    type: "telegram_stub", label: "텔레그램 흉내", category: "ops",
    description: "텔레그램 명령 라우팅을 stub 채널로 실행합니다.",
    fields: [field("text", "명령 텍스트", "text", { placeholder: "/llm status" })],
    sourcePorts: ["main"], bindablePorts: ["text"], defaultSize: { width: 228, height: 130 }
  }
};

export const LOGIC_NODE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(LOGIC_NODE_DEFS).map((def) => [def.type, def.label])
);

export function getLogicNodeDef(type: string): LogicNodeTypeDef | null {
  return LOGIC_NODE_DEFS[type] || null;
}

/** 노드 타입의 기본 config(필드 default 반영). */
export function defaultConfigForType(type: string): Record<string, string> {
  const def = LOGIC_NODE_DEFS[type];
  if (!def) return {};
  const config: Record<string, string> = {};
  for (const f of def.fields) {
    if (f.default !== undefined) config[f.key] = f.default;
  }
  return config;
}

/** 기존 id와 충돌하지 않는 nodeId 생성. */
export function makeLogicNodeId(type: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  let index = 1;
  let candidate = `${type}_${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${type}_${index}`;
  }
  return candidate;
}

/** 참조 토큰 baseline. 노드 id를 추가로 합쳐서 사용한다. */
export const LOGIC_BASE_REFERENCES: Array<{ token: string; label: string }> = [
  { token: "{{input}}", label: "흐름 입력" },
  { token: "{{artifacts.last}}", label: "마지막 산출물" }
];
