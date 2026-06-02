import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const appShellRender = read("apps/omnux-dashboard/modules/app-shell-render.js");
const buildPageState = read("apps/omnux-dashboard/modules/build-page-state.js");
const build = read("apps/omnux-dashboard/build.js");
const composer = read("apps/omnux-dashboard/modules/dashboard-composer-renderers.js");
const threadRenderer = read("apps/omnux-dashboard/modules/dashboard-thread-renderers.js");
const workspaceRenderer = read("apps/omnux-dashboard/modules/dashboard-workspace-renderers.js");
const contracts = read("apps/omnux-middleware/src/Application/Planning/PlanningContracts.cs");
const planJson = read("apps/omnux-middleware/src/Application/Planning/PlanJson.cs");
const planJsonContext = read("apps/omnux-middleware/src/Application/Planning/PlanJsonContext.cs");
const planService = read("apps/omnux-middleware/src/Application/Planning/PlanService.cs");
const llmRouter = read("apps/omnux-middleware/src/LlmRouter.cs");
const planningPromptPolicy = read("apps/omnux-middleware/src/PlanningPromptPolicy.cs");
const telegram = read("apps/omnux-middleware/src/CommandService.Telegram.Conversation.cs");
const telegramCoding = read("apps/omnux-middleware/src/CommandService.Telegram.Coding.cs");

assert.match(appShellRender, /build: window\.BuildPage/, "새 Home 중심 앱은 Build 화면을 라우팅해야 합니다.");
assert.match(buildPageState, /const PLAN = \[/, "새 Build 화면에는 계획 preview 데이터가 있어야 합니다.");
assert.match(buildPageState, /setStage\('planning'\)/, "새 Build 화면은 계획 생성 상태를 가져야 합니다.");
assert.match(build, /t\('Generate plan'\)/, "새 Build 화면은 계획 생성 버튼을 제공해야 합니다.");
assert.match(buildPageState, /ctx\.requestPermission\(\{/, "새 Build 화면은 적용 전 권한 모달을 호출해야 합니다.");
assert.match(build, /t\('Preview'\)/, "새 Build 화면은 변경 preview 액션을 제공해야 합니다.");
assert.match(build, /t\('Apply changes'\)/, "새 Build 화면은 적용 액션을 제공해야 합니다.");

assert.match(composer, /createPlanFromCurrentInput\("chat:single"\)/, "대화 단일 입력창에서 계획 전환을 제공해야 합니다.");
assert.match(composer, /createPlanFromCurrentInput\("coding:single"\)/, "코딩 단일 입력창에서 계획 전환을 제공해야 합니다.");
assert.match(workspaceRenderer, /composer-icon-btn plan/, "입력창에 작업계획 버튼이 있어야 합니다.");
assert.match(threadRenderer, /onCreatePlanFromAssistantMessage/, "assistant 답변에 작업계획 버튼이 있어야 합니다.");
assert.match(workspaceRenderer, /createPlanFromLatestCodingResult/, "코딩 결과 카드에 작업계획 버튼이 있어야 합니다.");

assert.match(contracts, /record PlanDraft/, "구조화 계획 draft 계약이 있어야 합니다.");
assert.match(planJson, /DeserializeDraft/, "계획 draft JSON 역직렬화가 있어야 합니다.");
assert.match(planJsonContext, /JsonSerializable\(typeof\(PlanDraft\)\)/, "source generation context에 PlanDraft가 포함되어야 합니다.");
assert.match(planService, /TryParseStructuredDraft/, "계획 생성은 구조화 draft를 먼저 파싱해야 합니다.");
assert.match(planService, /ParseSteps\(draft/, "기존 줄 파서 fallback은 유지해야 합니다.");
assert.match(planningPromptPolicy, /반드시 JSON 객체 하나만 출력한다/, "계획 LLM 프롬프트는 JSON 출력을 요구해야 합니다.");
assert.match(llmRouter, /PlanningPromptPolicy\.BuildPlanningPrompt/, "LlmRouter는 PlanningPromptPolicy.BuildPlanningPrompt로 위임해야 합니다.");

assert.match(telegram, /TryBuildLastTelegramAssistantPlanCreate/, "텔레그램 최근 답변 계획 shortcut이 있어야 합니다.");
assert.match(telegramCoding, /TryBuildLatestTelegramCodingPlanCreate/, "텔레그램 최근 코딩 결과 계획 shortcut이 있어야 합니다.");

console.log("[plan-tab-contract] ok");
