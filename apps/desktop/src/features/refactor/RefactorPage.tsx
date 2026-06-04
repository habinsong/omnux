import { AlertTriangle, Check, FileCode, Replace, ScanText, Type } from "lucide-react";
import { CardBoundary } from "../../CardBoundary";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useUiLogStore } from "../ui-log/ui-log-store";
import { useRefactorPageBridge, useRefactorStore } from "./refactor-store";
import { Badge, Button, Input, Textarea } from "../../components/ui/primitives";

const FIELD_LABEL = "block space-y-1 text-xs font-semibold text-muted-foreground";

export function RefactorPage() {
  useRefactorPageBridge();
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const store = useRefactorStore();
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Safe Refactor</h1>
        <p className="text-sm text-muted-foreground">파일을 읽고 → AST/LSP로 미리보기 → 승인 시 적용. 미리보기 없이는 적용되지 않습니다.</p>
      </div>
      {store.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{store.lastError}</p> : null}
      {store.lastMessage ? <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{store.lastMessage}</p> : null}

      <CardBoundary title="대상 파일" card="navigation" onError={recordCardError} hideTitle>
        <label className={FIELD_LABEL}>
          파일 경로
          <div className="flex gap-2">
            <Input value={store.path} placeholder="workspace 기준 상대 경로 또는 절대 경로" onChange={(event) => store.setField("path", event.target.value)} />
            <Button variant="outline" size="sm" onClick={store.read} disabled={!canRequest || store.pending || !store.path.trim()}>
              <FileCode size={14} aria-hidden="true" /> 읽기
            </Button>
          </div>
        </label>
        {store.loadedPath ? <div className="font-mono text-[11px] text-muted-foreground">loaded: {store.loadedPath}</div> : null}
        {store.content ? (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">{store.content}</pre>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">경로를 입력하고 읽기를 누르면 본문이 표시됩니다.</p>
        )}
      </CardBoundary>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CardBoundary title="Anchor 교체" card="operations" onError={recordCardError} hideTitle>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <ScanText size={15} className="shrink-0" aria-hidden="true" /> <span className="truncate">Anchor 교체 (refactor_preview)</span>
            </div>
            {store.anchorLines.length > 0 ? <Badge tone="outline">{store.anchorLines.length} lines</Badge> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={FIELD_LABEL}>
              시작 줄
              <Input className="font-mono text-xs" type="number" min="1" value={store.anchorStartLine} placeholder="start" onChange={(event) => store.setField("anchorStartLine", event.target.value)} />
            </label>
            <label className={FIELD_LABEL}>
              끝 줄
              <Input className="font-mono text-xs" type="number" min="1" value={store.anchorEndLine} placeholder="end" onChange={(event) => store.setField("anchorEndLine", event.target.value)} />
            </label>
          </div>
          <label className={FIELD_LABEL}>
            교체 코드
            <Textarea rows={7} className="font-mono text-xs" value={store.anchorReplacement} placeholder="선택한 줄 범위를 대체할 코드" onChange={(event) => store.setField("anchorReplacement", event.target.value)} />
          </label>
          <Button variant="primary" size="sm" onClick={store.anchorPreview} disabled={!canRequest || store.pending || !store.path.trim() || !store.anchorStartLine.trim() || !store.anchorEndLine.trim() || !store.anchorReplacement.trim() || store.anchorLines.length === 0}>
            <ScanText size={14} aria-hidden="true" /> 미리보기
          </Button>
        </CardBoundary>

        <CardBoundary title="AST 치환" card="operations" onError={recordCardError} hideTitle>
          <div className="flex items-center gap-2 text-sm font-semibold"><Replace size={15} aria-hidden="true" /> AST 치환 (ast_replace)</div>
          <label className={FIELD_LABEL}>
            패턴
            <Input className="font-mono text-xs" value={store.pattern} placeholder="ast-grep 패턴" onChange={(event) => store.setField("pattern", event.target.value)} />
          </label>
          <label className={FIELD_LABEL}>
            치환
            <Input className="font-mono text-xs" value={store.replacement} placeholder="치환 코드" onChange={(event) => store.setField("replacement", event.target.value)} />
          </label>
          <Button variant="primary" size="sm" onClick={store.astReplace} disabled={!canRequest || store.pending || !store.path.trim() || !store.pattern.trim()}>
            <ScanText size={14} aria-hidden="true" /> 미리보기
          </Button>
        </CardBoundary>

        <CardBoundary title="LSP 심볼 이름 변경" card="operations" onError={recordCardError} hideTitle>
          <div className="flex items-center gap-2 text-sm font-semibold"><Type size={15} aria-hidden="true" /> 심볼 이름 변경 (lsp_rename)</div>
          <label className={FIELD_LABEL}>
            심볼
            <Input className="font-mono text-xs" value={store.symbol} placeholder="기존 심볼 이름" onChange={(event) => store.setField("symbol", event.target.value)} />
          </label>
          <label className={FIELD_LABEL}>
            새 이름
            <Input className="font-mono text-xs" value={store.newName} placeholder="새 심볼 이름" onChange={(event) => store.setField("newName", event.target.value)} />
          </label>
          <Button variant="primary" size="sm" onClick={store.lspRename} disabled={!canRequest || store.pending || !store.path.trim() || !store.symbol.trim() || !store.newName.trim()}>
            <ScanText size={14} aria-hidden="true" /> 미리보기
          </Button>
        </CardBoundary>
      </section>

      <CardBoundary title="미리보기 & 적용" card="logs" onError={recordCardError} hideTitle>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">미리보기 & 적용</span>
            {store.previewId ? <Badge tone="primary" className="font-mono">{store.previewId}</Badge> : null}
            {store.applied ? <Badge tone="success"><Check size={11} aria-hidden="true" /> 적용됨</Badge> : null}
          </div>
          <Button variant="destructive" size="sm" onClick={store.apply} disabled={!canRequest || store.pending || !store.previewId.trim()}>
            <Check size={14} aria-hidden="true" /> 적용
          </Button>
        </div>
        {store.issues.length > 0 ? (
          <div className="space-y-1 rounded-md border border-warning/30 bg-warning/10 p-2.5">
            {store.issues.map((issue, index) => (
              <div key={index} className="flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden="true" /> {issue}
              </div>
            ))}
          </div>
        ) : null}
        {store.previewDiff ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px]">{store.previewDiff}</pre>
        ) : (
          <p className="py-4 text-center text-xs text-muted-foreground">미리보기를 생성하면 diff와 previewId가 표시됩니다.</p>
        )}
      </CardBoundary>
    </div>
  );
}
