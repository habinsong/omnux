import { useEffect, useMemo, useState } from "react";
import { Cpu, Gauge, Bot, RefreshCcw } from "lucide-react";
import { useGitAutomationBridge, useOpsPageStore } from "../ops/ops-store";
import { Card, Button, cn } from "../../components/ui/primitives";
import { useDesktopShellStore } from "../../shell-store";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDraggableWidget } from "./useDraggableWidget";

/** metrics 문자열을 파싱한다. JSON, 그리고 "key=value key=value"(예: status=ok cpu_usage=6.51 mem_free_mb=24576) 모두 지원. */
function parseMetricsRaw(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // JSON이 아니면 key=value 파싱으로 폴백한다.
  }
  const result: Record<string, unknown> = {};
  for (const token of text.split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq);
    const valueText = token.slice(eq + 1);
    const num = Number(valueText);
    result[key] = valueText !== "" && Number.isFinite(num) ? num : valueText;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function findMetric(root: unknown, terms: string[]): { key: string; value: unknown } | null {
  if (!root || typeof root !== "object") return null;
  const normalizedTerms = terms.map((term) => term.toLowerCase());
  const stack: unknown[] = [root];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (normalizedTerms.some((term) => normalizedKey.includes(term))) return { key, value: child };
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (value < 1024) return `${Math.round(value)}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatMb(mb: number) {
  if (!Number.isFinite(mb)) return "-";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${Math.round(mb)}MB`;
}

function formatMetric(hit: { key: string; value: unknown } | null) {
  if (!hit) return "-";
  const key = hit.key.toLowerCase();
  const { value } = hit;
  if (typeof value === "number") {
    if (/(cpu|usage|percent|load|util)/.test(key) && value <= 100) return `${Math.round(value * 10) / 10}%`;
    if (/(_mb$|mb_|mbyte|megabyte|mem_free|mem_used|mem_total)/.test(key)) return formatMb(value);
    if (/(_kb$|kbyte)/.test(key)) return formatBytes(value * 1024);
    if (/(_gb$|gbyte)/.test(key)) return `${Math.round(value * 10) / 10}GB`;
    if (/(bytes|rss|heap|working_set|wss)/.test(key)) return formatBytes(value);
    return String(Math.round(value * 10) / 10);
  }
  if (typeof value === "string") return value.trim() || "-";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).slice(0, 3).join(", ") || "-";
  return "-";
}

export function ResourceUsageDrawer() {
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const canRequest = bridgeStatus === "connected" && authStatus === "authenticated";

  useGitAutomationBridge();
  const metrics = useOpsPageStore((state) => state.tools.context.metrics);
  const loading = useOpsPageStore((state) => state.tools.context.setupLoading);
  const lastError = useOpsPageStore((state) => state.tools.context.lastError);
  const loadMetrics = useOpsPageStore((state) => state.loadMetrics);
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseMetricsRaw(metrics?.raw || ""), [metrics?.raw]);
  const cpu = formatMetric(findMetric(parsed, ["cpu", "processor"]));
  const memory = formatMetric(findMetric(parsed, ["mem"]));
  const tasks = formatMetric(findMetric(parsed, ["task", "active", "running", "job", "process"]));
  const cards = [
    { label: "CPU", value: cpu, icon: Cpu },
    { label: "메모리", value: memory, icon: Gauge },
    { label: "작업", value: tasks, icon: Bot }
  ];
  const widgetHeight = open ? 210 : 96;

  const { y, isDragging, pointerHandlers } = useDraggableWidget("resource-usage", "calc(50% - 48px)", {
    height: widgetHeight,
    order: 0
  });

  useEffect(() => {
    if (canRequest && !metrics && !loading) loadMetrics();
  }, [canRequest, loadMetrics, loading, metrics]);

  return (
    <div
      className={cn(
        "draggable-widget-container absolute right-0 z-20 flex items-start transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "translate-x-[calc(100%-3rem)]"
      )}
      style={{ top: typeof y === "number" ? `${y}px` : y }}
    >
      <button
        type="button"
        onClick={(e) => {
          if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          setOpen((value) => !value);
        }}
        {...pointerHandlers}
        aria-label={open ? "리소스 사용량 접기" : "리소스 사용량 펼치기"}
        className="flex h-24 w-12 shrink-0 cursor-grab flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 border-border bg-card/60 backdrop-blur-md shadow-sm transition-colors hover:bg-accent active:cursor-grabbing"
      >
        <Cpu size={18} className="text-primary" aria-hidden="true" />
        {cpu !== "-" ? <span className="text-[10px] font-semibold tabular-nums text-foreground">{cpu}</span> : null}
      </button>

      <Card className={cn(
        "flex w-[17rem] flex-col overflow-hidden p-0 rounded-l-none border-l-0 transition-[max-height] duration-300 ease-out",
        open ? "max-h-[210px]" : "max-h-[96px]"
      )}>
        <div className="min-w-0 flex-1 p-3 bg-card/60 backdrop-blur-md h-full">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold">리소스 사용량</span>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={loadMetrics} disabled={!canRequest || loading}>
              <RefreshCcw size={13} aria-hidden="true" /> {loading ? "조회 중" : "갱신"}
            </Button>
          </div>
          <div className="space-y-1.5">
            {cards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon size={14} className="shrink-0" aria-hidden="true" />
                    {item.label}
                  </span>
                  <b className="shrink-0 text-sm font-semibold tabular-nums">{item.value}</b>
                </div>
              );
            })}
          </div>
          {lastError ? (
            <p className="mt-2 line-clamp-2 break-words text-[11px] text-destructive">
              {lastError}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
