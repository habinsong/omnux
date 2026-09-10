/* ============================================================================
   상태 화면이 쓰는 값 모델(순수).
   화면·저장소를 가져오지 않는다.

   이 화면은 볼 것이 많다. 그래서 위쪽 캡슐 탭으로 크게 나누고,
   각 탭 안에서 접힌 칸으로 다시 나눈다. 한 번에 하나만 열린다.
   ============================================================================ */

export type OpsGroupId = "check" | "work" | "tools";
export type OpsPanelId =
  | "doctor"
  | "plans"
  | "git"
  | "schedule"
  | "devices"
  | "alerts"
  | "context"
  | "cleanup"
  | "command";

export type OpsPanelDefinition = {
  id: OpsPanelId;
  group: OpsGroupId;
  label: string;
  hint: string;
  /** 열 때 조회하는 칸인지. 조작만 하는 칸은 열어도 요청을 보내지 않는다. */
  loadOnOpen: boolean;
};

export const OPS_GROUPS: { id: OpsGroupId; label: string }[] = [
  { id: "check", label: "점검" },
  { id: "work", label: "작업" },
  { id: "tools", label: "도구" }
];

export const OPS_PANELS: OpsPanelDefinition[] = [
  { id: "doctor", group: "check", label: "환경 진단", hint: "최근 보고서와 자동 수정", loadOnOpen: true },
  { id: "plans", group: "check", label: "계획·작업 흐름", hint: "저장된 계획 수", loadOnOpen: true },
  { id: "devices", group: "check", label: "연결 장치", hint: "장치와 페어링 대기", loadOnOpen: true },
  { id: "alerts", group: "check", label: "재시도·경보", hint: "채널별 재시도 집계", loadOnOpen: true },

  { id: "git", group: "work", label: "Git 작업", hint: "미리보기 뒤에만 적용", loadOnOpen: true },
  { id: "schedule", group: "work", label: "예약 작업", hint: "등록·실행 기록", loadOnOpen: true },

  { id: "context", group: "tools", label: "문맥·파일", hint: "지침과 작업 파일 보기", loadOnOpen: true },
  { id: "cleanup", group: "tools", label: "정리", hint: "지울 후보를 먼저 확인", loadOnOpen: false },
  { id: "command", group: "tools", label: "명령 실행", hint: "명령을 보내고 결과 보기", loadOnOpen: false }
];

export function panelsOfGroup(group: OpsGroupId): OpsPanelDefinition[] {
  return OPS_PANELS.filter((panel) => panel.group === group);
}

export function panelDefinition(id: OpsPanelId): OpsPanelDefinition {
  const found = OPS_PANELS.find((panel) => panel.id === id);
  if (found === undefined) throw new Error(`알 수 없는 칸: ${id}`);
  return found;
}

export type LoadStatus = "idle" | "loading" | "ready" | "failed";

export type LoadSignal = { loading: boolean; error: string; hasResult: boolean };

/** 진행 중을 실패보다 먼저 본다. 다시 조회하는 동안 이전 실패 문구가 남아도 "조회 중"이 맞다. */
export function deriveStatus(signal: LoadSignal): LoadStatus {
  if (signal.loading) return "loading";
  if (signal.error.length > 0) return "failed";
  return signal.hasResult ? "ready" : "idle";
}

export function describeStatus(status: LoadStatus, hint: string, loadOnOpen: boolean): string {
  if (status === "loading") return "조회 중";
  if (status === "failed") return "실패";
  if (status === "ready") return "완료";
  return loadOnOpen ? "열면 조회" : hint;
}

/* --------------------------------------------------------------------------
   표시 형식
   -------------------------------------------------------------------------- */

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function formatDuration(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}초`;
}

export function formatUtc(value: string): string {
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

export function formatEpoch(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/** 긴 경로는 뒤쪽만 남긴다. 원문은 title 로 함께 준다. */
export function shortPath(value: string, segments = 3): string {
  const normalized = (value ?? "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= segments) return normalized || "/";
  return `…/${parts.slice(-segments).join("/")}`;
}

export function baseName(value: string): string {
  const normalized = (value ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || "/";
}
