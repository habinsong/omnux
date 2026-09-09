import type { ReactNode } from "react";
import { cn } from "../ui/primitives";

/* ============================================================================
   화면 껍데기.

   규칙 하나: **페이지는 화면 높이를 넘지 않는다.**
   목록이 길다고 페이지가 아래로 자라면 사용자는 스크롤로 내용을 찾아야 한다.
   그래서 머리는 고정하고, 본문은 남은 높이를 정확히 차지하며, 스크롤은
   펼친 칸 **안쪽에서만** 생긴다.
   ============================================================================ */

export function Screen({
  title,
  hint,
  actions,
  notice,
  children
}: {
  title: string;
  /** 한 줄 설명. 두 줄 넘게 쓰지 않는다. */
  hint?: string;
  actions?: ReactNode;
  /** 지금 꼭 봐야 하는 한 줄. 없으면 자리를 차지하지 않는다. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
      <header className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          {hint ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {notice ? <div className="min-w-0 shrink-0">{notice}</div> : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

/** 화면 위쪽 한 줄 알림. 색으로만 말하지 않고 글자로 말한다. */
export function ScreenNotice({
  tone = "info",
  children
}: {
  tone?: "info" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "min-w-0 rounded-lg border px-3 py-2 text-xs leading-relaxed",
        tone === "danger" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
        tone === "info" && "border-border bg-muted/40 text-muted-foreground"
      )}
    >
      {children}
    </p>
  );
}
