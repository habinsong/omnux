import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const protocol = read("apps/omnux-middleware/src/WebSocketGateway.Protocol.cs");
const gateway = read("apps/omnux-middleware/src/WebSocketGateway.cs");
const dispatcher = read("apps/omnux-middleware/src/WsRoutineCommandDispatcher.cs");
const routines = read("apps/omnux-middleware/src/CommandService.Routines.cs");
const routineExecution = read("apps/omnux-middleware/src/CommandService.RoutineExecution.cs");
const routineUtils = read("apps/omnux-dashboard/modules/routine-utils.js");
const appShellRender = read("apps/omnux-dashboard/modules/app-shell-render.js");
const automateState = read("apps/omnux-dashboard/modules/automate-page-state.js");
const automate = read("apps/omnux-dashboard/automate.js");
const ask = read("apps/omnux-dashboard/ask.js");
const build = read("apps/omnux-dashboard/build.js");
const composer = read("apps/omnux-dashboard/modules/dashboard-composer-renderers.js");
const workspace = read("apps/omnux-dashboard/modules/dashboard-workspace-renderers.js");

assert.match(protocol, /public bool\? RunImmediately \{ get; set; \}/, "WS 메시지 계약에 runImmediately가 있어야 합니다.");
assert.match(gateway, /TryGetProperty\("runImmediately"/, "WS 파서가 runImmediately를 읽어야 합니다.");
assert.match(gateway, /RunImmediately = runImmediately/, "WS 파서 결과가 ClientMessage에 반영되어야 합니다.");
assert.match(dispatcher, /message\.RunImmediately \?\? true/, "기존 WS 생성은 runImmediately 미전달 시 즉시 실행을 유지해야 합니다.");
assert.match(routines, /bool runImmediately/, "루틴 생성 서비스 계약이 runImmediately를 받아야 합니다.");
assert.match(routineExecution, /if \(!runImmediately\)/, "루틴 생성 코어가 초기 실행 건너뛰기를 지원해야 합니다.");
assert.match(routineExecution, /초기 실행은 건너뛰었습니다/, "저장만 생성 결과 메시지가 있어야 합니다.");

assert.match(routineUtils, /runImmediately: false/, "대시보드 루틴 생성 기본값은 저장만이어야 합니다.");
assert.match(routineUtils, /runImmediately: form\?\.runImmediately === true/, "대시보드 payload에 runImmediately가 포함되어야 합니다.");
assert.match(appShellRender, /automate: window\.AutomatePage/, "새 Home 중심 앱은 Automate 화면을 라우팅해야 합니다.");
assert.match(automate, /function CreatePanel/, "새 Automate 화면에는 루틴 생성 패널이 있어야 합니다.");
assert.match(automate, /Telegram is connected/, "새 Automate 화면은 텔레그램 루틴 진입점을 보여야 합니다.");
assert.match(automateState, /ctx\.toast\('Automation created'\)/, "새 Automate 화면은 생성 완료 흐름을 제공해야 합니다.");
assert.match(ask, /ctx\.setRoute\('automate', \{ create: true \}\)/, "Ask 답변에서 자동화 생성으로 이어져야 합니다.");
assert.match(build, /ctx\.setRoute\('automate', \{ create: true \}\)/, "Build 결과에서 자동화 저장으로 이어져야 합니다.");
assert.match(composer, /createRoutineFromCurrentInput\("chat:single"\)/, "대화 단일 입력창에서 루틴 전환을 제공해야 합니다.");
assert.match(composer, /createRoutineFromCurrentInput\("coding:single"\)/, "코딩 단일 입력창에서 루틴 전환을 제공해야 합니다.");
assert.match(workspace, /composer-icon-btn routine/, "입력창에 루틴 저장 버튼이 있어야 합니다.");

console.log("[routine-tab-contract] ok");
