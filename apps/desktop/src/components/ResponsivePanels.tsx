import { Children, useEffect, useState, type ReactNode } from "react";
import { cn } from "./ui/primitives";
import { useMediaQuery } from "../hooks/useMediaQuery";

export type PanelTab = { key: string; label: string; icon?: ReactNode };

/**
 * 다열 패널 레이아웃을 반응형으로 처리한다. children 의 순서가 tabs 와 1:1 로 대응한다.
 * - 넓은 화면(기본 ≥1280px): gridClassName 대로 열을 나란히 배치(기존 동작 유지).
 * - 좁은 화면(태블릿/모바일): 패널을 탭으로 전환해 한 번에 하나를 "전체 높이"로 보여준다.
 *   좁은 화면에서 여러 카드를 고정 높이로 쌓아 내용이 잘리던 문제를 없앤다.
 */
export function ResponsivePanels({
  tabs,
  gridClassName,
  query = "(min-width: 1280px)",
  className,
  children
}: {
  tabs: PanelTab[];
  gridClassName: string;
  query?: string;
  className?: string;
  children: ReactNode;
}) {
  const wide = useMediaQuery(query);
  const items = Children.toArray(children);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= items.length && items.length > 0) {
      setIndex(0);
    }
  }, [index, items.length]);

  if (wide) {
    return (
      <section className={cn("grid min-h-0 min-w-0 flex-1 gap-4", gridClassName, className)}>{children}</section>
    );
  }

  const safeIndex = index < items.length ? index : 0;

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-2", className)}>
      <div
        role="tablist"
        aria-label="패널 전환"
        className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1"
      >
        {tabs.map((tab, i) => {
          const active = i === safeIndex;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setIndex(i)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon ? <span className="shrink-0">{tab.icon}</span> : null}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{items[safeIndex]}</div>
    </section>
  );
}
