import { GitBranch, GitCommit, GitPullRequest, UploadCloud, type LucideIcon } from "lucide-react";
import type { ShellCard } from "../../shell-store";
import type { GitOperationName } from "../middleware/git-gateway";
import type { ContextItem, ContextSource, CronJobForm, LogicPathEntry, useOpsPageStore } from "./ops-store";

export type OpsPageState = ReturnType<typeof useOpsPageStore.getState>;
export type OpsGitState = OpsPageState["git"];
export type OpsToolsState = OpsPageState["tools"];
export type OpsStoreActions = OpsPageState;
export type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;

export const OPERATION_OPTIONS = [
  { value: "stage_and_commit", label: "선택 파일 커밋" },
  { value: "snapshot_commit", label: "스냅샷 커밋" },
  { value: "create_branch", label: "브랜치 생성" },
  { value: "push_current_branch", label: "현재 브랜치 push" },
  { value: "open_pull_request", label: "PR 생성" }
] as const satisfies readonly { readonly value: GitOperationName; readonly label: string }[];

export const COMMAND_EXAMPLES = [
  { label: "도움말", value: "/help natural" },
  { label: "연결 상태", value: "/llm status" },
  { label: "계획 목록", value: "/plan list" },
  { label: "노트 보기", value: "/notebook show" },
  { label: "지표 확인", value: "/metrics" }
] as const;

export const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

export type BadgeTone = "success" | "warning" | "destructive" | "primary" | "default" | "outline";

export type WorkspaceCandidate = {
  readonly key: string;
  readonly path: string;
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly isDirectory: boolean;
  readonly browsePath: string;
};

export function statusLabel(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) return "-";
  const labels: Record<string, string> = {
    applied: "적용됨",
    blocked: "막힘",
    clean: "변경 없음",
    dirty: "변경 있음",
    error: "오류",
    fail: "실패",
    failed: "실패",
    idle: "대기",
    ok: "정상",
    pending: "대기",
    preview: "미리보기",
    ready: "준비됨",
    review: "검토 필요",
    running: "실행 중",
    skip: "건너뜀",
    skipped: "건너뜀",
    success: "성공",
    warn: "주의",
    warning: "주의"
  };
  return labels[text.toLowerCase()] || text;
}

export function tone(value: string): BadgeTone {
  const text = value.toLowerCase();
  if (/(ready|passed|clean|applied|ok)/.test(text)) return "success";
  if (/(warning|missing|initial|dirty|review)/.test(text)) return "warning";
  if (/(blocked|error|failed|conflict)/.test(text)) return "destructive";
  if (/(preview|pending|running)/.test(text)) return "primary";
  return value ? "outline" : "default";
}

export function operationIcon(operation: string): LucideIcon {
  if (operation === "open_pull_request") return GitPullRequest;
  if (operation === "push_current_branch") return UploadCloud;
  if (operation === "create_branch") return GitBranch;
  return GitCommit;
}

export function operationLabel(value: string): string {
  return OPERATION_OPTIONS.find((operation) => operation.value === value)?.label || value;
}

export function parseGitOperationName(value: string): GitOperationName {
  return OPERATION_OPTIONS.find((operation) => operation.value === value)?.value || "stage_and_commit";
}

export function parseCronScheduleKind(value: string): CronJobForm["scheduleKind"] {
  if (value === "cron" || value === "every" || value === "at") return value;
  return "cron";
}

export function parseCronSessionTarget(value: string): CronJobForm["sessionTarget"] {
  if (value === "main" || value === "isolated" || value === "") return value;
  return "main";
}

export function parseCronWakeMode(value: string): CronJobForm["wakeMode"] {
  if (value === "next-heartbeat" || value === "now") return value;
  return "next-heartbeat";
}

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

export function formatDateTimeMs(value: number | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function formatDateTimeUtc(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function formatDurationMs(value: number | null): string {
  if (!value) return "-";
  if (value < 1000) return `${value}ms`;
  return `${Math.round(value / 1000)}s`;
}

export function compactPath(pathValue: string, maxSegments = 4): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return normalized || "/";
  return `.../${segments.slice(-maxSegments).join("/")}`;
}

export function buildWorkspaceCandidates(input: {
  readonly items: readonly LogicPathEntry[];
  readonly sources: readonly ContextSource[];
  readonly commands: readonly ContextItem[];
  readonly recentFiles: readonly string[];
  readonly currentPreviewPath: string;
  readonly query: string;
}): WorkspaceCandidate[] {
  const candidates: WorkspaceCandidate[] = [];
  const seen = new Set<string>();
  for (const item of input.items) {
    addWorkspaceCandidate(candidates, seen, {
      path: item.isDirectory ? item.browsePath : item.selectPath,
      name: item.name,
      description: item.description || item.selectPath || item.browsePath,
      source: "현재 폴더",
      isDirectory: item.isDirectory,
      browsePath: item.browsePath
    });
  }
  for (const source of input.sources) {
    addWorkspaceCandidate(candidates, seen, {
      path: source.path,
      name: basename(source.path),
      description: `${source.scope} · 지침 원본`,
      source: "문맥",
      isDirectory: false,
      browsePath: ""
    });
  }
  for (const command of input.commands) {
    addWorkspaceCandidate(candidates, seen, {
      path: command.path,
      name: command.name || basename(command.path),
      description: command.summary || command.description || command.path,
      source: "명령",
      isDirectory: false,
      browsePath: ""
    });
  }
  for (const path of input.recentFiles) {
    addWorkspaceCandidate(candidates, seen, {
      path,
      name: basename(path),
      description: "최근 미리보기",
      source: "최근",
      isDirectory: false,
      browsePath: ""
    });
  }
  if (input.currentPreviewPath) {
    addWorkspaceCandidate(candidates, seen, {
      path: input.currentPreviewPath,
      name: basename(input.currentPreviewPath),
      description: "현재 미리보기",
      source: "현재",
      isDirectory: false,
      browsePath: ""
    });
  }
  const directPath = input.query.trim();
  if (/[/\\.]|^~/.test(directPath)) {
    addWorkspaceCandidate(candidates, seen, {
      path: directPath,
      name: basename(directPath),
      description: "직접 입력 경로",
      source: "직접",
      isDirectory: false,
      browsePath: ""
    });
  }
  return candidates;
}

export function filterWorkspaceCandidates(candidates: readonly WorkspaceCandidate[], query: string): WorkspaceCandidate[] {
  const normalized = query.trim().toLowerCase();
  const sorted = [...candidates].sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.path.localeCompare(b.path));
  if (!normalized) return sorted.slice(0, 60);
  return sorted
    .filter((candidate) => `${candidate.name} ${candidate.path} ${candidate.description} ${candidate.source}`.toLowerCase().includes(normalized))
    .slice(0, 80);
}

function basename(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || "/";
}

function addWorkspaceCandidate(target: WorkspaceCandidate[], seen: Set<string>, candidate: Omit<WorkspaceCandidate, "key">): void {
  if (!candidate.path.trim()) return;
  const key = `${candidate.isDirectory ? "dir" : "file"}:${candidate.path}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ ...candidate, key });
}
