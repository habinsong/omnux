import { CardBoundary } from "../../CardBoundary";
import { AuthReadOnlyCard } from "../shell/ShellStatusCards";
import { useUiLogStore } from "../ui-log/ui-log-store";

export function OperationsPage() {
  const recordCardError = useUiLogStore((state) => state.recordCardError);

  return (
    <section className="grid single-column">
      <CardBoundary title="인증 / Read-only WS" card="operations" onError={recordCardError}>
        <AuthReadOnlyCard />
      </CardBoundary>
    </section>
  );
}
