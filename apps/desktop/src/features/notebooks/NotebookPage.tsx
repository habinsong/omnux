import { useEffect } from "react";
import { BookOpen, CheckCircle2, GitPullRequestArrow, Lightbulb, RefreshCcw, ScrollText, Send } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useNotebookPageBridge, useNotebookStore } from "./notebook-store";
import type { NotebookKind } from "../middleware/notebook-gateway";
import { Badge, Button, Textarea, cn } from "../../components/ui/primitives";

const KINDS: Array<{ key: NotebookKind; label: string; icon: typeof Lightbulb; tint: string }> = [
  { key: "learning", label: "학습", icon: Lightbulb, tint: "bg-blue-500/12 text-blue-500" },
  { key: "decision", label: "결정", icon: ScrollText, tint: "bg-violet-500/12 text-violet-500" },
  { key: "verification", label: "검증", icon: CheckCircle2, tint: "bg-emerald-500/12 text-emerald-500" }
];

const DOCS: Array<{ field: "learnings" | "decisions" | "verification" | "handoff"; label: string; icon: typeof Lightbulb; tint: string }> = [
  { field: "learnings", label: "학습 (learning)", icon: Lightbulb, tint: "bg-blue-500/12 text-blue-500" },
  { field: "decisions", label: "결정 (decision)", icon: ScrollText, tint: "bg-violet-500/12 text-violet-500" },
  { field: "verification", label: "검증 (verification)", icon: CheckCircle2, tint: "bg-emerald-500/12 text-emerald-500" },
  { field: "handoff", label: "핸드오프 (handoff)", icon: GitPullRequestArrow, tint: "bg-amber-500/12 text-amber-500" }
];

export function NotebookPage() {
  useNotebookPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useNotebookStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useEffect(() => {
    if (canRequest) store.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRequest]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">노트북 / 핸드오프</h1>
          <p className="text-sm text-muted-foreground">학습·결정·검증을 컨텍스트 노트북에 누적하고, 작업을 다른 세션/디바이스로 핸드오프합니다.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={store.load} disabled={!canRequest || store.loading}>
            <RefreshCcw size={15} aria-hidden="true" /> {store.loading ? "조회 중" : "새로고침"}
          </Button>
          <Button variant="primary" size="sm" onClick={store.createHandoff} disabled={!canRequest || store.pending}>
            <GitPullRequestArrow size={15} aria-hidden="true" /> 핸드오프 생성
          </Button>
        </div>
      </div>

      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <CardBoundary title="노트북에 기록" card="operations" onError={recordCardError} hideTitle>
        <div className="flex items-center gap-2">
          <BookOpen size={16} aria-hidden="true" /> <span className="text-sm font-semibold">노트북에 기록</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const on = store.appendKind === k.key;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => store.setAppendKind(k.key)}
                className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors", on ? "border-primary bg-primary/12 text-primary" : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                <Icon size={13} aria-hidden="true" /> {k.label}
              </button>
            );
          })}
        </div>
        <Textarea rows={3} value={store.appendText} placeholder="이번에 학습/결정/검증한 내용을 적습니다." onChange={(event) => store.setAppendText(event.target.value)} />
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={store.append} disabled={!canRequest || store.pending || !store.appendText.trim()}>
            <Send size={14} aria-hidden="true" /> 기록
          </Button>
        </div>
      </CardBoundary>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {DOCS.map((d) => {
          const document = store.snapshot[d.field];
          const Icon = d.icon;
          return (
            <CardBoundary key={d.field} title={d.label} card="logs" onError={recordCardError} hideTitle>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", d.tint)}>
                    <Icon size={15} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold">{d.label}</span>
                </div>
                <Badge tone={document.exists ? "success" : "outline"}>{document.exists ? "있음" : "없음"}</Badge>
              </div>
              {document.path ? <div className="truncate font-mono text-[11px] text-muted-foreground">{document.path}</div> : null}
              {document.content ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">{document.content}</pre>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">{store.loaded ? "기록 없음" : "새로고침하면 표시됩니다."}</p>
              )}
            </CardBoundary>
          );
        })}
      </section>
    </div>
  );
}
