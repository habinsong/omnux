import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../components/ui/primitives";
import { useDesktopToastStore, type DesktopToastTone } from "./toast-store";

function toastToneClass(tone: DesktopToastTone) {
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "error") return "text-destructive";
  return "text-muted-foreground";
}

function ToastIcon({ tone }: { tone: DesktopToastTone }) {
  if (tone === "success") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (tone === "warning" || tone === "error") return <AlertTriangle size={15} aria-hidden="true" />;
  return <Info size={15} aria-hidden="true" />;
}

export function DesktopToastHost() {
  const toasts = useDesktopToastStore((state) => state.toasts);
  const remove = useDesktopToastStore((state) => state.remove);
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] w-[min(420px,calc(100vw-32px))]" aria-label="최근 알림" aria-live="polite" aria-atomic="false">
      {toasts.slice(0, 1).map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex min-w-0 items-start gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-popover-foreground"
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span className={cn("mt-0.5 shrink-0", toastToneClass(toast.tone))}>
            <ToastIcon tone={toast.tone} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{toast.title}</span>
            <span className="mt-0.5 block line-clamp-2 text-xs text-foreground/80">{toast.message}</span>
          </span>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="알림 닫기"
            onClick={() => remove(toast.id)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
