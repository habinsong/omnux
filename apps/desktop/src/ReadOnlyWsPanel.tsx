import { useCallback, useState, type ReactNode } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { useOpsPageStore } from "./features/ops/ops-store";
import { useDesktopShellStore } from "./shell-store";
import { ShellFault } from "./ShellFault";
import { Badge, Button, Input } from "./components/ui/primitives";
import {
  requestDesktopDoctorLast,
  requestDesktopOpsSnapshot,
  requestDesktopOtp,
  submitDesktopOtp
} from "./use-middleware-session";

function statusTone(status: string): "success" | "warning" | "destructive" | "default" {
  if (/(connected|authenticated|ok|ready)/i.test(status)) return "success";
  if (/(error|fail|blocked|disconnected)/i.test(status)) return "destructive";
  if (/(connecting|waiting|pending)/i.test(status)) return "warning";
  return "default";
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
  const [otp, setOtp] = useState("");

  const authenticateWithOtp = useCallback(() => {
    submitDesktopOtp(otp);
    setOtp("");
  }, [otp]);

  const detail = (text?: string | null) => (text ? <span className="max-w-[220px] truncate text-[10px] text-muted-foreground">{text}</span> : null);
  const doctorSummary = doctor.report
    ? `ok=${doctor.report.okCount} warn=${doctor.report.warnCount} fail=${doctor.report.failCount}`
    : doctor.found === false
      ? "보고서 없음"
      : "조회 전";

  return (
    <div className="space-y-3">
      {bridge.lastError ? <ShellFault label={bridge.lastError} /> : null}
      {doctor.lastError ? <ShellFault label={doctor.lastError} /> : null}
      {ops.lastError ? <ShellFault label={ops.lastError} /> : null}
      <dl>
        <KV k="bridge"><Badge tone={statusTone(bridge.status)}>{bridge.status}</Badge></KV>
        <KV k="auth">
          <Badge tone={statusTone(auth.status)}>{auth.status}</Badge>
          {detail(auth.lastMessage || "세션 이벤트 대기")}
        </KV>
        <KV k="session"><span className="font-mono">{auth.sessionId || "-"}</span></KV>
        <KV k="expires"><span className="font-mono">{auth.expiresAtLocal || auth.expiresAtUtc || "-"}</span></KV>
        <KV k="doctor">
          <span>{doctor.loading || doctor.running ? "조회 중..." : doctorSummary}</span>
          {detail(doctor.report?.reportId)}
        </KV>
        <KV k="plans">
          <span>{ops.loadingPlans ? "조회 중..." : `${ops.planCount}건`}</span>
          {detail(ops.latestPlanTitle)}
        </KV>
        <KV k="tasks">
          <span>{ops.loadingTaskGraphs ? "조회 중..." : `${ops.taskGraphCount}건`}</span>
          {detail(ops.latestTaskGraphStatus)}
        </KV>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={bridge.status !== "connected" || auth.otpRequestStatus === "pending"} onClick={requestDesktopOtp}>
          {auth.otpRequestStatus === "pending" ? "OTP 요청 중..." : "OTP 요청"}
        </Button>
        <Input
          className="h-8 w-28 text-center font-mono tracking-widest"
          inputMode="numeric"
          maxLength={6}
          placeholder="OTP 6자리"
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
        />
        <Button variant="outline" size="sm" disabled={bridge.status !== "connected"} onClick={authenticateWithOtp}>인증</Button>
        <Button variant="outline" size="sm" disabled={auth.status !== "authenticated" || doctor.loading} onClick={requestDesktopDoctorLast}>
          최근 Doctor 보고서
        </Button>
        <Button variant="outline" size="sm" disabled={auth.status !== "authenticated" || ops.loadingPlans || ops.loadingTaskGraphs} onClick={requestDesktopOpsSnapshot}>
          운영 목록 조회
        </Button>
      </div>
    </div>
  );
}
