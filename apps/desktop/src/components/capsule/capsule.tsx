import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, RefObject } from "react";
import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUp, Check, Paperclip, X } from "lucide-react";
import { cn } from "../ui/primitives";
import { abbreviateModel } from "../../features/home/composer-intent";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
const MOTION = "motion-reduce:transition-none";

/** 홈 「무엇을 할까요?」와 같은 둥근 아이콘. */
export function RoundIcon({
  icon: Icon,
  label,
  active = false,
  pulse = false,
  disabled = false,
  className,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  pulse?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-[color,background-color,transform] duration-200",
        FOCUS,
        MOTION,
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "opacity-40",
        className
      )}
    >
      <Icon size={16} aria-hidden="true" />
      {pulse ? <span className="absolute inset-0 rounded-full bg-primary/30 motion-safe:animate-ping" aria-hidden="true" /> : null}
    </button>
  );
}

type Choice<T extends string> = { value: T; label: string };

/** 클릭하면 옆에 | 로 선택지가 펼쳐진다. */
export function ExpandChoice<T extends string>({
  label,
  title,
  open,
  options,
  disabled = false,
  onToggle,
  onSelect
}: {
  label: string;
  title: string;
  open: boolean;
  options: readonly Choice<T>[];
  disabled?: boolean;
  onToggle: () => void;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="relative flex min-w-0 items-center">
      <button
        type="button"
        title={title}
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "shrink-0 rounded-sm text-xs font-semibold leading-none transition-colors duration-200",
          FOCUS,
          MOTION,
          open ? "text-primary" : "text-muted-foreground/80 hover:text-foreground",
          disabled && "opacity-40"
        )}
      >
        {label}
      </button>
      <div
        className={cn(
          "flex items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out",
          MOTION,
          open ? "max-w-[280px] opacity-100" : "max-w-0 opacity-0"
        )}
      >
        {options.map((option) => (
          <span key={option.value} className="flex items-center">
            <ExpandDivider />
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                "rounded-sm text-xs font-medium leading-none text-muted-foreground/70 transition-colors duration-200 hover:text-foreground",
                FOCUS,
                MOTION
              )}
            >
              {option.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ExpandDivider() {
  return (
    <span className="px-1.5 text-[10px] text-border" aria-hidden="true">
      |
    </span>
  );
}

/** 제공자 칩 + 모델 격자. 접힌 기본은 자리를 차지하지 않는다. */
export function ModelAccordion({
  open,
  providers,
  selectedProvider,
  models,
  selectedModel,
  onProvider,
  onModel
}: {
  open: boolean;
  providers: readonly { value: string; label: string }[];
  selectedProvider: string;
  models: readonly string[];
  selectedModel: string | null;
  onProvider: (value: string) => void;
  onModel: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        MOTION,
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="mx-1 mb-2 overflow-hidden rounded-md border border-border bg-muted/40">
          <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-border px-2">
            {providers.map((option) => {
              const selected = selectedProvider === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onProvider(option.value)}
                  className={cn(
                    "flex h-7 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-xs font-medium transition-colors duration-200",
                    FOCUS,
                    MOTION,
                    selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {selected ? <Check size={12} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          <div className="h-[110px] overflow-hidden p-2">
            {selectedProvider && selectedProvider !== "auto" ? (
              models.length > 0 ? (
                <div className="grid h-full auto-cols-fr grid-flow-col grid-rows-3 gap-1">
                  {models.map((modelId) => {
                    const selected = selectedModel === modelId;
                    return (
                      <button
                        key={modelId}
                        type="button"
                        title={modelId}
                        onClick={() => onModel(modelId)}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-1 rounded-md px-2 text-left text-[11px] transition-colors duration-200",
                          FOCUS,
                          MOTION,
                          selected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <span className="truncate">{abbreviateModel(modelId)}</span>
                        {selected ? <Check size={12} className="shrink-0" aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="flex h-full items-center justify-center text-xs text-muted-foreground">모델 목록이 없습니다.</p>
              )
            ) : (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">제공자를 고르면 모델이 나옵니다.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CapsuleCard({
  className,
  dragging,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { dragging?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-visible rounded-md border border-border bg-card text-left focus-within:ring-1 focus-within:ring-ring/40",
        dragging && "ring-2 ring-primary/60",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CapsuleRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center gap-2 py-2.5 pl-4 pr-1.5", className)}>{children}</div>;
}

export const CAPSULE_FIELD =
  "block min-h-6 min-w-0 flex-1 resize-none bg-transparent px-0 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-0 [overflow-wrap:anywhere]";

export function ExtrasRow({ hidden, className, children }: { hidden?: boolean; className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mb-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        hidden && "hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolsReveal({ open, widthClass, children }: { open: boolean; widthClass: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center overflow-hidden transition-[width,opacity] duration-300 ease-out",
        MOTION,
        open ? cn(widthClass, "opacity-100") : "pointer-events-none w-0 opacity-0"
      )}
    >
      {children}
    </div>
  );
}

export function SendRound({
  label,
  icon: Icon = ArrowUp,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon?: LucideIcon }) {
  return (
    <button
      type={props.type ?? "submit"}
      aria-label={label}
      title={label}
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-primary/70 transition-colors duration-200",
        "hover:bg-primary hover:text-primary-foreground disabled:opacity-40",
        FOCUS,
        MOTION,
        className
      )}
      {...props}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

export function AttachmentChip({ name, detail, onRemove }: { name: string; detail?: string; onRemove: () => void }) {
  return (
    <span className="flex max-w-[200px] items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
      <Paperclip size={11} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 truncate">{detail ? `${name} ${detail}` : name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${name} 첨부 제거`}
        className={cn("shrink-0 text-muted-foreground hover:text-destructive", FOCUS)}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

/** 탐색·작업 하단의 한 줄 작성칸. */
export function CapsuleBar({
  leading,
  children,
  submitLabel,
  submitDisabled,
  onSubmit,
  className
}: {
  leading?: ReactNode;
  children: ReactNode;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  className?: string;
}) {
  return (
    <CapsuleCard className={cn("w-full min-w-0", className)}>
      <form
        className="flex items-center gap-2 py-2 pl-3 pr-1.5"
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!submitDisabled) onSubmit();
        }}
      >
        {leading}
        {children}
        <SendRound label={submitLabel} disabled={submitDisabled} />
      </form>
    </CapsuleCard>
  );
}

/** 클릭하면 본문이 펼쳐진다. 검사 계약이 summary 를 누르므로 details 를 유지한다. */
export function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="min-w-0 overflow-hidden rounded-md border border-border">
      <summary
        className={cn(
          "flex w-full min-w-0 cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium",
          "outline-none transition-colors duration-200 hover:bg-accent",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60",
          MOTION
        )}
      >
        {title}
      </summary>
      <div className="min-w-0 space-y-2 border-t border-border p-2.5">{children}</div>
    </details>
  );
}

export function useCapsuleDismiss(open: boolean, rootRef: RefObject<HTMLElement | null> | RefObject<HTMLDivElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, close]);
}

export const MODE_CHOICES = [
  { value: "single" as const, label: "싱글" },
  { value: "orchestration" as const, label: "오케스트레이션" },
  { value: "multi" as const, label: "멀티" }
];

export function modeChoiceLabel(mode: "single" | "orchestration" | "multi"): string {
  return MODE_CHOICES.find((entry) => entry.value === mode)?.label ?? "싱글";
}
