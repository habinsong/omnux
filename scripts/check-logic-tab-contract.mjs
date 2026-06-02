import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const wsLogic = read("apps/omnux-middleware/src/WsLogicCommandDispatcher.cs");
const socketLoop = read("apps/omnux-middleware/src/WebSocketGateway.SocketLoop.cs");
const logicGraphs = read("apps/omnux-middleware/src/CommandService.LogicGraphs.cs");
const logicModels = read("apps/omnux-middleware/src/Application/Logic/LogicGraphModels.cs");
const app = read("apps/omnux-dashboard/app.js");
const appShellDomainStores = read("apps/omnux-dashboard/modules/app-shell-domain-stores.js");
const runtimeAdapter = read("apps/omnux-dashboard/runtime-adapter.js");
const shell = read("apps/omnux-dashboard/shell.js");
const router = read("apps/omnux-dashboard/modules/dashboard-server-message-router.mjs");
const logicState = read("apps/omnux-dashboard/modules/logic-state.js");
const logicRenderers = read("apps/omnux-dashboard/modules/dashboard-logic-renderers.js");
const wsLogicClient = read("apps/omnux-dashboard/modules/ws-logic.js");

assert.match(wsLogic, /TryHandleAsync\(\s*WebSocketGateway\.ClientMessage message,\s*bool remoteDashboardClient,/s);
assert.doesNotMatch(wsLogic, /IsRemoteRestrictedLogicMessage/);
assert.match(wsLogic, /"logic_graph_run"/);
assert.match(wsLogic, /"logic_graph_save"/);
assert.match(wsLogic, /SaveLogicGraphAsync\(\s*targetGraphId,\s*message\.LogicGraphJson,/s);
assert.match(socketLoop, /_logicCommandDispatcher\.TryHandleAsync\(\s*message,\s*remoteDashboardClient,/s);

assert.match(logicModels, /string ActiveRunId = ""/);
assert.match(logicGraphs, /ToLogicGraphSummaryWithRuntime/);
assert.match(logicGraphs, /ClearLogicGraphRunningState/);
assert.match(logicGraphs, /NormalizeLogicCodingOutcome/);
assert.match(logicGraphs, /LogicNodeRuntimePolicy\.LooksLikeAiFailure/);

assert.match(appShellDomainStores, /window\.wireOmnuxRuntimeSubscription\(setRuntime, runtimeAdapter\)/);
assert.match(shell, /Home/);
assert.match(shell, /Ask/);
assert.match(shell, /Build/);
assert.match(shell, /Automate/);
assert.match(shell, /Activity/);
assert.match(runtimeAdapter, /import\('\.\/modules\/ws-client\.js'\)/);
assert.match(runtimeAdapter, /import\('\.\/modules\/dashboard-observability\.js'\)/);
assert.match(logicState, /activeRunId: ""/);
assert.match(logicRenderers, /setResponsivePane\("logic",/);
assert.match(logicRenderers, /onCancelRun\(activeRunId\)/);
assert.match(router, /activeItem\?\.activeRunId/);
assert.match(router, /requestLogicGraphRunGet\(actions\.send, activeItem\.activeRunId/);
assert.match(wsLogicClient, /const hasGraphPayload = graphOrOptions/);
assert.match(wsLogicClient, /logicGraph: graphOrOptions/);

console.log("logic tab contract ok");
