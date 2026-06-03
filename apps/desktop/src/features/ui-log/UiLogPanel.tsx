import { useMemo } from "react";
import { serializeUiLogs, useUiLogStore } from "./ui-log-store";
import { Button, cn } from "../../components/ui/primitives";

function formatLogTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

const LEVEL_TONE: Record<string, string> = {
  error: "bg-destructive/12 text-destructive",
  warn: "bg-warning/12 text-warning",
  info: "bg-primary/12 text-primary"
};

export function UiLogPanel() {
  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);
  const serializedLogs = useMemo(() => serializeUiLogs(logs), [logs]);

  const exportUiLogs = () => {
    const blob = new Blob([serializedLogs], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnux-desktop-ui-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={exportUiLogs}>로그 내보내기</Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={clearLogs}>로그 비우기</Button>
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {logs.map((log) => (
          <li key={log.id} className="flex items-start gap-2 rounded-md border border-border bg-card/60 px-2.5 py-2">
            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", LEVEL_TONE[log.level] || LEVEL_TONE.info)}>{log.level}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs">{log.message}</p>
              <p className="text-[10px] text-muted-foreground">
                <time dateTime={log.createdAt}>{formatLogTime(log.createdAt)}</time>
                {" · "}
                {log.source}
              </p>
              {log.componentStack ? (
                <pre className="error-stack mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-1.5 font-mono text-[10px] text-muted-foreground">{log.componentStack}</pre>
              ) : null}
            </div>
          </li>
        ))}
        {logs.length === 0 ? <li className="py-4 text-center text-xs text-muted-foreground">로그 없음</li> : null}
      </ul>
    </div>
  );
}
