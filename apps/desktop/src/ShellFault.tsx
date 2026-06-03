import { AlertTriangle } from "lucide-react";
import { Button } from "./components/ui/primitives";

type ShellFaultProps = {
  label: string;
  stack?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ShellFault({ label, stack, onRetry, retryLabel = "다시 렌더" }: ShellFaultProps) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
        <p className="font-medium text-foreground">{label}</p>
      </div>
      {stack ? (
        <pre className="error-stack max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {stack}
        </pre>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
