import { useEffect, useState } from "react";
import { Button, Badge } from "../../components/ui/primitives";
import { subscribeDesktopMessages } from "../middleware/desktop-message-gateway";
import { requestDesktopLlm } from "../middleware/llm-gateway";

type GrokStatus = { installed: boolean; authenticated: boolean; mode: string; message: string; loginUrl: string; userCode: string };

export function GrokConnectionPanel({ canRequest }: { canRequest: boolean }) {
  const [status, setStatus] = useState<GrokStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const signingIn = status?.mode === "oauth_pending";
  const send = (request: () => boolean) => {
    setError("");
    const sent = request();
    setPending(sent);
    if (!sent) setError("요청을 전송하지 못했습니다. 미들웨어 연결을 확인해 주세요.");
  };

  useEffect(() => subscribeDesktopMessages((message) => {
    if (message.type !== "grok_status") return;
    const value = (message.payload || {}) as Partial<GrokStatus>;
    setStatus({ installed: value.installed === true, authenticated: value.authenticated === true,
      mode: String(value.mode || "unknown"), message: String(value.message || ""),
      loginUrl: String(value.loginUrl || ""), userCode: String(value.userCode || "") });
    setPending(false);
  }), []);

  useEffect(() => {
    if (canRequest) send(requestDesktopLlm.grokStatus);
    else setPending(false);
  }, [canRequest]);

  useEffect(() => {
    if (!canRequest || !signingIn) return;
    const timer = window.setInterval(requestDesktopLlm.grokStatus, 1500);
    return () => window.clearInterval(timer);
  }, [canRequest, signingIn]);

  let loginUrl = "";
  try {
    const url = new URL(status?.loginUrl || "");
    if (url.protocol === "https:" && ["auth.x.ai", "accounts.x.ai"].includes(url.hostname)) loginUrl = url.href;
  } catch { /* 인증 주소가 아직 도착하지 않았습니다. */ }

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-4" aria-label="Grok OAuth 연결">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Grok</h3>
        <Badge tone={status?.authenticated ? "success" : "outline"}>{status?.authenticated ? "연결됨" : signingIn ? "로그인 중" : "미연결"}</Badge>
      </div>
      <p role="status" className="text-sm text-muted-foreground">{status?.message || "Grok Build CLI의 OAuth 계정으로 연결합니다."}</p>
      {status?.installed === false ? <a href="https://docs.x.ai/build/overview" target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Grok Build 설치 안내</a> : null}
      {loginUrl ? <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3">
        <a href={loginUrl} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">Grok 로그인 페이지 열기</a>
        {status?.userCode ? <code className="text-base font-semibold tracking-wider">{status.userCode}</code> : null}
      </div> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!canRequest || pending} onClick={() => send(requestDesktopLlm.grokStatus)}>상태 확인</Button>
        {signingIn ? <Button variant="outline" size="sm" disabled={!canRequest} onClick={() => send(requestDesktopLlm.cancelGrokLogin)}>로그인 취소</Button>
          : <Button variant="primary" size="sm" disabled={!canRequest || pending || status?.installed === false} onClick={() => send(requestDesktopLlm.startGrokLogin)}>OAuth 로그인</Button>}
        {status?.authenticated ? <Button variant="ghost" size="sm" disabled={!canRequest || pending} onClick={() => send(requestDesktopLlm.logoutGrok)}>로그아웃</Button> : null}
      </div>
    </section>
  );
}
