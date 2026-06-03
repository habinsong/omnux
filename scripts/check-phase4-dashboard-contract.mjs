import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const settingsPageState = read("apps/omnux-dashboard/modules/settings-page-state.js");
const settingsJs = read("apps/omnux-dashboard/settings.js");
const wsDoctor = read("apps/omnux-dashboard/modules/ws-doctor.js");
const wsCleanup = read("apps/omnux-dashboard/modules/ws-cleanup.js");
const wsTasks = read("apps/omnux-dashboard/modules/ws-tasks.js");
const wsPlans = read("apps/omnux-dashboard/modules/ws-plans.js");
const dashboardRouter = read("apps/omnux-dashboard/modules/dashboard-server-message-router.mjs");
const wsDoctorDispatcher = read("apps/omnux-middleware/src/WsDoctorCommandDispatcher.cs");
const wsToolDispatcher = read("apps/omnux-middleware/src/WsToolCommandDispatcher.cs");
const wsTaskDispatcher = read("apps/omnux-middleware/src/WsTaskCommandDispatcher.cs");

assert.match(settingsPageState, /function useSettingsOperationsState/, "Settings에는 Phase 4 운영 상태 훅이 있어야 합니다.");
assert.match(settingsPageState, /doctor_fix_preview/, "Settings 운영 상태는 doctor fix preview WS를 보내야 합니다.");
assert.match(settingsPageState, /doctor_fix_apply/, "Settings 운영 상태는 doctor fix apply WS를 보내야 합니다.");
assert.match(settingsPageState, /cleanup_preview/, "Settings 운영 상태는 cleanup preview WS를 보내야 합니다.");
assert.match(settingsPageState, /cleanup_apply/, "Settings 운영 상태는 cleanup apply WS를 보내야 합니다.");
assert.match(settingsPageState, /task_retry/, "Settings 운영 상태는 task retry WS를 보내야 합니다.");
assert.match(settingsPageState, /task_graph_create/, "Settings 운영 상태는 계획 기반 task graph 생성을 보내야 합니다.");

assert.match(settingsJs, /OperationsTab/, "실제 Settings 화면에는 운영 탭 컴포넌트가 있어야 합니다.");
assert.match(settingsJs, /Doctor 자동수정/, "운영 탭은 Doctor 자동수정 UI를 렌더해야 합니다.");
assert.match(settingsJs, /시스템 클린업/, "운영 탭은 cleanup UI를 렌더해야 합니다.");
assert.match(settingsJs, /Plans \/ Task graph/, "운영 탭은 Plan과 Task graph UI를 렌더해야 합니다.");
assert.match(settingsJs, /ops\.retryTask/, "운영 탭은 task 재시도 액션을 연결해야 합니다.");

assert.match(wsDoctor, /requestDoctorFixPreview/, "ws-doctor helper는 doctor fix preview를 제공해야 합니다.");
assert.match(wsDoctor, /requestDoctorFixApply/, "ws-doctor helper는 doctor fix apply를 제공해야 합니다.");
assert.match(wsCleanup, /requestCleanupPreview/, "ws-cleanup helper는 cleanup preview를 제공해야 합니다.");
assert.match(wsCleanup, /requestCleanupApply/, "ws-cleanup helper는 cleanup apply를 제공해야 합니다.");
assert.match(wsTasks, /requestTaskRetry/, "ws-tasks helper는 task retry를 제공해야 합니다.");
assert.match(wsTasks, /requestTaskGraphResume/, "ws-tasks helper는 task resume을 제공해야 합니다.");
assert.match(wsPlans, /requestPlanRun/, "ws-plans helper는 plan run을 유지해야 합니다.");

assert.match(dashboardRouter, /msg\.type === "doctor_fix_result"/, "대시보드 라우터는 doctor fix 결과를 직접 처리해야 합니다.");
assert.match(dashboardRouter, /fixPreview/, "doctor fix preview 결과는 doctorState에 보존되어야 합니다.");
assert.match(dashboardRouter, /pushToolResult\(msg, context\)/, "doctor fix 결과는 도구 결과 타임라인에도 남겨야 합니다.");

assert.match(wsDoctorDispatcher, /doctor_fix_preview/, "미들웨어는 doctor fix preview WS를 처리해야 합니다.");
assert.match(wsDoctorDispatcher, /doctor_fix_apply/, "미들웨어는 doctor fix apply WS를 처리해야 합니다.");
assert.match(wsToolDispatcher, /cleanup_preview/, "미들웨어는 cleanup preview WS를 처리해야 합니다.");
assert.match(wsToolDispatcher, /cleanup_apply/, "미들웨어는 cleanup apply WS를 처리해야 합니다.");
assert.match(wsTaskDispatcher, /task_retry/, "미들웨어는 task retry WS를 처리해야 합니다.");

console.log("[phase4-dashboard-contract] ok");
