import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../components/ui/primitives";

export type DesktopPageId =
  | "home"
  | "shell"
  | "ask"
  | "build"
  | "logic"
  | "explore"
  | "projects"
  | "automate"
  | "settings"
  | "operations"
  | "activity"
  | "insights"
  | "notebooks"
  | "skills"
  | "routing"
  | "planning"
  | "refactor"
  | "agents";

export type DesktopPageDefinition = {
  id: DesktopPageId;
  label: string;
  description: string;
  icon?: LucideIcon;
  badge?: number;
  render: () => ReactNode;
};

type DesktopNavigationProps = {
  pages: DesktopPageDefinition[];
  activePage: DesktopPageId;
  onSelectPage: (page: DesktopPageId) => void;
};

export function DesktopNavigation({ pages, activePage, onSelectPage }: DesktopNavigationProps) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Desktop pages">
      {pages.map((page) => {
        const Icon = page.icon;
        const active = page.id === activePage;
        return (
          <button
            key={page.id}
            data-page-id={page.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelectPage(page.id)}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-left",
              "transition-all duration-200 ease-out active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-200",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            {Icon ? (
              <Icon
                size={18}
                className={cn("shrink-0 transition-colors", active ? "text-primary" : "")}
                aria-hidden="true"
              />
            ) : null}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium leading-tight">{page.label}</span>
              <span className="truncate text-[11px] leading-tight text-muted-foreground">{page.description}</span>
            </span>
            {page.badge ? (
              <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                {page.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
