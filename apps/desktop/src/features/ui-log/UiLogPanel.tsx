import { useMemo } from "react";
import { serializeUiLogs, useUiLogStore } from "./ui-log-store";

function formatLogTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

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
    <>
      <div className="log-toolbar">
        <button className="secondary-button" type="button" onClick={exportUiLogs}>
          로그 내보내기
        </button>
        <button className="danger-button" type="button" onClick={clearLogs}>
          로그 비우기
        </button>
      </div>
      <ul className="event-log">
        {logs.map((log) => (
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
      </ul>
    </>
  );
}
