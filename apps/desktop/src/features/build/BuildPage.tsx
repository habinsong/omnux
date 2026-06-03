import { Check, Circle, Play, RotateCcw, Sparkles, Terminal, Trash2 } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { MarkdownMessage } from "../ask/MarkdownMessage";
import { type BuildMessage, useBuildPageBridge, useBuildStore } from "./build-store";
import { Badge, Button, Input, Spinner, Textarea, cn } from "../../components/ui/primitives";

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

const BUILD_EXAMPLES = [
  "README와 package.json의 명칭을 현재 프로젝트명에 맞춰 정리",
  "최근 npm test 실패 원인을 찾아 수정",
  "중복된 React 컴포넌트를 작은 단위로 리팩터링"
];

type BuildStepState = "done" | "active" | "idle";

function BuildStatusStep({ state, title, detail }: { state: BuildStepState; title: string; detail: string }) {
  const done = state === "done";
  const active = state === "active";
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-success bg-success/15 text-success"
            : active
              ? "border-primary bg-primary/15 text-primary"
              : "border-border text-muted-foreground"
        )}
      >
        {done ? <Check size={12} aria-hidden="true" /> : <Circle size={11} aria-hidden="true" />}
      </span>
      <div className="min-w-0">
        <b className={cn("block text-xs font-semibold", active && "text-primary")}>{title}</b>
        <span className="block truncate text-[11px] text-muted-foreground">{active ? detail || "진행 중..." : detail}</span>
      </div>
    </div>
  );
}

function BuildConsoleEntry({ message }: { message: BuildMessage }) {
  if (message.role === "user") {
    return (
      <div className="space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">request</span>
        <pre className="whitespace-pre-wrap break-words rounded-md bg-background/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">{message.text}</pre>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">omnux</span>
      <div className="prose-omnux rounded-md bg-background/60 px-2.5 py-1.5">
        <MarkdownMessage text={message.text} />
      </div>
    </div>
  );
}

export function BuildPage() {
  useBuildPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useBuildStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";
  const rollback = store.rollbackStatus;
  const hasResult = store.running || !!store.progress || store.messages.length > 0 || !!store.executionMessage;
  const hasUserRequest = store.messages.some((message) => message.role === "user") || !!store.codingInput.trim();
  const hasAssistantResult = store.messages.some((message) => message.role !== "user");
  const statusSteps: Array<{ state: BuildStepState; title: string; detail: string }> = [
    { state: hasUserRequest ? "done" : "idle", title: "요청 작성", detail: hasUserRequest ? "변경 요청이 준비되었습니다." : "변경 내용을 입력하세요." },
    { state: store.running ? "active" : hasAssistantResult ? "done" : "idle", title: "코딩 실행", detail: store.progress || (hasAssistantResult ? "미들웨어 응답 수신 완료" : "실행 대기") },
    { state: hasAssistantResult ? "done" : "idle", title: "결과 수신", detail: store.conversationId || "conversationId 대기" },
    { state: store.executionMessage ? "done" : "idle", title: "실행 확인", detail: store.executionMessage || "최신 결과 실행 대기" }
  ];

  const rollbackBadge = rollback.pending ? "진행 중" : rollback.ok === true ? "완료" : rollback.ok === false ? "확인 필요" : "대기";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">빌드</h1>
        <p className="text-sm text-muted-foreground">변경 내용을 설명하세요. omnux가 실제 코딩 실행으로 보내고 결과와 롤백 복원을 표시합니다.</p>
      </div>

      {/* 변경 요청 */}
      <CardBoundary title="변경 요청" card="operations" onError={recordCardError} hideTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mode</span>
            <select className={SELECT_CLASS} value={store.codingMode} onChange={(event) => store.setCodingMode(event.target.value as typeof store.codingMode)}>
              <option value="single">single</option>
              <option value="orchestration">orchestration</option>
              <option value="multi">multi</option>
            </select>
          </div>
          <Badge tone="outline" className="font-mono">{store.conversationId || "coding_run_single"}</Badge>
        </div>

        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What should change?</label>
        {store.lastError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p>
        ) : null}
        <Textarea
          rows={4}
          value={store.codingInput}
          placeholder="예: main.ts의 타입 오류를 고쳐줘 (⌘/Ctrl + Enter 실행)"
          onChange={(event) => store.setCodingInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              if (canRequest) store.runCoding();
            }
          }}
        />
        {store.codingInput.trim() ? null : (
          <div className="flex flex-wrap gap-2">
            {BUILD_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => store.setCodingInput(example)}
                className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={store.executeLatest} disabled={!canRequest || !store.conversationId}>
            <Terminal size={15} aria-hidden="true" /> 최신 결과 실행
          </Button>
          <Input
            className="h-8 max-w-[200px] flex-1"
            value={store.standardInput}
            placeholder="stdin 선택 입력"
            onChange={(event) => store.setStandardInput(event.target.value)}
          />
          <div className="ml-auto flex items-center gap-2">
            {hasResult ? (
              <Button variant="outline" size="sm" onClick={store.clearResult} disabled={store.running}>
                <Trash2 size={14} aria-hidden="true" /> 결과 비우기
              </Button>
            ) : null}
            <Button variant="primary" size="sm" onClick={store.runCoding} disabled={!canRequest || store.running || !store.codingInput.trim()}>
              {store.running ? <Spinner size={15} /> : <Sparkles size={15} aria-hidden="true" />}
              {store.running ? "실행 중..." : "코딩 실행"}
            </Button>
          </div>
        </div>
      </CardBoundary>

      {/* 실행 결과 */}
      {hasResult ? (
        <CardBoundary title="실행 결과" card="operations" onError={recordCardError} hideTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Terminal size={16} aria-hidden="true" /> 실행 결과
            </div>
            <Badge tone="primary">{store.codingMode}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress</div>
              <div className="space-y-3">
                {statusSteps.map((step) => (
                  <BuildStatusStep key={step.title} state={step.state} title={step.title} detail={step.detail} />
                ))}
              </div>
            </aside>
            <section className="min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Runner logs</span>
                <Badge tone={store.running ? "warning" : "default"} className="font-mono">{store.running ? "running" : "coding_result"}</Badge>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
                {store.progress ? <div className="font-mono text-[11px] text-primary">{store.progress}</div> : null}
                {store.messages.map((message, index) => (
                  <BuildConsoleEntry key={`${index}-${message.role}`} message={message} />
                ))}
                {store.messages.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">코딩 결과 없음</p> : null}
              </div>
            </section>
          </div>
          {store.executionMessage ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">execute</span>
                <strong>{store.executionMessage}</strong>
              </div>
              {store.executionOutput ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-background/60 p-2.5 font-mono text-[11px]">{store.executionOutput}</pre>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={store.executeLatest} disabled={!canRequest || !store.conversationId}>
              <Play size={14} aria-hidden="true" /> 최신 결과 실행
            </Button>
            {store.conversationId ? <Badge tone="outline" className="font-mono">{store.conversationId}</Badge> : null}
          </div>
        </CardBoundary>
      ) : null}

      {/* 롤백 복원 */}
      <CardBoundary title="롤백 복원" card="navigation" onError={recordCardError}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">코딩/리팩터가 만든 workspace 변경을 rollbackId로 되돌립니다.</p>
          <Badge tone={rollback.ok === false ? "destructive" : rollback.ok === true ? "success" : "default"} className="shrink-0 font-mono">
            {rollbackBadge}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input value={store.rollbackId} placeholder="rollback_... ID 붙여넣기" onChange={(event) => store.setRollbackId(event.target.value)} />
          <Button variant="destructive" size="md" onClick={store.restoreRollback} disabled={!canRequest || rollback.pending || !store.rollbackId.trim()}>
            {rollback.pending ? <Spinner size={15} /> : <RotateCcw size={15} aria-hidden="true" />}
            {rollback.pending ? "복원 중..." : "롤백 복원"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{rollback.message || "이전 리팩터링 스냅샷을 복원하려면 rollback ID를 입력하세요."}</p>
        {rollback.changedPaths.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {rollback.changedPaths.map((path) => (
              <span key={path} className="rounded border border-border bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{path}</span>
            ))}
          </div>
        ) : null}
        {rollback.ok === true ? (
          <div className="flex items-center gap-1.5 text-sm text-success">
            <Check size={14} aria-hidden="true" /> 복원 완료
          </div>
        ) : null}
        {rollback.ok === false ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{rollback.message || "rollback 복원 실패"}</p>
        ) : null}
      </CardBoundary>
    </div>
  );
}
