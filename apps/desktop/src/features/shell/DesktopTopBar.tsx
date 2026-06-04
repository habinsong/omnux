import { useState } from "react";
import { Bell, Menu, Moon, Search, Sparkles, Sun } from "lucide-react";
import { useDesktopAuthStore } from "../auth/auth-store";
import { useDesktopShellStore } from "../../shell-store";
import type { DesktopPageId } from "./DesktopNavigation";
import { Button, IconButton, StatusDot, cn } from "../../components/ui/primitives";

type DesktopTopBarProps = {
  onOpenNav: () => void;
  onSelectPage: (page: DesktopPageId) => void;
};

type RuntimeTone = "online" | "busy" | "idle" | "offline";

function runtimeStatus(
  bridgeStatus: string,
  authStatus: string,
  runtimePhase: string,
  middlewareStatus: string
): { label: string; tone: RuntimeTone } {
  const transportReady = bridgeStatus === "connected" || runtimePhase === "connected" || middlewareStatus === "connected";
  if (transportReady) {
    return authStatus === "authenticated"
      ? { label: "Live 미들웨어", tone: "online" }
      : { label: bridgeStatus === "connected" ? "인증 필요" : "미들웨어 연결됨", tone: "online" };
  }
  if (bridgeStatus === "connecting" || runtimePhase === "waiting" || middlewareStatus === "waiting") {
    return { label: "연결 중", tone: "busy" };
  }
  return { label: "오프라인", tone: "offline" };
}

type ThemeMode = "glass" | "light" | "dark";
const THEME_ORDER: ThemeMode[] = ["glass", "light", "dark"];
const THEME_LABEL: Record<ThemeMode, string> = { glass: "글래스", light: "라이트", dark: "다크" };

function applyTheme(next: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.classList.toggle("theme-light", next === "light");
  try {
    localStorage.setItem("omnux-theme", next);
  } catch {
    /* localStorage 불가 시 무시 */
  }
}

function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "glass";
  const cl = document.documentElement.classList;
  if (cl.contains("dark")) return "dark";
  if (cl.contains("theme-light")) return "light";
  return "glass";
}

export function DesktopTopBar({ onOpenNav, onSelectPage }: DesktopTopBarProps) {
  const bridgeStatus = useDesktopShellStore((state) => state.bridge.status);
  const runtimePhase = useDesktopShellStore((state) => state.runtime.phase);
  const middlewareStatus = useDesktopShellStore((state) => state.middleware.status);
  const authStatus = useDesktopAuthStore((state) => state.auth.status);
  const [advanced, setAdvanced] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => currentTheme());

  const status = runtimeStatus(bridgeStatus, authStatus, runtimePhase, middlewareStatus);

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    applyTheme(next);
    setTheme(next);
  };
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Sparkles;

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 backdrop-blur-xl backdrop-saturate-150">
      <div className="lg:hidden">
        <IconButton icon={Menu} label="메뉴" onClick={onOpenNav} />
      </div>

      <button
        type="button"
        onClick={() => onSelectPage("home")}
        className="group flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-foreground sm:max-w-md"
      >
        <Search size={16} className="shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">검색하거나 명령 실행</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <div
          className="hidden items-center rounded-md border border-border bg-muted/40 p-0.5 md:inline-flex"
          title="간단히는 핵심만, 고급은 라우트·로그·콘솔까지 노출합니다."
        >
          {(["간단히", "고급"] as const).map((label, index) => {
            const isAdvanced = index === 1;
            const on = isAdvanced === advanced;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setAdvanced(isAdvanced)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                  on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onSelectPage("operations")}
          title="런타임 상태"
        >
          <StatusDot tone={status.tone} pulse={status.tone === "online"} />
          <span className="hidden sm:inline">{status.label}</span>
        </Button>

        <IconButton icon={Bell} label="알림" onClick={() => onSelectPage("activity")} />
        <IconButton icon={ThemeIcon} label={`테마: ${THEME_LABEL[theme]} (클릭하여 전환)`} onClick={cycleTheme} />
      </div>
    </header>
  );
}
