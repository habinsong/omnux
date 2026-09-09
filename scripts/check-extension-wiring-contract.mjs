import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 확장 계층(훅·플러그인·규칙)이 실제 실행 지점에 연결돼 있는지 확인한다.
 * 단위 검사는 게이트 자체를 검증하지만, 호출 지점이 사라지면 훅이 조용히 아무것도 하지 않게 된다.
 * 이 검사는 그 연결이 끊어졌을 때 실패한다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0;

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(text.includes(needle), `${label}: ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(!text.includes(needle), `${label}: ${needle}`);
}

// 1) 코딩 액션 실행기: 파일 쓰기 전후와 명령 실행 전에 게이트를 부른다.
const executor = read("apps/omnux-middleware/src/CodingLoopActionExecutor.cs");
assertIncludes(executor, "ICodingHookGate hookGate", "코딩 실행기가 훅 게이트를 받는다");
assertIncludes(executor, "hookGate.BeforeFileAsync", "파일 변경 전 훅 호출");
assertIncludes(executor, "hookGate.AfterFileAsync", "파일 변경 후 훅 호출");
assertIncludes(executor, "hookGate.BeforeCommandAsync", "명령 실행 전 훅 호출");
assertIncludes(executor, "_blocked_by_hook", "차단 결과를 사유와 함께 남긴다");

// 2) 코딩 루프: 계획 확정 직후 게이트를 부르고, 거부되면 복구 생성 경로로 넘어가지 않는다.
const codingLoop = read("apps/omnux-middleware/src/Application/CodingApplicationService.CodingLoop.cs");
assertIncludes(codingLoop, "BeforePlanAsync", "코딩 계획 훅 호출");
assertIncludes(codingLoop, "planHookBlockReason", "계획 차단 사유를 보관한다");
assertIncludes(codingLoop, "BuildHookBlockedCodingOutcome", "차단 결과를 별도 결과로 돌려준다");

// 3) 자동화 실행: 시작 전후로 게이트를 부른다.
const routines = read("apps/omnux-middleware/src/Application/RoutineApplicationService.Routines.cs");
assertIncludes(routines, "ResolveRoutineHookGate()", "자동화가 훅 게이트를 만든다");
assertIncludes(routines, ".BeforeRunAsync(", "자동화 실행 전 훅 호출");
assertIncludes(routines, ".AfterRunAsync(", "자동화 실행 후 훅 호출");

// 4) 채팅 입력: 확장 규칙이 실제로 주입된다.
const chatContext = read("apps/omnux-middleware/src/CommandService.Utils.cs");
assertIncludes(chatContext, "SharedExtensionServices.ResolveChatRules", "채팅 입력이 확장 규칙을 읽는다");
assertIncludes(chatContext, "RuleInjectionPolicy.BuildBody", "두 규칙 출처를 합쳐 주입한다");
assertIncludes(chatContext, "RuleInjectionPolicy.BuildSkippedNote", "예산으로 빠진 규칙을 알린다");
assertIncludes(chatContext, "UserRuleStore.ClampForInjection", "기존 전역 규칙 파일도 계속 쓴다");

// 4-2) 도구 실행: 요청 처리기가 실행 전후로 게이트를 부른다.
const toolDispatcher = read("apps/omnux-middleware/src/WsToolCommandDispatcher.cs");
assertIncludes(toolDispatcher, "ToolRequestTypes", "도구 요청 타입 목록이 있다");
assertIncludes(toolDispatcher, ".BeforeToolAsync(", "도구 실행 전 훅 호출");
assertIncludes(toolDispatcher, ".AfterToolAsync(", "도구 실행 후 훅 호출");
assertIncludes(toolDispatcher, ".OnToolErrorAsync(", "도구 실패 훅 호출");
assertIncludes(toolDispatcher, "SendToolBlockedAsync", "차단을 요청 ID 와 함께 알린다");

// 4-3) 프롬프트 제출: 채팅 요청 처리기가 훅을 거친다.
const aiDispatcher = read("apps/omnux-middleware/src/WsAiCommandDispatcher.cs");
assertIncludes(aiDispatcher, "ResolvePromptHookGate()", "채팅 요청이 프롬프트 훅 게이트를 만든다");
assertIncludes(aiDispatcher, ".BeforePromptAsync(", "프롬프트 제출 훅 호출");
assertIncludes(aiDispatcher, "PromptContextComposer.Apply", "훅 문맥을 사용자 본문 아래에 덧붙인다");

// 4-4) 수명 이벤트: 세션 시작·종료와 응답 완료를 알린다.
const socketLoopForSession = read("apps/omnux-middleware/src/WebSocketGateway.SocketLoop.cs");
assertIncludes(socketLoopForSession, "HookEventCatalog.SessionStart", "세션 시작 훅 알림");
assertIncludes(socketLoopForSession, "HookEventCatalog.SessionEnd", "세션 종료 훅 알림");
assertIncludes(aiDispatcher, "NotifyResponseCompleteAsync", "응답 완료 훅 알림");
assertIncludes(codingLoop, "BeforeVerifyAsync", "최종 검증 전 훅 호출");
assertIncludes(codingLoop, "verify_blocked_by_hook", "검증 차단 사유를 남긴다");

// 5) 승인: ask 판정이 승인 상태를 거친다.
const codingGate = read("apps/omnux-middleware/src/Application/Extensions/CodingHookGate.cs");
assertIncludes(codingGate, "_approvals.Resolve(", "코딩 게이트가 승인 조율자를 거친다");
const routineGate = read("apps/omnux-middleware/src/Application/Extensions/RoutineHookGate.cs");
assertIncludes(routineGate, "_approvals.Resolve(", "자동화 게이트가 승인 조율자를 거친다");
const toolGate = read("apps/omnux-middleware/src/Application/Extensions/ToolHookGate.cs");
assertIncludes(toolGate, "_approvals.Resolve(", "도구 게이트가 승인 조율자를 거친다");
const promptGate = read("apps/omnux-middleware/src/Application/Extensions/PromptHookGate.cs");
assertIncludes(promptGate, "_approvals.Resolve(", "프롬프트 게이트가 승인 조율자를 거친다");

// 5-2) 지원하지 않는 능력을 지원한다고 표시하지 않는다.
const catalog = read("apps/omnux-middleware/src/Application/Extensions/HookEventCatalog.cs");
assertNotIncludes(catalog, "CanRewriteInput: true", "updatedInput 을 적용하는 게이트가 없으므로 재작성 가능으로 표시하지 않는다");
assertNotIncludes(catalog, "Wired: false", "호출 지점이 없는 이벤트를 목록에 남기지 않는다");

// 6) 게이트웨이: 확장 요청 처리기가 소켓 루프에 연결돼 있다.
const socketLoop = read("apps/omnux-middleware/src/WebSocketGateway.SocketLoop.cs");
assertIncludes(socketLoop, "_extensionCommandDispatcher.TryHandleAsync", "확장 dispatcher 가 소켓 루프에 있다");

// 7) 공용 요청 객체를 확장 기능으로 키우지 않는다(god object 방지).
const protocol = read("apps/omnux-middleware/src/WebSocketGateway.Protocol.cs");
assertNotIncludes(protocol, "HookId", "공용 ClientMessage 에 확장 전용 필드를 추가하지 않는다");
assertNotIncludes(protocol, "PendingId", "공용 ClientMessage 에 승인 전용 필드를 추가하지 않는다");
const extensionDispatcher = read("apps/omnux-middleware/src/WsExtensionCommandDispatcher.cs");
assertIncludes(extensionDispatcher, "JsonDocument.Parse(message.RawJson)", "확장 dispatcher 는 원문 JSON 에서 자기 입력만 읽는다");

// 8) 데스크톱: 확장 화면이 탐색에 등록돼 있고 요청 타입이 게이트웨이에 등록된다.
const app = read("apps/desktop/src/App.tsx");
assertIncludes(app, "ExtensionsPage", "확장 화면이 앱에 연결됐다");
const navAreas = read("apps/desktop/src/features/shell/nav-areas.ts");
assertIncludes(navAreas, '"extensions"', "확장 화면이 사이드 탭 영역에 있다");
const extensionGateway = read("apps/desktop/src/features/middleware/extensions-gateway.ts");
assertIncludes(extensionGateway, "registerDesktopRequestTypes(", "확장 요청 타입이 등록된다");
assertIncludes(extensionGateway, "extensions_approval_approve", "승인 요청 타입이 등록된다");

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
