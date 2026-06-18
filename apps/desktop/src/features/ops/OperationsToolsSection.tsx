import { CardBoundary } from "../../CardBoundary";
import type { CardErrorHandler, OpsStoreActions, OpsToolsState } from "./OperationsPage.shared";
import { OperationsCleanupPanel } from "./OperationsCleanupPanel";
import { OperationsCommandPanel } from "./OperationsCommandPanel";
import { OperationsContextPanel } from "./OperationsContextPanel";
import { OperationsCronPanel } from "./OperationsCronPanel";
import { OperationsGuardDispatchPanel } from "./OperationsGuardDispatchPanel";
import { OperationsNodesPanel } from "./OperationsNodesPanel";
import { OperationsRetryPanel } from "./OperationsRetryPanel";
import { OperationsTelegramPanel } from "./OperationsTelegramPanel";

type OperationsToolsSectionProps = {
  readonly tools: OpsToolsState;
  readonly store: OpsStoreActions;
  readonly canRequest: boolean;
  readonly onError: CardErrorHandler;
};

export function OperationsToolsSection({ tools, store, canRequest, onError }: OperationsToolsSectionProps) {
  return (
    <section>
      <CardBoundary title="도구 상태" card="operations" onError={onError}>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <OperationsCleanupPanel cleanup={tools.cleanup} store={store} canRequest={canRequest} />
          <OperationsGuardDispatchPanel guard={tools.guard} store={store} canRequest={canRequest} />
          <OperationsCommandPanel command={tools.command} store={store} canRequest={canRequest} />
          <OperationsCronPanel cron={tools.cron} store={store} canRequest={canRequest} />
          <OperationsNodesPanel nodes={tools.nodes} store={store} canRequest={canRequest} />
          <OperationsTelegramPanel telegram={tools.telegram} store={store} canRequest={canRequest} />
          <OperationsRetryPanel guard={tools.guard} store={store} canRequest={canRequest} />
          <OperationsContextPanel context={tools.context} store={store} canRequest={canRequest} />
        </div>
      </CardBoundary>
    </section>
  );
}
