/* ============================================================================
   로그 화면이 쓰는 값 모델(순수).
   화면·저장소를 가져오지 않는다.

   화면 규칙 하나가 이 파일의 형태를 정한다: **한 화면에 들어가야 한다.**
   그래서 목록은 잘라서 보여주고 남은 수를 밝히며, 요약은 한 줄로 접는다.
   ============================================================================ */

export type LoadStatus = "idle" | "loading" | "ready" | "failed";

export type LoadState = {
  status: LoadStatus;
  error: string;
  updatedAt: string;
};

export const IDLE: LoadState = { status: "idle", error: "", updatedAt: "" };

export type SliceId =
  | "telemetry"
  | "doctor"
  | "mcp"
  | "localLlm"
  | "terminal"
  | "git"
  | "semantic"
  | "repomap"
  | "commits"
  | "improvements";

export type SliceMap = Record<SliceId, LoadState>;

export const SLICE_IDS: SliceId[] = [
  "telemetry",
  "doctor",
  "mcp",
  "localLlm",
  "terminal",
  "git",
  "semantic",
  "repomap",
  "commits",
  "improvements"
];

export function createSliceMap(): SliceMap {
  const map = {} as SliceMap;
  for (const id of SLICE_IDS) map[id] = IDLE;
  return map;
}

export function markLoading(map: SliceMap, id: SliceId): SliceMap {
  return { ...map, [id]: { status: "loading", error: "", updatedAt: map[id].updatedAt } };
}

export function markReady(map: SliceMap, id: SliceId, updatedAt: string): SliceMap {
  return { ...map, [id]: { status: "ready", error: "", updatedAt } };
}

/** 실패해도 이전 결과 시각은 남긴다. 언제 기준의 값인지 계속 말할 수 있어야 한다. */
export function markFailed(map: SliceMap, id: SliceId, error: string): SliceMap {
  return {
    ...map,
    [id]: { status: "failed", error: error || "조회하지 못했습니다.", updatedAt: map[id].updatedAt }
  };
}

const MESSAGE_TO_SLICE: Record<string, SliceId> = {
  telemetry_snapshot: "telemetry",
  doctor_result: "doctor",
  mcp_servers_snapshot: "mcp",
  local_llm_snapshot: "localLlm",
  terminal_capabilities_snapshot: "terminal",
  git_time_machine_snapshot: "git",
  semantic_search_readiness_snapshot: "semantic",
  code_repomap_snapshot: "repomap",
  commit_learning_snapshot: "commits",
  self_improvement_snapshot: "improvements"
};

export function sliceForMessage(messageType: string): SliceId | null {
  const id = MESSAGE_TO_SLICE[messageType];
  return id === undefined ? null : id;
}

/** 응답이 오지 않아도 "조회 중"으로 굳지 않게 하는 기한. */
export const SLICE_TIMEOUT_MS = 15_000;

export const REQUEST_PREFIX = "insights-";

export function requestIdFor(id: SliceId): string {
  return `${REQUEST_PREFIX}${id}`;
}

export function sliceForRequestId(requestId: string): SliceId | null {
  if (!requestId.startsWith(REQUEST_PREFIX)) return null;
  const id = requestId.slice(REQUEST_PREFIX.length) as SliceId;
  return SLICE_IDS.includes(id) ? id : null;
}

/* --------------------------------------------------------------------------
   화면 표시
   -------------------------------------------------------------------------- */

/** 닫힌 줄 오른쪽에 놓는 한 줄. 네 상태를 각각 다르게 말한다. */
export function describeLoad(state: LoadState): string {
  if (state.status === "loading") return "조회 중";
  if (state.status === "failed") return "실패";
  if (state.status === "ready") return "완료";
  return "열면 조회";
}

export type SectionDefinition = {
  id: SliceId;
  label: string;
  hint: string;
};

/** 진단 구역. 표시 순서의 단일 출처. */
export const DIAGNOSTIC_SECTIONS: SectionDefinition[] = [
  { id: "doctor", label: "환경 진단", hint: "가장 최근 진단 보고서" },
  { id: "terminal", label: "터미널·도구", hint: "셸과 명령 도구를 찾을 수 있는지" },
  { id: "localLlm", label: "로컬 모델", hint: "Ollama·LM Studio 연결" },
  { id: "mcp", label: "도구 서버", hint: "MCP 설정과 서버 상태" },
  { id: "semantic", label: "검색 인덱스", hint: "의미 검색 준비 상태" },
  { id: "git", label: "Git 체크포인트", hint: "되돌릴 수 있는 지점" },
  { id: "commits", label: "커밋 기록", hint: "최근 커밋과 자주 바뀌는 파일" },
  { id: "repomap", label: "코드 구조", hint: "파일별 심볼" },
  { id: "improvements", label: "개선 제안", hint: "저장소에서 찾은 후속 작업" }
];

/* --------------------------------------------------------------------------
   호출 기록 표시
   -------------------------------------------------------------------------- */

export type CallRecord = {
  id: string;
  operation: string;
  provider: string;
  model: string;
  status: string;
  totalTokens: number;
  durationMs: number;
  error: string;
  startedUtc: string;
};

export type CallSummary = {
  total: number;
  problem: number;
  totalTokens: number;
  averageDurationMs: number;
};

export function summarizeCalls(records: readonly CallRecord[]): CallSummary {
  let ok = 0;
  let tokens = 0;
  let duration = 0;
  for (const record of records) {
    if ((record.status ?? "").trim().toLowerCase() === "ok") ok += 1;
    tokens += Number.isFinite(record.totalTokens) ? record.totalTokens : 0;
    duration += Number.isFinite(record.durationMs) ? record.durationMs : 0;
  }
  const total = records.length;
  return {
    total,
    problem: total - ok,
    totalTokens: tokens,
    averageDurationMs: total === 0 ? 0 : Math.round(duration / total)
  };
}

/**
 * 목록 한 줄의 제목.
 * 호출 대부분이 같은 모델이라 모델만 쓰면 스무 줄이 똑같아 보인다.
 * 시각을 앞에 두어 줄마다 다른 값이 먼저 오게 한다.
 */
export function callTitle(record: CallRecord): string {
  return formatClock(record.startedUtc);
}

/** 줄의 보조 설명. 모델과 소요·토큰을 한 줄로 붙인다. */
export function callDetail(record: CallRecord): string {
  const parts: string[] = [];
  const model = (record.model ?? "").trim();
  if (model.length > 0) parts.push(model);
  const duration = formatDuration(record.durationMs);
  if (duration !== "-") parts.push(duration);
  if (record.totalTokens > 0) parts.push(`${record.totalTokens.toLocaleString()}토큰`);
  return parts.join(" · ");
}

/** 한 화면에 들어가는 줄 수. 나머지는 "더 보기"로 잇는다. */
export const CALL_PAGE_SIZE = 12;

export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10_000) return `${Math.round(value / 1000).toLocaleString()}k`;
  return value.toLocaleString();
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}초`;
}

export function formatClock(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDateTime(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/** 끊겼다가 다시 붙으면 이전 스냅샷을 현재 값처럼 두지 않는다. 조회 중인 칸은 그대로 둔다. */
export function shouldReloadOnReconnect(
  connected: boolean,
  wasConnected: boolean,
  status: LoadStatus
): boolean {
  return connected && !wasConnected && status !== "loading";
}

/** 언제 기준의 값인지 한 줄로. 조회 중이면 본문 스피너와 같은 말을 쓴다. */
export function describeFreshness(updatedAt: string, connected: boolean, status: LoadStatus = "idle"): string {
  if (status === "loading") return "조회 중";
  if (!updatedAt) return connected ? "아직 조회 전" : "연결 끊김";
  const at = formatDateTime(updatedAt);
  return connected ? `${at} 기준` : `연결 끊김 · ${at} 기준 이전 값`;
}
