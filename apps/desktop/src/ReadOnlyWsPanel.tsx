import type { ReactNode } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { useOpsPageStore } from "./features/ops/ops-store";
import { useDesktopShellStore } from "./shell-store";
import { ShellFault } from "./ShellFault";
import { Badge, Button } from "./components/ui/primitives";
import {
  requestDesktopDoctorLast,
  requestDesktopOpsSnapshot
} from "./use-middleware-session";

function statusTone(status: string): "success" | "warning" | "destructive" | "default" {
  if (/(connected|authenticated|ok|ready)/i.test(status)) return "success";
  if (/(error|fail|blocked|disconnected)/i.test(status)) return "destructive";
  if (/(connecting|waiting|pending)/i.test(status)) return "warning";
  return "default";
}

function statusLabel(status: string | null | undefined): string {
  const text = status?.trim();
  if (!text) return "-";
  const labels: Record<string, string> = {
    authenticated: "인증됨",
    blocked: "막힘",
    connected: "연결됨",
    connecting: "연결 중",
    disconnected: "끊김",
    error: "오류",
    fail: "실패",
    failed: "실패",
    ok: "정상",
    pending: "대기",
    ready: "준비됨",
    unknown: "알 수 없음",
    warn: "주의",
    warning: "주의",
    waiting: "대기 중"
  };
  return labels[text.toLowerCase()] || text;
}

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2 text-xs last:border-0">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="flex min-w-0 flex-col items-end gap-0.5 text-right text-foreground">{children}</dd>
    </div>
  );
}

export function ReadOnlyWsPanel() {
  const bridge = useDesktopShellStore((state) => state.bridge);
  const auth = useDesktopAuthStore((state) => state.auth);
  const doctor = useOpsPageStore((state) => state.doctor);
  const ops = useOpsPageStore((state) => state.ops);

  const detail = (text?: string | null) => (text ? <span className="max-w-[220px] truncate text-[10px] text-muted-foreground">{text}</span> : null);
  const doctorSummary = doctor.report
    ? `정상 ${doctor.report.okCount} · 주의 ${doctor.report.warnCount} · 실패 ${doctor.report.failCount}`
    : doctor.found === false
      ? "보고서 없음"
      : "조회 전";

  return (
    <div className="space-y-3">
      {bridge.lastError ? <ShellFault label={bridge.lastError} /> : null}
      {doctor.lastError ? <ShellFault label={doctor.lastError} /> : null}
      {ops.lastError ? <ShellFault label={ops.lastError} /> : null}
      <dl>
        <KV k="연결"><Badge tone={statusTone(bridge.status)}>{statusLabel(bridge.status)}</Badge></KV>
        <KV k="인증">
          <Badge tone={statusTone(auth.status)}>{statusLabel(auth.status)}</Badge>
        </KV>
        <KV k="세션"><span className="font-mono">{auth.sessionId || "-"}</span></KV>
        <KV k="만료"><span className="font-mono">{auth.expiresAtLocal || auth.expiresAtUtc || "-"}</span></KV>
        <KV k="진단">
          <span>{doctor.loading || doctor.running ? "조회 중..." : doctorSummary}</span>
          {detail(doctor.report?.reportId)}
        </KV>
        <KV k="계획">
          <span>{ops.loadingPlans ? "조회 중..." : `${ops.planCount}건`}</span>
          {detail(ops.latestPlanTitle)}
        </KV>
        <KV k="작업">
          <span>{ops.loadingTaskGraphs ? "조회 중..." : `${ops.taskGraphCount}건`}</span>
          {ops.latestTaskGraphStatus ? detail(statusLabel(ops.latestTaskGraphStatus)) : null}
        </KV>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={auth.status !== "authenticated" || doctor.loading} onClick={requestDesktopDoctorLast}>
          최근 진단 보고서
        </Button>
        <Button variant="outline" size="sm" disabled={auth.status !== "authenticated" || ops.loadingPlans || ops.loadingTaskGraphs} onClick={requestDesktopOpsSnapshot}>
          작업 목록 조회
        </Button>
      </div>
    </div>
  );
}
