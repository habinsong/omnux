import type { LucideIcon } from "lucide-react";
import { cn } from "../ui/primitives";

/* ============================================================================
   캡슐 가로탭.

   한 화면 안에서 "무엇을 볼지"를 고르는 자리다.
   좁은 화면에서는 가로로 스크롤되며 줄바꿈으로 화면을 밀어내지 않는다.
   탭 자체가 스크롤 영역이므로 페이지 높이는 늘어나지 않는다.
   ============================================================================ */

export type ScreenTab = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** 오른쪽에 붙는 짧은 숫자나 상태. 없으면 붙이지 않는다. */
  badge?: string;
  /** 문제가 있는 탭임을 색이 아니라 표시로도 알린다. */
  alert?: boolean;
};

export function ScreenTabs({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: ScreenTab[];
  value: string;
  onChange: (id: string) => void;
  /** 스크린 리더용 묶음 이름. */
  label: string;
}) {
  if (tabs.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex min-w-0 shrink-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === value);
        if (index < 0) return;
        const delta = event.key === "ArrowRight" ? 1 : -1;
        onChange(tabs[(index + delta + tabs.length) % tabs.length].id);
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tab.label}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
              "transition-colors duration-150 outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60",
              selected
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {Icon ? <Icon size={13} aria-hidden="true" className="shrink-0" /> : null}
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.badge ? (
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-[10px] tabular-nums",
                  tab.alert ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
