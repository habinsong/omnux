import { useMemo, useState } from "react";
import { CardBoundary } from "../../CardBoundary";
import { serializeUiLogs, useUiLogStore, type ShellLogLevel } from "../ui-log/ui-log-store";

type LevelFilter = "all" | ShellLogLevel;

const FILTERS: { id: LevelFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "info", label: "info" },
  { id: "warn", label: "warn" },
  { id: "error", label: "error" }
];

function formatLogTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function ActivityPage() {
  const logs = useUiLogStore((state) => state.logs);
  const clearLogs = useUiLogStore((state) => state.clearLogs);
  const recordCardError = useUiLogStore((state) => state.recordCardError);
  const [filter, setFilter] = useState<LevelFilter>("all");

  const counts = useMemo(() => {
    const summary = { info: 0, warn: 0, error: 0 };
    logs.forEach((log) => {
      if (log.level === "info" || log.level === "warn" || log.level === "error") {
        summary[log.level] += 1;
      }
    });
    return summary;
  }, [logs]);

  const filtered = useMemo(
    () => (filter === "all" ? logs : logs.filter((log) => log.level === filter)),
    [logs, filter]
  );

  const exportLogs = () => {
    const blob = new Blob([serializeUiLogs(logs)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `omnux-desktop-activity-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="grid single-column">
      <CardBoundary title="활동 / 이벤트 타임라인" card="logs" onError={recordCardError}>
        <p className="routine-wizard-intro">
          런타임 부트, 미들웨어 세션, 인증, 오류 이벤트를 한곳에서 봅니다(데스크톱 UI 로그 store).
        </p>
        <div className="items-center" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <span className="badge">info {counts.info}</span>
          <span className="badge">warn {counts.warn}</span>
          <span className="badge">error {counts.error}</span>
        </div>
        <div className="routine-wizard-kinds" style={{ marginBottom: 10 }}>
          {FILTERS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              className={`chip${filter === definition.id ? " active" : ""}`}
              onClick={() => setFilter(definition.id)}
            >
              {definition.label}
            </button>
          ))}
        </div>
        <div className="log-toolbar" style={{ marginBottom: 10 }}>
          <button className="secondary-button" type="button" onClick={exportLogs}>
            내보내기
          </button>
          <button className="danger-button" type="button" onClick={clearLogs}>
            비우기
          </button>
        </div>
        <ul className="event-log" style={{ maxHeight: 460, overflow: "auto" }}>
          {filtered.map((log) => (
            <li key={log.id} className={`log-${log.level}`}>
              <span>{log.level}</span>
              <div>
                <p className="log-message">{log.message}</p>
                <p className="log-meta">
                  <time dateTime={log.createdAt}>{formatLogTime(log.createdAt)}</time>
                  {" · "}
                  {log.source}
                </p>
                {log.componentStack ? <pre className="error-stack">{log.componentStack}</pre> : null}
              </div>
            </li>
          ))}
          {filtered.length === 0 ? <li className="empty">표시할 이벤트가 없습니다.</li> : null}
        </ul>
      </CardBoundary>
    </section>
  );
}
