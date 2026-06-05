import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Info, Menu, Moon, Search, Sparkles, Sun, X, RefreshCcw } from "lucide-react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import { useUiLogStore, type ShellLogEntry } from "../ui-log/ui-log-store";
import type { DesktopPageId } from "./DesktopNavigation";
import { Badge, Button, IconButton, StatusDot, cn } from "../../components/ui/primitives";
import { DETAIL_LABEL, THEME_LABEL, useDesktopPreferenceStore, type DetailLevel } from "./preference-store";

type DesktopTopBarProps = {
  onOpenNav: () => void;
  onOpenCommandPalette: () => void;
  onSelectPage: (page: DesktopPageId) => void;
};

type RuntimeTone = "online" | "busy" | "idle" | "offline";
const NOTIFICATION_SEEN_KEY = "omnux-desktop-notification-seen-at";

function runtimeStatus(
  bridgeStatus: string,
  authStatus: string,
  runtimePhase: string,
  middlewareStatus: string
): { label: string; tone: RuntimeTone } {
  const transportReady = bridgeStatus === "connected" || runtimePhase === "connected" || middlewareStatus === "connected";
  if (transportReady) {
    return authStatus === "authenticated"
      ? { label: "", tone: "online" }
      : { label: bridgeStatus === "connected" ? "인증 필요" : "미들웨어 연결됨", tone: "online" };
  }
  if (bridgeStatus === "connecting" || runtimePhase === "waiting" || middlewareStatus === "waiting") {
    return { label: "연결 중", tone: "busy" };
  }
  return { label: "오프라인", tone: "offline" };
}

function readNotificationSeenAt() {
  if (typeof window === "undefined") return 0;
  const saved = Number(window.localStorage.getItem(NOTIFICATION_SEEN_KEY) || 0);
  return Number.isFinite(saved) ? saved : 0;
}

function writeNotificationSeenAt(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_SEEN_KEY, String(value));
}

function logTimeMs(log: ShellLogEntry) {
  const parsed = Date.parse(log.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNotificationTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function DesktopTopBar({ onOpenNav, onOpenCommandPalette, onSelectPage }: DesktopTopBarProps) {
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const runtimePhase = useDesktopShellStore((state) => state.runtime.phase);
  const middlewareStatus = useDesktopShellStore((state) => state.middleware.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const logs = useUiLogStore((state) => state.logs);
  const detailLevel = useDesktopPreferenceStore((state) => state.detailLevel);
  const setDetailLevel = useDesktopPreferenceStore((state) => state.setDetailLevel);
  const theme = useDesktopPreferenceStore((state) => state.theme);
  const cycleTheme = useDesktopPreferenceStore((state) => state.cycleTheme);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationSeenAt, setNotificationSeenAt] = useState(readNotificationSeenAt);

  const status = runtimeStatus(bridgeStatus, authStatus, runtimePhase, middlewareStatus);
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Sparkles;
  const alertLogs = useMemo(() => logs.filter((log) => log.level === "warn" || log.level === "error"), [logs]);
  const recentAlerts = useMemo(() => alertLogs.slice(0, 5), [alertLogs]);
  const unreadCount = useMemo(() => alertLogs.filter((log) => logTimeMs(log) > notificationSeenAt).length, [alertLogs, notificationSeenAt]);

  useEffect(() => {
    if (!notificationOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [notificationOpen]);

  const markNotificationsRead = () => {
    const next = Date.now();
    setNotificationSeenAt(next);
    writeNotificationSeenAt(next);
  };

  const toggleNotifications = () => {
    setNotificationOpen((open) => {
      const next = !open;
      if (next) markNotificationsRead();
      return next;
    });
  };

  const openActivity = () => {
    markNotificationsRead();
    setNotificationOpen(false);
    onSelectPage("activity");
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 backdrop-blur-xl backdrop-saturate-150">
      <div className="flex flex-1 items-center justify-start">
        <div className="lg:hidden">
          <IconButton icon={Menu} label="메뉴" onClick={onOpenNav} />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="group flex h-9 w-full max-w-md shrink-0 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground"
      >
        <Search size={16} className="shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">검색하거나 명령 실행</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="flex flex-1 items-center justify-end gap-2">
        <div
          className="hidden items-center rounded-md border border-border bg-muted/40 p-0.5 md:inline-flex"
          title="간단히는 핵심만, 고급은 라우트·로그·콘솔까지 노출합니다."
        >
          {(["simple", "advanced"] as DetailLevel[]).map((level) => {
            const on = level === detailLevel;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setDetailLevel(level)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {DETAIL_LABEL[level]}
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size={status.label ? "sm" : "icon"}
          className={status.label ? "gap-1.5" : "h-9 w-9"}
          onClick={() => onSelectPage("operations")}
          title={status.label || "Live 미들웨어"}
        >
          <StatusDot tone={status.tone} pulse={status.tone === "online"} />
          {status.label ? <span className="hidden sm:inline">{status.label}</span> : null}
        </Button>

        <IconButton icon={RefreshCcw} label="새로고침 (F5)" onClick={() => window.location.reload()} />

        <div className="relative">
          <button
            type="button"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label={`알림${unreadCount > 0 ? ` ${unreadCount}개` : ""}`}
            title="알림"
            onClick={toggleNotifications}
          >
            <Bell size={18} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
            {unreadCount > 0 ? <span className="absolute right-0 top-0 h-2 w-2 animate-ping rounded-full bg-destructive/70" aria-hidden="true" /> : null}
          </button>

          {notificationOpen ? (
            <div className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/10">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Bell size={14} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-sm font-semibold">알림</span>
                  {alertLogs.length > 0 ? <Badge tone="outline">{alertLogs.length}</Badge> : null}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="알림 닫기" onClick={() => setNotificationOpen(false)}>
                  <X size={14} aria-hidden="true" />
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {recentAlerts.length > 0 ? (
                  <div className="space-y-1">
                    {recentAlerts.map((log) => {
                      const Icon = log.level === "error" ? AlertTriangle : Info;
                      return (
                        <button
                          key={log.id}
                          type="button"
                          className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                          onClick={openActivity}
                        >
                          <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", log.level === "error" ? "bg-destructive/12 text-destructive" : "bg-warning/12 text-warning")}>
                            <Icon size={14} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium">{log.message || log.source}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{log.source} · {formatNotificationTime(log.createdAt)}</span>
                          </span>
                          <Badge tone={log.level === "error" ? "destructive" : "warning"} className="shrink-0">{log.level}</Badge>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">표시할 경고나 오류가 없습니다.</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2">
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={markNotificationsRead}>읽음</Button>
                <Button variant="outline" size="sm" className="h-7 px-2" onClick={openActivity}>Activity 열기</Button>
              </div>
            </div>
          ) : null}
        </div>
        <IconButton icon={ThemeIcon} label={`테마: ${THEME_LABEL[theme]} (클릭하여 전환)`} onClick={cycleTheme} />
      </div>
    </header>
  );
}
