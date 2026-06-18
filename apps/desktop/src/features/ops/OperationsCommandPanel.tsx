import { CornerDownRight, History, Send, Terminal } from "lucide-react";
import { Badge, Button, Spinner, Textarea } from "../../components/ui/primitives";
import type { OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { COMMAND_EXAMPLES, formatDateTimeMs, formatDurationMs, statusLabel } from "./OperationsPage.shared";

type OperationsCommandPanelProps = {
  readonly command: OpsToolsState["command"];
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
};

export function OperationsCommandPanel({ command, store, canRequest }: OperationsCommandPanelProps) {
  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border bg-muted/20 p-3 xl:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">명령</p>
            <p className="truncate text-xs text-muted-foreground">작업 명령을 라우터로 보내고 결과를 확인합니다.</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {command.result ? <Badge tone={command.result.status === "success" ? "success" : "destructive"}>{statusLabel(command.result.status)}</Badge> : null}
          <Button variant="primary" size="sm" onClick={() => void store.runCommandConsole()} disabled={!canRequest || !command.text.trim() || command.running}>
            {command.running ? <Spinner size={14} /> : <Send size={14} aria-hidden="true" />} 실행
          </Button>
        </div>
      </div>
      {command.lastError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{command.lastError}</p> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <Textarea
            rows={5}
            value={command.text}
            onChange={(event) => store.setCommandText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void store.runCommandConsole();
              }
            }}
            placeholder="최근 plan 목록 보여줘"
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {COMMAND_EXAMPLES.map((example) => (
              <Button key={example.value} variant="ghost" size="sm" onClick={() => store.setCommandText(example.value)} disabled={command.running}>
                <CornerDownRight size={13} aria-hidden="true" /> {example.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-md bg-background/60 p-2">
          {command.result ? (
            <div className="space-y-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge tone={command.result.status === "success" ? "success" : "destructive"}>{statusLabel(command.result.status)}</Badge>
                <Badge tone="outline" className="font-mono">{formatDateTimeMs(command.result.ranAtMs)}</Badge>
                {command.result.durationMs !== null ? <Badge tone="outline">{formatDurationMs(command.result.durationMs)}</Badge> : null}
              </div>
              <p className="truncate rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground">{command.result.input}</p>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                {command.result.output}
              </pre>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">명령을 실행하면 백엔드 라우터 결과가 표시됩니다.</p>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <History size={13} className="shrink-0" aria-hidden="true" />
          <span>최근 실행</span>
        </div>
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {command.history.slice(0, 4).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-md bg-background/50 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent/60"
              onClick={() => store.setCommandText(entry.input)}
            >
              <Badge tone={entry.status === "success" ? "success" : "destructive"} className="shrink-0">{statusLabel(entry.status)}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono">{entry.input}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{entry.output}</span>
              </span>
            </button>
          ))}
          {command.history.length === 0 ? <p className="py-3 text-center text-xs text-muted-foreground md:col-span-2">최근 실행 없음</p> : null}
        </div>
      </div>
    </div>
  );
}
