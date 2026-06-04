import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../../components/ui/primitives";
import { useDesktopToastStore, type DesktopToastTone } from "./toast-store";

function toastToneClass(tone: DesktopToastTone) {
  if (tone === "success") return "border-success/30 bg-success/10 text-success";
  if (tone === "warning") return "border-warning/30 bg-warning/10 text-warning";
  if (tone === "error") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-primary/25 bg-primary/10 text-primary";
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
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex min-w-0 items-start gap-2 rounded-lg border bg-popover/95 px-3 py-2.5 text-popover-foreground shadow-xl shadow-black/10 backdrop-blur-xl",
            toastToneClass(toast.tone)
          )}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <span className="mt-0.5 shrink-0">
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
