/* ============================================================================
   상태 문자열 → 표시 색·이름 (순수 모듈, 공용).

   서버와 셸이 쓰는 status 값은 정해진 낱말이다. **정확히 일치**로만 해석한다.
   이전에는 화면마다 정규식 부분문자열로 각자 판정했고, 다음이 실제로 틀렸다:
     - `unavailable` 이 `available` 을 포함해 연결 실패가 초록(정상)으로 표시됐다.
     - `not_ready` 가 `ready` 를 포함해 준비되지 않은 미들웨어가 초록으로 표시됐다.
     - `disconnected` 가 `connected` 를 포함해 끊긴 연결이 초록으로 표시됐다.
   모르는 값은 성공으로 칠하지 않고 중립으로 두며 원문을 그대로 보여준다.
   ============================================================================ */

export type StatusTone = "success" | "warning" | "destructive" | "primary" | "default";

/**
 * 실제로 쓰이는 값만 담는다. 없는 값을 규칙으로 짐작하지 않는다.
 * 값이 늘어나면 여기에 추가하고, 검사에 함께 넣는다.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  // 정상
  ok: "success",
  available: "success",
  ready: "success",
  clean: "success",
  enabled: "success",
  present: "success",
  set: "success",
  configured: "success",
  installed: "success",
  yes: "success",
  connected: "success",
  authenticated: "success",
  healthy: "success",
  completed: "success",
  done: "success",
  started: "success",

  // 진행 중·정보
  discovered: "primary",
  ready_to_launch: "primary",
  ready_for_manual_routing: "primary",
  snapshot_only: "primary",
  snapshot: "primary",
  pending: "primary",
  running: "primary",
  connecting: "primary",
  waiting: "primary",
  probing: "primary",
  starting: "primary",
  requested: "primary",
  selected: "primary",
  // Git 자동화가 실제로 보내는 값
  ready_for_review: "primary",
  ready_for_pull_request: "primary",
  approved: "primary",
  // 작업자 감시가 실제로 보내는 값
  monitoring: "primary",
  dispatching: "primary",
  override: "primary",
  resolved: "primary",

  // 주의 — 실패는 아니지만 사람이 볼 필요가 있다.
  warning: "warning",
  warn: "warning",
  degraded: "warning",
  unverified: "warning",
  remote_unverified: "warning",
  partial: "warning",
  stale: "warning",
  canceled: "warning",
  cancelled: "warning",
  required: "warning",
  stopping: "warning",
  stderr: "warning",
  manual: "warning",
  not_ready: "warning",
  closed: "warning",
  terminated: "warning",
  needs_initial_push: "warning",
  missing_github_cli: "warning",
  rejected: "warning",
  stub: "warning",
  timeout_due: "warning",
  heartbeat_stale: "warning",
  attention_required: "warning",
  dirty: "warning",

  // 실패
  unavailable: "destructive",
  failed: "destructive",
  fail: "destructive",
  error: "destructive",
  invalid: "destructive",
  blocked: "destructive",
  timeout: "destructive",
  unreachable: "destructive",
  conflict: "destructive",
  disconnected: "destructive",
  unauthorized: "destructive",
  killed: "destructive",

  // 없음·끔 — 실패가 아니라 "해당 없음"이다. 중립으로 둔다.
  missing: "default",
  empty: "default",
  disabled: "default",
  skipped: "default",
  unset: "default",
  not_configured: "default",
  not_requested: "default",
  missing_remote: "default",
  missing_path: "default",
  not_git_worktree: "default",
  target_exists: "default",
  unknown: "default",
  idle: "default",
  no: "default",
  "shell-only": "default"
};

const STATUS_LABELS: Record<string, string> = {
  ok: "정상",
  available: "사용 가능",
  ready: "준비됨",
  clean: "변경 없음",
  enabled: "켜짐",
  present: "있음",
  set: "설정됨",
  configured: "설정됨",
  installed: "설치됨",
  yes: "예",
  connected: "연결됨",
  authenticated: "인증됨",
  healthy: "정상",
  completed: "완료",
  done: "완료",
  started: "시작됨",
  discovered: "찾음",
  ready_to_launch: "실행 준비",
  ready_for_manual_routing: "수동 선택 가능",
  snapshot_only: "스냅샷만",
  snapshot: "스냅샷",
  pending: "대기",
  running: "실행 중",
  connecting: "연결 중",
  waiting: "대기 중",
  probing: "확인 중",
  starting: "시작 중",
  requested: "요청됨",
  selected: "선택됨",
  ready_for_review: "검토 준비됨",
  ready_for_pull_request: "PR 준비됨",
  approved: "승인됨",
  monitoring: "감시 중",
  dispatching: "보내는 중",
  override: "직접 지정",
  resolved: "결정됨",
  warning: "주의",
  warn: "주의",
  degraded: "성능 저하",
  unverified: "확인 안 됨",
  remote_unverified: "원격 미확인",
  partial: "일부만",
  stale: "오래됨",
  canceled: "취소됨",
  cancelled: "취소됨",
  required: "인증 필요",
  stopping: "종료 중",
  stderr: "오류 출력",
  manual: "수동 확인",
  not_ready: "준비 안 됨",
  closed: "연결 끊김",
  terminated: "종료됨",
  needs_initial_push: "첫 push 필요",
  missing_github_cli: "GitHub CLI 없음",
  rejected: "거절됨",
  stub: "실제 장치 아님",
  timeout_due: "시간 초과 임박",
  heartbeat_stale: "신호 끊김",
  attention_required: "확인 필요",
  dirty: "변경 있음",
  unavailable: "사용 불가",
  failed: "실패",
  fail: "실패",
  error: "오류",
  invalid: "잘못된 값",
  blocked: "차단됨",
  timeout: "시간 초과",
  unreachable: "도달 불가",
  conflict: "충돌",
  disconnected: "연결 끊김",
  unauthorized: "권한 없음",
  killed: "강제 종료됨",
  missing: "없음",
  empty: "비어 있음",
  disabled: "꺼짐",
  skipped: "건너뜀",
  unset: "설정 안 됨",
  not_configured: "설정 안 됨",
  not_requested: "확인 전",
  missing_remote: "원격 없음",
  missing_path: "경로 없음",
  not_git_worktree: "git 작업 폴더 아님",
  target_exists: "이미 있음",
  unknown: "알 수 없음",
  idle: "대기",
  no: "아니오",
  "shell-only": "셸만 실행"
};

function normalize(status: string): string {
  return (status ?? "").trim().toLowerCase();
}

/** 모르는 값은 중립이다. 절대 success 로 떨어지지 않는다. */
export function statusTone(status: string): StatusTone {
  const tone = STATUS_TONES[normalize(status)];
  return tone === undefined ? "default" : tone;
}

/** 사람이 읽는 이름. 모르는 값은 원문을 그대로 보여준다. */
export function statusLabel(status: string): string {
  const value = normalize(status);
  if (value.length === 0) return "-";
  const label = STATUS_LABELS[value];
  return label === undefined ? status.trim() : label;
}

/** 사람이 손봐야 하는 상태인지. 요약에서 문제 건수를 셀 때 쓴다. */
export function isProblemStatus(status: string): boolean {
  return statusTone(status) === "destructive";
}

export function isWarningStatus(status: string): boolean {
  return statusTone(status) === "warning";
}

/** 아는 값인지. 화면이 "모르는 상태"임을 밝힐 수 있게 한다. */
export function isKnownStatus(status: string): boolean {
  return STATUS_TONES[normalize(status)] !== undefined;
}

/** 검사에서 전체 목록을 대조하기 위한 읽기 전용 보기. */
export function knownStatusValues(): string[] {
  return Object.keys(STATUS_TONES);
}
