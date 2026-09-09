/* ============================================================================
   활동 화면이 쓰는 값 모델(순수).
   화면·저장소를 가져오지 않는다.

   화면은 한 화면에 들어가야 한다. 그래서 목록은 접힌 줄로 두고,
   자세한 내용은 그 줄을 펼쳤을 때만 보여준다.
   ============================================================================ */

export type Level = "info" | "warn" | "error";

export type Entry = {
  id: string;
  level: Level;
  message: string;
  createdAt: string;
  source: string;
  componentStack: string | null;
};

const LEVEL_LABEL: Record<Level, string> = { info: "정보", warn: "주의", error: "오류" };

export function levelLabel(level: Level): string {
  return LEVEL_LABEL[level];
}

const SOURCE_LABEL: Record<string, string> = {
  middleware: "미들웨어",
  runtime: "런타임",
  logs: "로그",
  navigation: "이동",
  operations: "작업",
  auth: "인증",
  doctor: "진단",
  ops: "운영",
  shell: "셸"
};

/** 모르는 출처는 원문 그대로 보여준다. 임의로 다른 이름을 붙이지 않는다. */
export function sourceLabel(source: string): string {
  const label = SOURCE_LABEL[source];
  return label === undefined ? source : label;
}

type Rule = { prefix: string; label: string; withRest?: boolean };

/**
 * 기계용 접두사만 사람이 읽는 제목으로 바꾼다.
 * 맨 앞에서만 맞춘다. 본문 가운데 같은 글자가 있어도 바뀌지 않는다.
 */
const RULES: Rule[] = [
  { prefix: "logic_path_list:", label: "경로 목록", withRest: true },
  { prefix: "task_graph_list:", label: "작업 그래프", withRest: true },
  { prefix: "plan_list:", label: "계획 목록", withRest: true },
  { prefix: "commands_list:", label: "명령 목록", withRest: true },
  { prefix: "cleanup_preview:", label: "정리 후보", withRest: true },
  { prefix: "cleanup_apply:", label: "정리 적용", withRest: true },
  { prefix: "get_metrics:", label: "자원 사용량 확인" },
  { prefix: "get_setup_state:", label: "설정 상태 수신" },
  { prefix: "readyz probe=ok", label: "준비 상태 정상" },
  { prefix: "readyz probe=error", label: "준비 상태 실패" },
  { prefix: "healthz probe=ok", label: "상태 확인 정상" },
  { prefix: "healthz probe=error", label: "상태 확인 실패" },
  { prefix: "doctor_get_last:", label: "진단 결과 수신" },
  { prefix: "doctor_fix_", label: "진단 자동 수정" },
  { prefix: "context_scan:", label: "프로젝트 문맥 조회" },
  { prefix: "read_workspace_file:", label: "작업 파일 읽기" },
  { prefix: "guard_alert_dispatch:", label: "경보 전달" },
  { prefix: "guard retry timeline:", label: "재시도 집계 조회" },
  { prefix: "telegram_stub:", label: "텔레그램 점검" },
  { prefix: "nodes_", label: "장치 명령 결과" },
  { prefix: "cron_", label: "예약 작업 결과" },
  { prefix: "command:", label: "명령 실행" }
];

export function entryTitle(message: string): string {
  const text = (message ?? "").trim();
  if (text.length === 0) return "본문 없는 기록";
  for (const rule of RULES) {
    if (!text.startsWith(rule.prefix)) continue;
    if (!rule.withRest) return rule.label;
    const rest = text.slice(rule.prefix.length).trim();
    return rest.length === 0 ? rule.label : `${rule.label} ${rest}`;
  }
  return text;
}

export function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "-";
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "-";
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function countLevels(entries: readonly Entry[]): Record<Level, number> {
  const counts: Record<Level, number> = { info: 0, warn: 0, error: 0 };
  for (const entry of entries) counts[entry.level] += 1;
  return counts;
}

export function filterByLevel(entries: readonly Entry[], level: Level | "all"): Entry[] {
  return level === "all" ? [...entries] : entries.filter((entry) => entry.level === level);
}

/** 빌드 화면으로 넘길 본문. 원문을 그대로 싣는다. */
export function buildHandoff(entry: Entry): string {
  const lines = [
    "이 활동 기록을 보고 원인을 확인해줘.",
    "",
    `레벨: ${levelLabel(entry.level)}`,
    `출처: ${sourceLabel(entry.source)} (${entry.source})`,
    `시각: ${formatDateTime(entry.createdAt)}`,
    `본문: ${entry.message}`
  ];
  if (entry.componentStack) lines.push("", "컴포넌트 기록:", entry.componentStack);
  return lines.join("\n");
}

/* --------------------------------------------------------------------------
   세션 타임라인
   -------------------------------------------------------------------------- */

export type TimelineIdKind = "conversation" | "run" | "agent" | "group";

export const TIMELINE_KINDS: { kind: TimelineIdKind; label: string }[] = [
  { kind: "conversation", label: "대화" },
  { kind: "run", label: "실행" },
  { kind: "agent", label: "작업자" },
  { kind: "group", label: "그룹" }
];

export function timelineFields(kind: TimelineIdKind, value: string) {
  const trimmed = (value ?? "").trim();
  return {
    conversationId: kind === "conversation" ? trimmed : "",
    runId: kind === "run" ? trimmed : "",
    agentId: kind === "agent" ? trimmed : "",
    groupId: kind === "group" ? trimmed : ""
  };
}

export function timelineSeverityLabel(severity: string): string {
  if (severity === "error") return "오류";
  if (severity === "warning") return "주의";
  if (severity === "info") return "정보";
  return severity.length === 0 ? "기록" : severity;
}

/** 서버가 보내는 값은 error/warning/info 셋이다. 그 밖은 색으로 단정하지 않는다. */
export function timelineSeverityTone(severity: string): "destructive" | "warning" | "success" | "default" {
  if (severity === "error") return "destructive";
  if (severity === "warning") return "warning";
  if (severity === "info") return "success";
  return "default";
}

export const TIMELINE_PAGE_SIZE = 15;
