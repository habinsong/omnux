import { FormEvent, useEffect, useState } from "react";
import { FileText, ShieldCheck, TerminalSquare } from "lucide-react";
import { settleDesktopDialog, useDesktopDialogStore } from "./dialog-store";
import { Badge, Button, Input, cn } from "../../components/ui/primitives";

export function DesktopDialogHost() {
  const request = useDesktopDialogStore((state) => state.request);
  const [promptValue, setPromptValue] = useState("");
  const [diffOpen, setDiffOpen] = useState(false);

  useEffect(() => {
    setPromptValue(request?.kind === "prompt" ? request.defaultValue : "");
    setDiffOpen(false);
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
    settleDesktopDialog(request.kind === "prompt" ? promptValue.trim() : request.kind === "permission" ? "allow_once" : true);
  };

  const dialogWidth = request.kind === "permission" ? "max-w-2xl" : "max-w-md";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="presentation" onClick={() => settleDesktopDialog(null)}>
      <form
        className={cn("w-full space-y-4 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl shadow-primary/10", dialogWidth)}
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
        {request.kind === "permission" ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ShieldCheck size={15} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate text-sm font-semibold">{request.actionLabel}</span>
                </div>
                <Badge tone={request.tone === "danger" ? "destructive" : "primary"}>승인 필요</Badge>
              </div>
              {request.approvalToken ? (
                <p className="mt-2 truncate rounded-md bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                  token: {request.approvalToken}
                </p>
              ) : null}
            </div>

            {request.files.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <FileText size={13} aria-hidden="true" /> 변경 파일
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {request.files.map((file) => (
                    <p key={file} className="truncate rounded-md bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground">
                      {file}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {request.commands.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <TerminalSquare size={13} aria-hidden="true" /> 실행 명령
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {request.commands.map((command, index) => (
                    <p key={`${command}-${index}`} className="truncate rounded-md bg-background/50 px-2 py-1 font-mono text-[11px] text-foreground">
                      {command}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            {request.diff ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Preview diff</span>
                  <Button variant="outline" size="sm" onClick={() => setDiffOpen((open) => !open)}>
                    {diffOpen ? "닫기" : "보기"}
                  </Button>
                </div>
                {diffOpen ? (
                  <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 font-mono text-[11px]">
                    {request.diff}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => settleDesktopDialog(null)}>{request.cancelLabel}</Button>
          {request.kind === "permission" ? (
            <Button variant="outline" size="sm" onClick={() => settleDesktopDialog("always_allow_here")}>{request.allowAlwaysLabel}</Button>
          ) : null}
          <Button variant={request.tone === "danger" ? "destructive" : "primary"} size="sm" type="submit">{request.confirmLabel}</Button>
        </div>
      </form>
    </div>
  );
}
