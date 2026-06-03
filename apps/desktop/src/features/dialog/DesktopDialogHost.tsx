import { FormEvent, useEffect, useState } from "react";
import { settleDesktopDialog, useDesktopDialogStore } from "./dialog-store";
import { Button, Input } from "../../components/ui/primitives";

export function DesktopDialogHost() {
  const request = useDesktopDialogStore((state) => state.request);
  const [promptValue, setPromptValue] = useState("");

  useEffect(() => {
    setPromptValue(request?.kind === "prompt" ? request.defaultValue : "");
  }, [request?.id, request?.kind]);

  useEffect(() => {
    if (!request) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settleDesktopDialog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [request]);

  if (!request) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    settleDesktopDialog(request.kind === "prompt" ? promptValue.trim() : true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onClick={() => settleDesktopDialog(null)}>
      <form
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl shadow-primary/10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-dialog-title"
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h2 id="desktop-dialog-title" className="text-base font-semibold tracking-tight">{request.title}</h2>
          <p className="text-sm text-muted-foreground">{request.message}</p>
        </div>
        {request.kind === "prompt" ? (
          <Input value={promptValue} placeholder={request.placeholder} autoFocus onChange={(event) => setPromptValue(event.target.value)} />
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => settleDesktopDialog(null)}>{request.cancelLabel}</Button>
          <Button variant={request.tone === "danger" ? "destructive" : "primary"} size="sm" type="submit">{request.confirmLabel}</Button>
        </div>
      </form>
    </div>
  );
}
