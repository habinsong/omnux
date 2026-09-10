import { useId, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "../ui/primitives";

/* ============================================================================
   채움형 아코디언.

   닫힌 칸은 한 줄이다. **한 번에 하나만 열린다.**
   열린 칸은 남은 높이를 정확히 차지하고, 스크롤은 그 안쪽에서만 생긴다.
   그래서 칸을 열어도 페이지가 아래로 자라지 않고 화면 밖으로 밀려나지 않는다.
   ============================================================================ */

export type ScreenPanel = {
  id: string;
  title: string;
  icon?: LucideIcon;
  /** 닫힌 줄 오른쪽에 놓는 짧은 상태. 한눈에 읽을 수 있는 길이만. */
  summary?: string;
  /** 문제 있는 칸. 테두리와 함께 summary 로도 알린다. */
  alert?: boolean;
  render: () => ReactNode;
};

export function ScreenPanels({
  panels,
  openId,
  onOpenChange,
  label
}: {
  panels: ScreenPanel[];
  /** 열린 칸. 빈 문자열이면 모두 닫힌다. */
  openId: string;
  onOpenChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5" aria-label={label}>
      {panels.map((panel) => (
        <PanelRow
          key={panel.id}
          panel={panel}
          open={panel.id === openId}
          onToggle={() => onOpenChange(panel.id === openId ? "" : panel.id)}
        />
      ))}
    </div>
  );
}

function PanelRow({ panel, open, onToggle }: { panel: ScreenPanel; open: boolean; onToggle: () => void }) {
  const reactId = useId();
  const bodyId = `panel-${reactId}`;
  const Icon = panel.icon;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-md border bg-card",
        open ? "min-h-0 flex-1" : "shrink-0",
        panel.alert ? "border-destructive/40" : "border-border"
      )}
    >
      <h2 className="shrink-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className={cn(
            "flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left outline-none",
            "transition-colors duration-150 hover:bg-accent/50",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
          )}
        >
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={cn("shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
          />
          {Icon ? <Icon size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{panel.title}</span>
          {panel.summary ? (
            <span
              className={cn(
                "max-w-[45%] shrink-0 truncate text-xs",
                panel.alert ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {panel.summary}
            </span>
          ) : null}
        </button>
      </h2>

      {open ? (
        <div id={bodyId} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t border-border">
          <div className="min-w-0 p-3">{panel.render()}</div>
        </div>
      ) : null}
    </section>
  );
}
