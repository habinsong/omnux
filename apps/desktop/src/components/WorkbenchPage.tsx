import { useId, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "./ui/primitives";

export function WorkbenchPage({ title, description, actions, children }: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-tab flex w-full min-w-0 flex-col gap-6 pb-8 [overflow-wrap:anywhere]">
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** 접어도 폼과 실행 상태를 보존하는 본문 섹션. 홈과 탐색 영역에는 적용하지 않는다. */
export function WorkbenchSection({ title, description, icon: Icon, summary, defaultOpen = true, open: controlledOpen, onOpenChange, children }: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  summary?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const open = controlledOpen ?? expanded;
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card/60">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => {
            setExpanded(!open);
            onOpenChange?.(!open);
          }}
          className="flex w-full min-w-0 items-center gap-3 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 motion-reduce:transition-none"
        >
          {Icon ? <Icon size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{title}</span>
            {description ? <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{description}</span> : null}
          </span>
          {summary ? <span className="max-w-[40%] text-right text-xs font-normal text-muted-foreground">{summary}</span> : null}
          <ChevronDown size={16} aria-hidden="true" className={cn("shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} />
        </button>
      </h2>
      <div id={id} hidden={!open} className="min-w-0 border-t border-border px-4 py-4 sm:px-5 sm:py-5">
        {children}
      </div>
    </section>
  );
}

export function WorkbenchField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
