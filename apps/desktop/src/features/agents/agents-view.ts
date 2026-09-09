/* ============================================================================
   에이전트 화면이 쓰는 값 모델(순수).
   상태 전이 규칙은 공용 모듈에 있다. 여기에는 이 화면의 구역과 표시 규칙만 둔다.
   ============================================================================ */

import {
  countFailed,
  createSliceMapFor,
  describeSlice,
  markSliceFailed,
  markSliceLoading,
  markSliceReady,
  type SliceMapOf,
  type SliceState
} from "../middleware/slice-state.ts";

export type { SliceState };
export { SLICE_TIMEOUT_MS } from "../middleware/slice-state.ts";

export type AgentSliceId = "watchdog" | "trace" | "bus" | "worktree";

export type AgentSliceMap = SliceMapOf<AgentSliceId>;

export const AGENT_SLICE_IDS: AgentSliceId[] = ["watchdog", "trace", "bus", "worktree"];

export function createAgentSliceMap(): AgentSliceMap {
  return createSliceMapFor(AGENT_SLICE_IDS);
}

export function markAgentLoading(map: AgentSliceMap, id: AgentSliceId): AgentSliceMap {
  return markSliceLoading(map, id);
}

export function markAgentReady(map: AgentSliceMap, id: AgentSliceId, updatedAt: string): AgentSliceMap {
  return markSliceReady(map, id, updatedAt);
}

export function markAgentFailed(map: AgentSliceMap, id: AgentSliceId, error: string): AgentSliceMap {
  return markSliceFailed(map, id, error);
}

export function describeAgentSlice(state: SliceState): string {
  return describeSlice(state);
}

export function countFailedAgentSlices(map: AgentSliceMap): number {
  return countFailed(map, AGENT_SLICE_IDS);
}

const MESSAGE_TO_SLICE: Record<string, AgentSliceId> = {
  agent_bus_snapshot: "bus",
  agent_watchdog_snapshot: "watchdog",
  agent_worktree_snapshot: "worktree",
  multi_agent_trace_snapshot: "trace"
};

export function agentSliceForMessage(messageType: string): AgentSliceId | null {
  const id = MESSAGE_TO_SLICE[messageType];
  return id === undefined ? null : id;
}

export const AGENT_REQUEST_PREFIX = "agents-";

export function agentRequestId(id: AgentSliceId): string {
  return `${AGENT_REQUEST_PREFIX}${id}`;
}

export function agentSliceForRequestId(requestId: string): AgentSliceId | null {
  if (!requestId.startsWith(AGENT_REQUEST_PREFIX)) return null;
  const id = requestId.slice(AGENT_REQUEST_PREFIX.length) as AgentSliceId;
  return AGENT_SLICE_IDS.includes(id) ? id : null;
}

export type AgentTabDefinition = {
  id: AgentSliceId;
  label: string;
  hint: string;
};

/** 캡슐 탭 순서의 단일 출처. */
export const AGENT_TABS: AgentTabDefinition[] = [
  { id: "watchdog", label: "실행 중", hint: "지금 돌고 있는 작업자" },
  { id: "trace", label: "흐름", hint: "작업자·갈래·사람 확인 항목" },
  { id: "bus", label: "공유 기록", hint: "주고받은 메시지와 공유 상태" },
  { id: "worktree", label: "작업 폴더", hint: "갈라 쓴 git 폴더" }
];

/* -- 기록 남기기 ---------------------------------------------------------- */

export type AgentWriteKind = "message" | "board" | "lifecycle" | "command";

export const AGENT_WRITE_KINDS: { kind: AgentWriteKind; label: string }[] = [
  { kind: "message", label: "메시지" },
  { kind: "board", label: "공유 상태" },
  { kind: "lifecycle", label: "상태 변경" },
  { kind: "command", label: "그룹 명령" }
];

export function writeKindLabel(kind: AgentWriteKind): string {
  return AGENT_WRITE_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

type Draft = {
  messageFrom: string;
  messageBody: string;
  boardAgentId: string;
  boardKey: string;
  boardValue: string;
  lifecycleAgentId: string;
  lifecycleState: string;
  commandFrom: string;
  command: string;
  commandGroupId: string;
  commandRunId: string;
};

/** 못 누르는 이유. 버튼만 흐리게 두지 않는다. */
export function describeWriteBlock(kind: AgentWriteKind, draft: Draft): string {
  if (kind === "message") {
    if (draft.messageFrom.trim().length === 0) return "보낸 쪽을 입력하세요.";
    if (draft.messageBody.trim().length === 0) return "메시지 내용을 입력하세요.";
    return "";
  }
  if (kind === "board") {
    if (draft.boardAgentId.trim().length === 0) return "대상 작업자를 입력하세요.";
    if (draft.boardKey.trim().length === 0) return "항목 이름을 입력하세요.";
    if (draft.boardValue.trim().length === 0) return "저장할 내용을 입력하세요.";
    return "";
  }
  if (kind === "lifecycle") {
    if (draft.lifecycleAgentId.trim().length === 0) return "대상 작업자를 입력하세요.";
    if (draft.lifecycleState.trim().length === 0) return "상태를 입력하세요.";
    return "";
  }
  if (draft.commandFrom.trim().length === 0) return "보낸 쪽을 입력하세요.";
  if (draft.command.trim().length === 0) return "명령을 입력하세요.";
  if (draft.commandGroupId.trim().length === 0 && draft.commandRunId.trim().length === 0) {
    return "그룹 ID 나 실행 ID 중 하나를 입력하세요.";
  }
  return "";
}

export function formatAgentTime(value: string): string {
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
