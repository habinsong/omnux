import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0;

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, needle, label) {
  assertionCount += 1;
  assert.ok(source.includes(needle), `${label}: expected to include ${needle}`);
}

function assertNotIncludes(source, needle, label) {
  assertionCount += 1;
  assert.ok(!source.includes(needle), `${label}: expected not to include ${needle}`);
}

function collectFiles(directory, predicate) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

const develop = read("develop.md");
assertIncludes(
  develop,
  "Tauri Rust 백엔드는 앱 셸(Window 관리)만 담당한다.",
  "develop.md desktop shell role"
);
assertIncludes(
  develop,
  "비즈니스 로직은 .NET 미들웨어가 전담한다.",
  "develop.md middleware ownership"
);
assertIncludes(
  develop,
  "Rust 쪽 금지",
  "develop.md rust prohibition heading"
);
assertIncludes(
  develop,
  "LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책",
  "develop.md forbidden business domains"
);
assertIncludes(
  develop,
  "node scripts/check-desktop-shell-boundary-contract.mjs",
  "develop.md desktop shell contract command"
);

const runTests = read("scripts/run-omnux-tests.mjs");
assertIncludes(
  runTests,
  "check-desktop-shell-boundary-contract.mjs",
  "npm test desktop shell contract"
);

const desktopDir = path.join(repoRoot, "apps", "desktop");
const srcTauriDir = path.join(desktopDir, "src-tauri");
const srcDir = path.join(desktopDir, "src");

if (!existsSync(desktopDir) || !statSync(desktopDir).isDirectory()) {
  console.log(`[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, apps/desktop scaffold 전)`);
  process.exit(0);
}

if (!existsSync(srcTauriDir) || !statSync(srcTauriDir).isDirectory()) {
  console.log(`[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, src-tauri scaffold 전)`);
  process.exit(0);
}

const inspectedFiles = collectFiles(
  srcTauriDir,
  (filePath) => filePath.endsWith(".rs") || filePath.endsWith("Cargo.toml")
);

const forbiddenRustPatterns = [
  { pattern: /\breqwest\b/i, reason: "Rust 셸에서 직접 HTTP 클라이언트로 provider/API 호출 금지" },
  { pattern: /\basync-openai\b/i, reason: "Rust 셸에서 LLM SDK 의존 금지" },
  { pattern: /\b(openai|anthropic|gemini|groq|cerebras|ollama)\b/i, reason: "Rust 셸에서 LLM provider 결합 금지" },
  { pattern: /\b(rusqlite|sqlx|diesel)\b/i, reason: "Rust 셸에서 비즈니스 상태 DB 직접 소유 금지" },
  { pattern: /\b(std::process::Command|tokio::process|Command::new)\b/, reason: "Rust 셸에서 임의 프로세스 실행 금지" },
  { pattern: /\b(std::net|tokio::net)\b/, reason: "Rust 셸에서 별도 네트워크 서버/소켓 계층 생성 금지" },
  { pattern: /\b(llm|coding|routine|refactor|logic_graph|routing[_-]policy)\b/i, reason: "Rust 셸에 도메인 비즈니스 로직 배치 금지" },
  { pattern: /\.omnux\b/i, reason: "Rust 셸에서 ~/.omnux 영속 상태 직접 접근 금지" },
  { pattern: /\bworkspaceRoot\b|\bworkspace_root\b|workspace\//i, reason: "Rust 셸에서 workspace 산출물 직접 변경 금지" }
];

const violations = [];
for (const filePath of inspectedFiles) {
  const source = readFileSync(filePath, "utf8");
  for (const { pattern, reason } of forbiddenRustPatterns) {
    assertionCount += 1;
    if (pattern.test(source)) {
      violations.push(`${toRelative(filePath)}: ${reason} (${pattern})`);
    }
  }
}

assert.deepEqual(violations, [], `Tauri Rust 셸 경계 위반:\n${violations.join("\n")}`);

if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
  const requiredFrontendFiles = [
    "src/App.tsx",
    "src/App.css",
    "src/main.tsx",
    "src/CardBoundary.tsx",
    "src/ShellFault.tsx",
    "src/shell-store.ts",
    "src/ShellErrorBoundary.tsx",
    "src/middleware-contract.ts",
    "src/ReadOnlyWsPanel.tsx",
    "src/use-middleware-bootstrap-events.ts",
    "src/use-middleware-runtime-probe.ts",
    "src/use-middleware-session.ts",
    "src/features/auth/auth-store.ts",
    "src/features/ask/AskPage.tsx",
    "src/features/ask/ask-store.ts",
    "src/features/automate/AutomatePage.tsx",
    "src/features/automate/automate-store.ts",
    "src/features/projects/ProjectsPage.tsx",
    "src/features/projects/projects-store.ts",
    "src/features/explore/ExplorePage.tsx",
    "src/features/explore/explore-store.ts",
    "src/features/ops/OperationsPage.tsx",
    "src/features/ops/ops-store.ts",
    "src/features/shell/DesktopNavigation.tsx",
    "src/features/shell/PageBoundary.tsx",
    "src/features/shell/ShellOverviewPage.tsx",
    "src/features/settings/SettingsPage.tsx",
    "src/features/settings/settings-store.ts",
    "src/features/shell/ShellStatusCards.tsx",
    "src/features/ui-log/UiLogPanel.tsx",
    "src/features/ui-log/ui-log-store.ts"
  ];

  for (const relativePath of requiredFrontendFiles) {
    const absolutePath = path.join(desktopDir, relativePath);
    assertionCount += 1;
    assert.ok(existsSync(absolutePath), `desktop frontend file missing: ${relativePath}`);
  }

  const appSource = read("apps/desktop/src/App.tsx");
  assertIncludes(
    appSource,
    "AskPage",
    "desktop App.tsx ask page wiring"
  );
  assertIncludes(
    appSource,
    "ExplorePage",
    "desktop App.tsx explore page wiring"
  );
  assertIncludes(
    appSource,
    "ProjectsPage",
    "desktop App.tsx projects page wiring"
  );
  assertIncludes(
    appSource,
    "AutomatePage",
    "desktop App.tsx automate page wiring"
  );
  assertIncludes(
    appSource,
    "SettingsPage",
    "desktop App.tsx settings page wiring"
  );
  assertIncludes(
    appSource,
    "DesktopNavigation",
    "desktop App.tsx page registry navigation"
  );
  assertIncludes(
    appSource,
    "PageBoundary",
    "desktop App.tsx page error boundary"
  );
  assertIncludes(
    appSource,
    "DesktopDialogHost",
    "desktop App.tsx renders in-app dialog host"
  );
  assertIncludes(
    appSource,
    "DesktopPageDefinition",
    "desktop App.tsx typed page registry"
  );
  assertIncludes(
    appSource,
    "ShellOverviewPage",
    "desktop App.tsx shell page wiring"
  );
  assertIncludes(
    appSource,
    "OperationsPage",
    "desktop App.tsx operations page wiring"
  );
  assertIncludes(
    appSource,
    "useMiddlewareBootstrapEvents",
    "desktop App.tsx bootstrap lifecycle listener"
  );
  assertIncludes(
    appSource,
    "useMiddlewareSessionBridge",
    "desktop App.tsx websocket session bridge hook"
  );
  [
    "useDesktopShellStore",
    "new WebSocket",
    "serializeUiLogs",
    "recordCardError",
    "markDoctorResult",
    "markPlanListResult",
    "markTaskGraphListResult",
    "useAskStore",
    "useExploreStore",
    "useSettingsStore",
    "useAutomateStore"
  ].forEach((needle) =>
    assertNotIncludes(
      appSource,
      needle,
      `desktop App.tsx must stay routing/layout only (${needle})`
    )
  );

  const shellOverviewSource = read("apps/desktop/src/features/shell/ShellOverviewPage.tsx");
  assertIncludes(
    shellOverviewSource,
    "CardBoundary",
    "desktop shell overview owns card boundaries"
  );
  assertIncludes(
    shellOverviewSource,
    "UiLogPanel",
    "desktop shell overview owns ui log panel"
  );

  const shellStatusCardsSource = read("apps/desktop/src/features/shell/ShellStatusCards.tsx");
  assertIncludes(
    shellStatusCardsSource,
    "useDesktopShellStore",
    "desktop shell status cards read shell store"
  );
  assertIncludes(
    shellStatusCardsSource,
    "bootstrapPhase",
    "desktop shell status cards display bootstrap phase"
  );
  assertIncludes(
    shellStatusCardsSource,
    "healthStatus",
    "desktop shell status cards display healthz status"
  );
  assertIncludes(
    shellStatusCardsSource,
    "readyStatus",
    "desktop shell status cards display readyz status"
  );
  assertIncludes(
    shellStatusCardsSource,
    "reconnectPolicy",
    "desktop shell status cards display reconnect policy"
  );

  const uiLogPanelSource = read("apps/desktop/src/features/ui-log/UiLogPanel.tsx");
  assertIncludes(
    uiLogPanelSource,
    "serializeUiLogs",
    "desktop ui log panel export serialization"
  );
  assertIncludes(
    uiLogPanelSource,
    "로그 내보내기",
    "desktop ui log panel export button"
  );
  assertIncludes(
    uiLogPanelSource,
    "clearLogs",
    "desktop ui log panel clear action"
  );
  assertIncludes(
    uiLogPanelSource,
    "componentStack",
    "desktop ui log panel component stack display"
  );

  const pageBoundarySource = read("apps/desktop/src/features/shell/PageBoundary.tsx");
  assertIncludes(
    pageBoundarySource,
    "class PageBoundary",
    "desktop page error boundary class"
  );
  assertIncludes(
    pageBoundarySource,
    "recordLog(\"error\"",
    "desktop page boundary logs render errors"
  );
  assertIncludes(
    pageBoundarySource,
    "화면 다시 렌더",
    "desktop page boundary local retry"
  );

  const cardBoundarySource = read("apps/desktop/src/CardBoundary.tsx");
  assertIncludes(
    cardBoundarySource,
    "class CardBoundary",
    "desktop CardBoundary.tsx card error boundary class"
  );
  assertIncludes(
    cardBoundarySource,
    "this.props.onError",
    "desktop CardBoundary.tsx card error callback contract"
  );
  assertIncludes(
    cardBoundarySource,
    "componentStack",
    "desktop CardBoundary.tsx component stack capture"
  );
  assertIncludes(
    cardBoundarySource,
    "onRetry={this.retry}",
    "desktop CardBoundary.tsx card retry fallback"
  );

  const shellFaultSource = read("apps/desktop/src/ShellFault.tsx");
  assertIncludes(
    shellFaultSource,
    "role=\"alert\"",
    "desktop ShellFault.tsx alert role"
  );
  assertIncludes(
    shellFaultSource,
    "error-stack",
    "desktop ShellFault.tsx stack display"
  );
  assertIncludes(
    shellFaultSource,
    "retryLabel",
    "desktop ShellFault.tsx retry label"
  );
  assertIncludes(
    shellFaultSource,
    "다시 렌더",
    "desktop ShellFault.tsx default retry label"
  );

  const readOnlyPanelSource = read("apps/desktop/src/ReadOnlyWsPanel.tsx");
  assertIncludes(
    readOnlyPanelSource,
    "useDesktopShellStore",
    "desktop ReadOnlyWsPanel.tsx shell bridge status ownership"
  );
  assertIncludes(
    readOnlyPanelSource,
    "useDesktopAuthStore",
    "desktop ReadOnlyWsPanel.tsx auth page store ownership"
  );
  assertIncludes(
    readOnlyPanelSource,
    "useOpsPageStore",
    "desktop ReadOnlyWsPanel.tsx ops page store ownership"
  );
  assertIncludes(
    readOnlyPanelSource,
    "requestDesktopOtp",
    "desktop ReadOnlyWsPanel.tsx otp request action"
  );
  assertIncludes(
    readOnlyPanelSource,
    "submitDesktopOtp",
    "desktop ReadOnlyWsPanel.tsx otp submit action"
  );
  assertIncludes(
    readOnlyPanelSource,
    "OTP 요청",
    "desktop ReadOnlyWsPanel.tsx otp request control"
  );
  assertIncludes(
    readOnlyPanelSource,
    "최근 Doctor 보고서",
    "desktop ReadOnlyWsPanel.tsx read-only doctor query control"
  );
  assertIncludes(
    readOnlyPanelSource,
    "운영 목록 조회",
    "desktop ReadOnlyWsPanel.tsx read-only operations query control"
  );
  assertIncludes(
    readOnlyPanelSource,
    "requestDesktopOpsSnapshot",
    "desktop ReadOnlyWsPanel.tsx read-only operations query action"
  );

  const shellStoreSource = read("apps/desktop/src/shell-store.ts");
  assertIncludes(
    shellStoreSource,
    "middleware",
    "desktop shell store middleware state"
  );
  assertIncludes(
    shellStoreSource,
    "sidecarBootstrap",
    "desktop shell store sidecar bootstrap reservation"
  );
  assertIncludes(
    shellStoreSource,
    "dev-dotnet-run-bootstrap",
    "desktop shell store dev bootstrap label"
  );
  assertIncludes(
    shellStoreSource,
    "bundle-external-bin",
    "desktop shell store bundle external bin label"
  );
  assertIncludes(
    shellStoreSource,
    "WebSocket",
    "desktop shell store websocket endpoint"
  );
  assertIncludes(
    shellStoreSource,
    "markReconnectPlanned",
    "desktop shell store reconnect planning action"
  );
  assertIncludes(
    shellStoreSource,
    "scheduleNextReconnect",
    "desktop shell store reconnect scheduler action"
  );
  assertIncludes(
    shellStoreSource,
    "markHealthProbe",
    "desktop shell store health probe action"
  );
  assertIncludes(
    shellStoreSource,
    "markHttpProbe",
    "desktop shell store http probe action"
  );
  assertIncludes(
    shellStoreSource,
    "healthStatus",
    "desktop shell store healthz status"
  );
  assertIncludes(
    shellStoreSource,
    "readyStatus",
    "desktop shell store readyz status"
  );
  assertIncludes(
    shellStoreSource,
    "syncRuntimeContract(state.runtime, \"connected\", 0",
    "desktop shell store reconnect reset on success"
  );
  assertIncludes(
    shellStoreSource,
    "lastProbeAt",
    "desktop shell store last probe tracking"
  );
  assertIncludes(
    shellStoreSource,
    "markBootstrapEvent",
    "desktop shell store bootstrap lifecycle action"
  );
  assertIncludes(
    shellStoreSource,
    "useUiLogStore",
    "desktop shell store delegates logs to ui log store"
  );
  [
    "DesktopAuthContract = {",
    "DesktopDoctorSnapshot = {",
    "DesktopOpsSnapshot = {",
    "markAuthRequired:",
    "markDoctorResult:",
    "markPlanListResult:",
    "markTaskGraphListResult:",
    "logs:"
  ].forEach((needle) =>
    assertNotIncludes(
      shellStoreSource,
      needle,
      `desktop shell store must not own page/global log state (${needle})`
    )
  );

  const uiLogStoreSource = read("apps/desktop/src/features/ui-log/ui-log-store.ts");
  assertIncludes(
    uiLogStoreSource,
    "UI_LOG_SCHEMA_VERSION",
    "desktop ui log store schema"
  );
  assertIncludes(
    uiLogStoreSource,
    "serializeUiLogs",
    "desktop ui log store serializer"
  );
  assertIncludes(
    uiLogStoreSource,
    "recordShellError",
    "desktop ui log store shell error logging"
  );
  assertIncludes(
    uiLogStoreSource,
    "clearLogs",
    "desktop ui log store clear action"
  );
  assertIncludes(
    uiLogStoreSource,
    "componentStack",
    "desktop ui log store component stack persistence"
  );

  const authStoreSource = read("apps/desktop/src/features/auth/auth-store.ts");
  assertIncludes(
    authStoreSource,
    "DesktopAuthContract",
    "desktop auth store auth state contract"
  );
  assertIncludes(
    authStoreSource,
    "markAuthRequired",
    "desktop auth store auth required action"
  );

  const askPageSource = read("apps/desktop/src/features/ask/AskPage.tsx");
  assertIncludes(
    askPageSource,
    "CardBoundary",
    "desktop ask page card boundaries"
  );
  assertIncludes(
    askPageSource,
    "useAskStore",
    "desktop ask page ask store ownership"
  );
  assertIncludes(
    askPageSource,
    "canRequest",
    "desktop ask page gates domain requests behind auth"
  );
  assertIncludes(
    askPageSource,
    "row-actions",
    "desktop ask page conversation row actions"
  );
  assertIncludes(
    askPageSource,
    "renameConversation",
    "desktop ask page conversation rename action"
  );
  assertIncludes(
    askPageSource,
    "saveConversationToMemory",
    "desktop ask page memory save action"
  );
  assertIncludes(
    askPageSource,
    "chatMode",
    "desktop ask page chat mode selector"
  );
  assertIncludes(
    askPageSource,
    "multiResult",
    "desktop ask page multi provider result display"
  );
  assertIncludes(
    askPageSource,
    "MarkdownMessage",
    "desktop ask page uses React markdown component"
  );
  assertIncludes(
    askPageSource,
    "deleteConversation",
    "desktop ask page conversation delete action"
  );

  const askStoreSource = read("apps/desktop/src/features/ask/ask-store.ts");
  assertIncludes(
    askStoreSource,
    "requestDesktopAsk",
    "desktop ask store request gateway"
  );
  assertIncludes(
    askStoreSource,
    "conversation_search_result",
    "desktop ask store search result handling"
  );
  assertIncludes(
    askStoreSource,
    "memory_note_created",
    "desktop ask store memory note handling"
  );
  assertIncludes(
    askStoreSource,
    "llm_chat_multi_result",
    "desktop ask store multi chat result handling"
  );
  assertIncludes(
    askStoreSource,
    "requestDesktopAsk.chat",
    "desktop ask store selected mode request gateway"
  );

  const projectsPageSource = read("apps/desktop/src/features/projects/ProjectsPage.tsx");
  assertIncludes(
    projectsPageSource,
    "useProjectsStore",
    "desktop projects page store ownership"
  );
  assertIncludes(
    projectsPageSource,
    "createProject",
    "desktop projects page create action"
  );
  assertIncludes(
    projectsPageSource,
    "updateSelectedProject",
    "desktop projects page update action"
  );
  assertIncludes(
    projectsPageSource,
    "touchProject",
    "desktop projects page touch action"
  );

  const projectsStoreSource = read("apps/desktop/src/features/projects/projects-store.ts");
  assertIncludes(
    projectsStoreSource,
    "requestDesktopProjects",
    "desktop projects store request gateway"
  );
  assertIncludes(
    projectsStoreSource,
    "projects_state",
    "desktop projects store state handling"
  );
  assertIncludes(
    projectsStoreSource,
    "project_result",
    "desktop projects store mutation result handling"
  );

  const explorePageSource = read("apps/desktop/src/features/explore/ExplorePage.tsx");
  assertIncludes(
    explorePageSource,
    "useExploreStore",
    "desktop explore page store ownership"
  );
  assertIncludes(
    explorePageSource,
    "selectedTab",
    "desktop explore page selected tab"
  );
  assertIncludes(
    explorePageSource,
    "canRequest",
    "desktop explore page gates domain requests behind auth"
  );
  assertIncludes(
    explorePageSource,
    "fetchResult",
    "desktop explore page renders url fetch result"
  );
  assertIncludes(
    explorePageSource,
    "history?.messages",
    "desktop explore page renders session history messages"
  );
  assertIncludes(
    explorePageSource,
    "sendSessionMessage",
    "desktop explore page sessions_send action"
  );
  assertIncludes(
    explorePageSource,
    "spawnSession",
    "desktop explore page sessions_spawn action"
  );
  assertIncludes(
    explorePageSource,
    "loadSpawnStatus",
    "desktop explore page sessions_spawn status action"
  );
  assertIncludes(
    explorePageSource,
    "browserResult",
    "desktop explore page renders browser result"
  );
  assertIncludes(
    explorePageSource,
    "canvasResult",
    "desktop explore page renders canvas result"
  );
  assertIncludes(
    explorePageSource,
    "runBrowser(\"open\"",
    "desktop explore page browser open action"
  );
  assertIncludes(
    explorePageSource,
    "runCanvas(\"navigate\"",
    "desktop explore page canvas navigate action"
  );

  const exploreStoreSource = read("apps/desktop/src/features/explore/explore-store.ts");
  assertIncludes(
    exploreStoreSource,
    "requestDesktopExplore",
    "desktop explore store request gateway"
  );
  assertIncludes(
    exploreStoreSource,
    "web_search_result",
    "desktop explore store web search result handling"
  );
  assertIncludes(
    exploreStoreSource,
    "canvas_result",
    "desktop explore store canvas result handling"
  );
  assertIncludes(
    exploreStoreSource,
    "sessions_send_result",
    "desktop explore store sessions_send result handling"
  );
  assertIncludes(
    exploreStoreSource,
    "sessions_spawn_result",
    "desktop explore store sessions_spawn result handling"
  );

  const settingsPageSource = read("apps/desktop/src/features/settings/SettingsPage.tsx");
  assertIncludes(
    settingsPageSource,
    "useSettingsStore",
    "desktop settings page store ownership"
  );
  assertIncludes(
    settingsPageSource,
    "canRequest",
    "desktop settings page gates domain requests behind auth"
  );
  assertIncludes(
    settingsPageSource,
    "backupPreview",
    "desktop settings page backup preview display"
  );
  assertIncludes(
    settingsPageSource,
    "memorySearchResults",
    "desktop settings page memory search result display"
  );
  assertIncludes(
    settingsPageSource,
    "downloadBackupPackage",
    "desktop settings page backup download action"
  );
  assertIncludes(
    settingsPageSource,
    "cerebrasModels",
    "desktop settings page Cerebras models display"
  );

  const settingsStoreSource = read("apps/desktop/src/features/settings/settings-store.ts");
  assertIncludes(
    settingsStoreSource,
    "requestDesktopSettings",
    "desktop settings store request gateway"
  );
  assertIncludes(
    settingsStoreSource,
    "memory_notes",
    "desktop settings store memory notes handling"
  );
  assertIncludes(
    settingsStoreSource,
    "backup_import_preview_result",
    "desktop settings store backup preview handling"
  );
  assertIncludes(
    settingsStoreSource,
    "downloadBackupPackage",
    "desktop settings store local backup download action"
  );
  assertIncludes(
    settingsStoreSource,
    "backup_export_prepare_result",
    "desktop settings store backup export handling"
  );
  assertIncludes(
    settingsStoreSource,
    "cerebras_models",
    "desktop settings store Cerebras models handling"
  );
  assertIncludes(
    settingsStoreSource,
    "requestConfirmDialog",
    "desktop settings store uses in-app confirm dialog"
  );

  const automatePageSource = read("apps/desktop/src/features/automate/AutomatePage.tsx");
  assertIncludes(
    automatePageSource,
    "useAutomateStore",
    "desktop automate page store ownership"
  );
  assertIncludes(
    automatePageSource,
    "canRequest",
    "desktop automate page gates domain requests behind auth"
  );
  assertIncludes(
    automatePageSource,
    "routines",
    "desktop automate page routines listing"
  );
  assertIncludes(
    automatePageSource,
    "selectedRoutine",
    "desktop automate page selected routine detail"
  );
  assertIncludes(
    automatePageSource,
    "selectRoutine",
    "desktop automate page delegates selection to page store"
  );

  const automateStoreSource = read("apps/desktop/src/features/automate/automate-store.ts");
  assertIncludes(
    automateStoreSource,
    "requestDesktopRoutine",
    "desktop automate store request gateway"
  );
  assertIncludes(
    automateStoreSource,
    "routines_state",
    "desktop automate store routines state handling"
  );

  const opsStoreSource = read("apps/desktop/src/features/ops/ops-store.ts");
  assertIncludes(
    opsStoreSource,
    "DesktopDoctorSnapshot",
    "desktop ops store doctor snapshot contract"
  );
  assertIncludes(
    opsStoreSource,
    "DesktopOpsSnapshot",
    "desktop ops store operations snapshot contract"
  );
  assertIncludes(
    opsStoreSource,
    "markDoctorResult",
    "desktop ops store read-only doctor result action"
  );
  assertIncludes(
    opsStoreSource,
    "markPlanListResult",
    "desktop ops store read-only plan list action"
  );
  assertIncludes(
    opsStoreSource,
    "markTaskGraphListResult",
    "desktop ops store read-only task graph list action"
  );
  assertIncludes(
    shellStoreSource,
    "bootstrapPid",
    "desktop shell store bootstrap pid"
  );
  assertIncludes(
    read("apps/desktop/src/middleware-contract.ts"),
    "manual-until-sidecar",
    "desktop middleware reconnect policy mode"
  );
  assertIncludes(
    read("apps/desktop/src/middleware-contract.ts"),
    "DESKTOP_MIDDLEWARE_HEALTH_URL",
    "desktop middleware health url contract"
  );

  const boundarySource = read("apps/desktop/src/ShellErrorBoundary.tsx");
  assertIncludes(
    boundarySource,
    "데스크톱 셸 렌더링을 중단했다",
    "desktop shell error boundary fallback"
  );
  assertIncludes(
    boundarySource,
    "recordShellError",
    "desktop shell error boundary logging"
  );
  assertIncludes(
    boundarySource,
    "다시 시도",
    "desktop shell error boundary retry button"
  );
  assertIncludes(
    boundarySource,
    "componentStack",
    "desktop shell error boundary component stack"
  );
  assertIncludes(
    read("apps/desktop/src/main.tsx"),
    "ShellErrorBoundary",
    "desktop main shell error boundary wiring"
  );

  const rustShellSource = read("apps/desktop/src-tauri/src/lib.rs");
  assertIncludes(
    rustShellSource,
    "tauri_plugin_shell::init",
    "desktop rust shell plugin init"
  );
  assertIncludes(
    rustShellSource,
    "bootstrap_desktop_middleware",
    "desktop rust middleware bootstrap helper"
  );
  assertIncludes(
    rustShellSource,
    "OMNUX_WS_PORT",
    "desktop rust middleware bootstrap port"
  );
  assertIncludes(
    rustShellSource,
    "CommandEvent::Terminated",
    "desktop rust middleware bootstrap lifecycle"
  );
  assertIncludes(
    rustShellSource,
    "dotnet",
    "desktop rust middleware bootstrap command"
  );
  assertIncludes(
    rustShellSource,
    "MIDDLEWARE_BOOTSTRAP_EVENT",
    "desktop rust emits middleware bootstrap event"
  );
  assertIncludes(
    rustShellSource,
    "emit_middleware_bootstrap_event",
    "desktop rust middleware bootstrap event helper"
  );

  const tauriConfig = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
  assertionCount += 1;
  assert.ok(Array.isArray(tauriConfig.bundle?.externalBin), "desktop tauri config must declare externalBin");
  assertionCount += 1;
  assert.ok(
    tauriConfig.bundle.externalBin.includes("binaries/omnux-middleware"),
    "desktop tauri config must include omnux middleware external bin"
  );

  const runtimeProbeSource = read("apps/desktop/src/use-middleware-runtime-probe.ts");
  assertIncludes(
    runtimeProbeSource,
    "new WebSocket(runtime.wsUrl)",
    "desktop runtime probe uses websocket contract"
  );
  assertIncludes(
    runtimeProbeSource,
    "fetch(url",
    "desktop runtime probe checks healthz and readyz"
  );
  assertIncludes(
    runtimeProbeSource,
    "markHttpProbe",
    "desktop runtime probe records http probe status"
  );
  assertIncludes(
    runtimeProbeSource,
    "\"ping\"",
    "desktop runtime probe sends ping only"
  );
  assertIncludes(
    runtimeProbeSource,
    "\"pong\"",
    "desktop runtime probe waits for pong"
  );
  assertIncludes(
    runtimeProbeSource,
    "scheduleNextReconnect",
    "desktop runtime probe schedules reconnect"
  );
  assertIncludes(
    runtimeProbeSource,
    "triggerMiddlewareRuntimeProbe",
    "desktop runtime probe manual retrigger hook"
  );

  const sessionBridgeSource = read("apps/desktop/src/use-middleware-session.ts");
  assertIncludes(
    sessionBridgeSource,
    "auth_required",
    "desktop session bridge handles auth_required"
  );
  assertIncludes(
    sessionBridgeSource,
    "requestDesktopAuth",
    "desktop session bridge auth gateway"
  );
  assertIncludes(
    sessionBridgeSource,
    "requestDesktopOps",
    "desktop session bridge ops gateway"
  );
  assertIncludes(
    sessionBridgeSource,
    "publishDesktopMessage",
    "desktop session bridge publishes messages to page stores"
  );
  assertIncludes(
    sessionBridgeSource,
    "bindDesktopSessionSocket",
    "desktop session bridge socket binding"
  );
  assertIncludes(
    sessionBridgeSource,
    "DESKTOP_MIDDLEWARE_WS_URL",
    "desktop session bridge websocket url"
  );

  const gatewaySource = read("apps/desktop/src/features/middleware/desktop-message-gateway.ts");
  assertIncludes(
    gatewaySource,
    "request_otp",
    "desktop gateway otp request"
  );
  assertIncludes(
    gatewaySource,
    "resume_auth",
    "desktop gateway auth resume request"
  );
  assertIncludes(
    gatewaySource,
    "doctor_get_last",
    "desktop gateway doctor query"
  );
  assertIncludes(
    gatewaySource,
    "plan_list",
    "desktop gateway plan query"
  );
  assertIncludes(
    gatewaySource,
    "task_graph_list",
    "desktop gateway task query"
  );
  assertIncludes(
    gatewaySource,
    "DESKTOP_PUBLIC_REQUESTS",
    "desktop gateway only lets auth requests bypass auth gate"
  );
  assertIncludes(
    gatewaySource,
    "useDesktopAuthStore",
    "desktop gateway checks auth state before domain requests"
  );
  assertIncludes(
    gatewaySource,
    "normalizeToolActionPayload",
    "desktop gateway translates browser/canvas tool payloads"
  );
  assertIncludes(
    gatewaySource,
    "webFetchUrl",
    "desktop gateway owns middleware url field translation"
  );
  assertIncludes(
    gatewaySource,
    "list_conversations",
    "desktop gateway ask query"
  );
  assertIncludes(
    gatewaySource,
    "llm_chat_multi",
    "desktop gateway multi chat request"
  );
  assertIncludes(
    gatewaySource,
    "projects_list",
    "desktop gateway projects list request"
  );
  assertIncludes(
    gatewaySource,
    "project_update",
    "desktop gateway projects update request"
  );
  assertIncludes(
    gatewaySource,
    "sessions_send",
    "desktop gateway sessions send request"
  );
  assertIncludes(
    gatewaySource,
    "sessions_spawn",
    "desktop gateway sessions spawn request"
  );
  assertIncludes(
    gatewaySource,
    "get_cerebras_models",
    "desktop gateway Cerebras models request"
  );
  assertIncludes(
    gatewaySource,
    "backup_import_apply",
    "desktop gateway backup apply"
  );
  assertIncludes(
    gatewaySource,
    "run_routine",
    "desktop gateway routine action"
  );

  const bootstrapEventsSource = read("apps/desktop/src/use-middleware-bootstrap-events.ts");
  assertIncludes(
    bootstrapEventsSource,
    "isTauri",
    "desktop bootstrap event listener browser guard"
  );
  assertIncludes(
    bootstrapEventsSource,
    "omnux://middleware-bootstrap",
    "desktop bootstrap event listener channel"
  );
  assertIncludes(
    bootstrapEventsSource,
    "markBootstrapEvent",
    "desktop bootstrap event listener state bridge"
  );

  const desktopPackage = read("apps/desktop/package.json");
  assertionCount += 1;
  assert.ok(
    !desktopPackage.includes("@tauri-apps/plugin-opener"),
    "desktop package should not keep opener plugin dependency"
  );
  assertIncludes(
    desktopPackage,
    "\"react-markdown\"",
    "desktop package uses react-markdown"
  );
  assertIncludes(
    desktopPackage,
    "\"remark-gfm\"",
    "desktop package uses remark-gfm for tables/lists"
  );
  assertNotIncludes(
    desktopPackage,
    "\"markdown-it\"",
    "desktop package must not use markdown-it string renderer"
  );
  assertNotIncludes(
    desktopPackage,
    "\"dompurify\"",
    "desktop package must not need DOMPurify for markdown string HTML"
  );

  const frontendFiles = collectFiles(
    srcDir,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx")
  );
  const oversizedFrontendFiles = frontendFiles
    .map((filePath) => ({
      filePath,
      lineCount: readFileSync(filePath, "utf8").split(/\r?\n/).length
    }))
    .filter((entry) => entry.lineCount > 500)
    .map((entry) => `${toRelative(entry.filePath)} (${entry.lineCount} lines)`);
  assertionCount += 1;
  assert.deepEqual(
    oversizedFrontendFiles,
    [],
    `desktop frontend God Object 위험 파일은 500줄 이하여야 합니다:\n${oversizedFrontendFiles.join("\n")}`
  );

  const frontendForbiddenPatterns = [
    { pattern: /\bpaletteOpen\b/, reason: "예전 paletteOpen ReferenceError 회귀 차단" },
    { pattern: /\bdoctor_fix_apply\b/, reason: "desktop Phase 5 운영 위험 명령은 별도 apply UX 없이 금지" },
    { pattern: /\bcleanup_apply\b/, reason: "desktop Phase 5 운영 위험 명령은 별도 apply UX 없이 금지" },
    { pattern: /\btask_retry\b/, reason: "desktop Phase 5 운영 위험 명령은 별도 retry UX 없이 금지" },
    { pattern: /\bwindow\.(alert|confirm|prompt)\b/, reason: "desktop UX에서 브라우저 네이티브 alert/confirm/prompt 금지" },
    { pattern: /\bdangerouslySetInnerHTML\b/, reason: "desktop markdown은 React component renderer를 사용해야 함" },
    { pattern: /\brenderMarkdownToSafeHtml\b/, reason: "markdown HTML string 렌더 경로 금지" }
  ];

  const frontendViolations = [];
  for (const filePath of frontendFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const { pattern, reason } of frontendForbiddenPatterns) {
      assertionCount += 1;
      if (pattern.test(source)) {
        frontendViolations.push(`${toRelative(filePath)}: ${reason} (${pattern})`);
      }
    }
  }

  assert.deepEqual(
    frontendViolations,
    [],
    `desktop frontend boundary 위반:\n${frontendViolations.join("\n")}`
  );

  const websocketOwners = new Set([
    "apps/desktop/src/use-middleware-runtime-probe.ts",
    "apps/desktop/src/use-middleware-session.ts"
  ]);
  const websocketLeaks = frontendFiles
    .filter((filePath) => readFileSync(filePath, "utf8").includes("new WebSocket"))
    .map(toRelative)
    .filter((relativePath) => !websocketOwners.has(relativePath));
  assertionCount += 1;
  assert.deepEqual(
    websocketLeaks,
    [],
    `desktop WebSocket 직접 생성은 runtime probe/session bridge만 허용:\n${websocketLeaks.join("\n")}`
  );

  const rawGatewayLeaks = frontendFiles
    .filter((filePath) => toRelative(filePath) !== "apps/desktop/src/features/middleware/desktop-message-gateway.ts")
    .filter((filePath) => readFileSync(filePath, "utf8").includes("sendDesktopRequest("))
    .map(toRelative);
  assertionCount += 1;
  assert.deepEqual(
    rawGatewayLeaks,
    [],
    `desktop raw WS request는 desktop-message-gateway.ts 밖에서 호출 금지:\n${rawGatewayLeaks.join("\n")}`
  );
}

console.log(
  `[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, inspected ${inspectedFiles.length} files)`
);
