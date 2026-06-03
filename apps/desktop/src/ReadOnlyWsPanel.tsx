import { useCallback, useState } from "react";
import { useDesktopAuthStore } from "./features/auth/auth-store";
import { useOpsPageStore } from "./features/ops/ops-store";
import { useDesktopShellStore } from "./shell-store";
import { ShellFault } from "./ShellFault";
import {
  requestDesktopDoctorLast,
  requestDesktopOpsSnapshot,
  requestDesktopOtp,
  submitDesktopOtp
} from "./use-middleware-session";

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

  return (
    <>
      {bridge.lastError ? <ShellFault label={bridge.lastError} /> : null}
      {doctor.lastError ? <ShellFault label={doctor.lastError} /> : null}
      {ops.lastError ? <ShellFault label={ops.lastError} /> : null}
      <dl className="status-list">
        <div>
          <dt>bridge</dt>
          <dd>
            <span className={`status-pill status-${bridge.status}`}>{bridge.status}</span>
          </dd>
        </div>
        <div>
          <dt>auth</dt>
          <dd>
            <span className={`status-pill status-${auth.status}`}>{auth.status}</span>
            <span className="status-detail">{auth.lastMessage || "세션 이벤트 대기"}</span>
          </dd>
        </div>
        <div>
          <dt>session</dt>
          <dd>{auth.sessionId || "-"}</dd>
        </div>
        <div>
          <dt>expires</dt>
          <dd>{auth.expiresAtLocal || auth.expiresAtUtc || "-"}</dd>
        </div>
        <div>
          <dt>doctor</dt>
          <dd>
            {doctor.loading ? "조회 중..." : doctor.summary || "조회 전"}
            {doctor.reportId ? <span className="status-detail">{doctor.reportId}</span> : null}
          </dd>
        </div>
        <div>
          <dt>plans</dt>
          <dd>
            {ops.loadingPlans ? "조회 중..." : `${ops.planCount}건`}
            {ops.latestPlanTitle ? <span className="status-detail">{ops.latestPlanTitle}</span> : null}
          </dd>
        </div>
        <div>
          <dt>tasks</dt>
          <dd>
            {ops.loadingTaskGraphs ? "조회 중..." : `${ops.taskGraphCount}건`}
            {ops.latestTaskGraphStatus ? <span className="status-detail">{ops.latestTaskGraphStatus}</span> : null}
          </dd>
        </div>
      </dl>
      <div className="auth-controls">
        <button
          className="secondary-button"
          type="button"
          disabled={bridge.status !== "connected" || auth.otpRequestStatus === "pending"}
          onClick={requestDesktopOtp}
        >
          {auth.otpRequestStatus === "pending" ? "OTP 요청 중..." : "OTP 요청"}
        </button>
        <input
          className="otp-input"
          inputMode="numeric"
          maxLength={6}
          placeholder="OTP 6자리"
          value={otp}
          onChange={(event) => setOtp(event.target.value)}
        />
        <button className="secondary-button" type="button" disabled={bridge.status !== "connected"} onClick={authenticateWithOtp}>
          인증
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={auth.status !== "authenticated" || doctor.loading}
          onClick={requestDesktopDoctorLast}
        >
          최근 Doctor 보고서
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={auth.status !== "authenticated" || ops.loadingPlans || ops.loadingTaskGraphs}
          onClick={requestDesktopOpsSnapshot}
        >
          운영 목록 조회
        </button>
      </div>
    </>
  );
}
