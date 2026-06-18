import { useCallback, useState } from "react";
import { KeyRound, QrCode, ShieldCheck, ShieldOff, Copy } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import type { ShellCard } from "../../shell-store";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useTotpSettingsStore } from "./settings-totp-store";
import { requestDesktopOtp, submitDesktopOtp } from "../../use-middleware-session";

type CardErrorHandler = (card: ShellCard, message: string, componentStack?: string | null) => void;

// 서버(WebSocketGateway)와 동일하게 OTP 인증 유지시간을 1~168시간으로 제한한다.
function clampTtlHours(raw: string): number {
  const hours = Math.round(Number(raw));
  if (!Number.isFinite(hours)) return 1;
  return Math.min(168, Math.max(1, hours));
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "outline" }) {
  return (
    <div className="rounded-md border border-border bg-card/60 p-3">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <Badge tone={tone}>{value}</Badge>
      </div>
    </div>
  );
}

export function SettingsOtpPanel({ bridgeConnected, onError }: { bridgeConnected: boolean; onError: CardErrorHandler }) {
  const auth = useDesktopAuthStore((state) => state.auth);
  const totp = useTotpSettingsStore();
  const [otp, setOtp] = useState("");
  const [ttlHours, setTtlHours] = useState(24);
  const authed = auth.status === "authenticated";
  const enrolling = Boolean(totp.secret);

  const authenticate = useCallback(() => {
    submitDesktopOtp(otp, ttlHours);
    setOtp("");
  }, [otp, ttlHours]);

  const copySecret = useCallback(() => {
    if (totp.secret && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(totp.secret);
    }
  }, [totp.secret]);

  if (auth.remoteDashboardClient) {
    return (
      <CardBoundary title="외부 접속 제한 모드" card="operations" onError={onError}>
        <p className="text-sm text-muted-foreground">외부 접속에서는 OTP 없이 읽기 중심 조회와 모델/라우팅 설정만 허용됩니다.</p>
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">작업 실행, 인증, 시크릿, 외부접속 설정은 차단됩니다.</div>
      </CardBoundary>
    );
  }

  const loginHint = auth.lastMessage
    || (totp.enrolled
      ? "인증 앱(Authenticator)의 6자리 코드를 입력해 인증하세요. Telegram OTP도 사용할 수 있습니다."
      : auth.telegramConfigured
        ? "OTP 요청을 누르면 Telegram으로 코드가 전송됩니다. 또는 아래에서 인증 앱을 등록하세요."
        : "인증 앱(QR)을 등록하거나 Telegram 연동을 설정하면 코드로 인증할 수 있습니다.");

  return (
    <CardBoundary title="OTP 인증" card="operations" onError={onError}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">대시보드 접근 세션</p>
          <p className="truncate text-xs text-muted-foreground">인증 앱(TOTP) 또는 Telegram 봇으로 받은 6자리 코드로 인증합니다. 유지 시간은 1~168시간에서 선택합니다.</p>
        </div>
        <Badge tone={authed ? "success" : "warning"} className="shrink-0">{authed ? "인증됨" : "인증 필요"}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MiniStat label="인증 상태" value={authed ? "활성" : "대기"} tone={authed ? "success" : "warning"} />
        <MiniStat label="인증 앱" value={totp.enrolled ? "등록됨" : "미등록"} tone={totp.enrolled ? "success" : "outline"} />
        <MiniStat label="만료" value={auth.expiresAtLocal || auth.expiresAtUtc || "-"} tone="outline" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="min-w-0 space-y-1">
          <span className="text-xs font-medium text-muted-foreground">인증 코드 6자리</span>
          <Input
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            className="text-center font-mono tracking-[0.4em]"
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && bridgeConnected && otp.trim()) {
                event.preventDefault();
                authenticate();
              }
            }}
            disabled={!bridgeConnected}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">유지 시간</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              max={168}
              className="w-20 text-center font-mono"
              value={ttlHours}
              onChange={(event) => setTtlHours(clampTtlHours(event.target.value))}
              disabled={!bridgeConnected}
            />
            <span className="text-xs text-muted-foreground">시간</span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={requestDesktopOtp} disabled={!bridgeConnected || auth.otpRequestStatus === "pending"}>
          <KeyRound size={14} aria-hidden="true" /> {auth.otpRequestStatus === "pending" ? "OTP 요청 중..." : "Telegram OTP 요청"}
        </Button>
        <Button variant="primary" size="sm" onClick={authenticate} disabled={!bridgeConnected || !otp.trim()}>
          <ShieldCheck size={14} aria-hidden="true" /> 인증
        </Button>
      </div>

      <div className={cn("rounded-md border px-3 py-2 text-xs", "border-border bg-muted/40 text-muted-foreground")}>
        {loginHint}
      </div>

      {/* 인증 앱(TOTP) 등록 — Apple 암호 / Google Authenticator / Authy / 1Password 등 */}
      <div className="mt-1 space-y-3 rounded-lg border border-border bg-card/40 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <QrCode size={14} aria-hidden="true" /> 인증 앱(Authenticator)
            </p>
            <p className="text-xs text-muted-foreground">QR을 스캔해 Apple 암호·Google Authenticator·Authy·1Password 등에 등록하면, 앱이 만드는 6자리 코드로 로그인합니다.</p>
          </div>
          <Badge tone={totp.enrolled ? "success" : "outline"} className="shrink-0">{totp.enrolled ? "등록됨" : "미등록"}</Badge>
        </div>

        {enrolling ? (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="shrink-0 rounded-lg border border-border bg-white p-2">
                {totp.qrDataUrl ? (
                  <img src={totp.qrDataUrl} alt="인증 앱 등록용 QR 코드" width={180} height={180} className="block h-[180px] w-[180px]" />
                ) : (
                  <div className="flex h-[180px] w-[180px] items-center justify-center text-xs text-muted-foreground">QR 생성 중…</div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">수동 입력용 시크릿</span>
                  <div className="flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-xs">{totp.secret}</code>
                    <Button variant="outline" size="sm" onClick={copySecret} title="시크릿 복사">
                      <Copy size={13} aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">앱에 표시된 6자리 코드</span>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="text-center font-mono tracking-[0.4em]"
                    value={totp.codeInput}
                    onChange={(event) => totp.setCodeInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && bridgeConnected && totp.codeInput.trim().length === 6) {
                        event.preventDefault();
                        totp.confirmEnroll();
                      }
                    }}
                    disabled={!bridgeConnected}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={totp.confirmEnroll} disabled={!bridgeConnected || totp.codeInput.trim().length !== 6 || totp.loading}>
                    <ShieldCheck size={14} aria-hidden="true" /> 등록 완료
                  </Button>
                  <Button variant="outline" size="sm" onClick={totp.cancelEnroll} disabled={totp.loading}>
                    취소
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : totp.enrolled ? (
          <Button variant="outline" size="sm" onClick={totp.disable} disabled={!bridgeConnected || totp.loading}>
            <ShieldOff size={14} aria-hidden="true" /> 인증 앱 해제
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={totp.beginEnroll} disabled={!bridgeConnected || totp.loading}>
            <QrCode size={14} aria-hidden="true" /> {totp.loading && totp.pendingAction === "begin" ? "QR 생성 중..." : "인증 앱 등록 (QR)"}
          </Button>
        )}

        {totp.message ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{totp.message}</div>
        ) : null}
      </div>
    </CardBoundary>
  );
}
