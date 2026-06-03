import { CardBoundary } from "../../CardBoundary";
import { AuthReadOnlyCard } from "../shell/ShellStatusCards";
import { useUiLogStore } from "../ui-log/ui-log-store";

export function OperationsPage() {
  const recordCardError = useUiLogStore((state) => state.recordCardError);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">운영</h1>
        <p className="text-sm text-muted-foreground">인증, 미들웨어 브릿지, Doctor·Plan·Task 상태를 읽기 전용으로 확인합니다.</p>
      </div>
      <CardBoundary title="인증 / Read-only WS" card="operations" onError={recordCardError}>
        <AuthReadOnlyCard />
      </CardBoundary>
    </div>
  );
}
