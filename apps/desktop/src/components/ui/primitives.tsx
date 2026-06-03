import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";
import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

/* ============================================================================
   OMNUX UI Primitives (shadcn/ui 스타일)
   UIUX_design.md 강제 규약: Tailwind 토큰만 사용, 인라인 스타일 금지,
   절제된 모션(duration-200 ease-out, active:scale), 우아한 포커스 링.
   하드코딩 HEX 없이 시맨틱 토큰(bg-card, text-foreground, border-border 등)만.
   ============================================================================ */

/** 조건부 className 병합 — falsy 제거 후 공백 결합. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/* --- Button -------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium " +
  "transition-all duration-200 ease-out outline-none cursor-pointer select-none " +
  "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:-translate-y-px",
  secondary:
    "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:-translate-y-px",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-accent hover:-translate-y-px",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-110"
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-sm",
  icon: "h-9 w-9 p-0 shrink-0"
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
});

/* --- IconButton ---------------------------------------------------------- */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
}

export function IconButton({ icon: Icon, label, variant = "ghost", className, ...props }: IconButtonProps) {
  return (
    <Button variant={variant} size="icon" aria-label={label} title={label} className={className} {...props}>
      <Icon size={18} aria-hidden="true" />
    </Button>
  );
}

/* --- Card ---------------------------------------------------------------- */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Glass: 반투명 bg-card + backdrop-blur. Light/Dark: 토큰이 불투명이라 blur 무효, shadow/glow 적용.
        "rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] backdrop-blur-xl backdrop-saturate-150",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-3 px-4 pt-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

/* --- Badge --------------------------------------------------------------- */

type BadgeTone = "default" | "primary" | "success" | "warning" | "destructive" | "outline";

const BADGE_TONES: Record<BadgeTone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
  outline: "border border-border text-muted-foreground"
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
        BADGE_TONES[tone],
        className
      )}
      {...props}
    />
  );
}

/* --- StatusDot ----------------------------------------------------------- */

type DotTone = "online" | "busy" | "idle" | "offline";

const DOT_TONES: Record<DotTone, string> = {
  online: "bg-success",
  busy: "bg-warning",
  idle: "bg-muted-foreground",
  offline: "bg-destructive"
};

export function StatusDot({ tone = "idle", pulse = false }: { tone?: DotTone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse ? (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", DOT_TONES[tone])} />
      ) : null}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", DOT_TONES[tone])} />
    </span>
  );
}

/* --- Input / Textarea ---------------------------------------------------- */

const FIELD_BASE =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground transition-colors duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:border-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(FIELD_BASE, "h-9", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_BASE, "resize-none leading-relaxed", className)} {...props} />;
  }
);

/* --- SectionLabel -------------------------------------------------------- */

export function SectionLabel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/* --- EmptyState (§8.4 데드엔드 금지: 아이콘 + CTA) ------------------------ */

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={22} aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? <p className="max-w-xs text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* --- Spinner (§5 멈춘 Loading 텍스트 금지) ------------------------------- */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn("animate-spin text-current", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z" />
    </svg>
  );
}
