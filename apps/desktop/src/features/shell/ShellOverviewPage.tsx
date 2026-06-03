import { CardBoundary } from "../../CardBoundary";
import { UiLogPanel } from "../ui-log/UiLogPanel";
import { useUiLogStore } from "../ui-log/ui-log-store";
import {
  MiddlewareContractCard,
  RuntimeContractCard,
  ShellBoundarySummary
} from "./ShellStatusCards";

export function ShellOverviewPage() {
  const recordCardError = useUiLogStore((state) => state.recordCardError);

  return (
    <>
      <ShellBoundarySummary />
      <section className="grid">
        <CardBoundary title=".NET 미들웨어 연결 계약" card="middleware" onError={recordCardError}>
          <MiddlewareContractCard />
        </CardBoundary>
        <CardBoundary title="UI 로그 경계" card="logs" onError={recordCardError}>
          <UiLogPanel />
        </CardBoundary>
        <CardBoundary title="런타임 부트 계약" card="runtime" onError={recordCardError}>
          <RuntimeContractCard />
        </CardBoundary>
      </section>
    </>
  );
}
