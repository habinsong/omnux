import assert from "node:assert/strict";

// 호출 대상은 상위 테스트가 만든 격리 서버뿐이다. 생성은 예약 저장만, 실행은 키 부재 실패 경계를 검사한다.
export async function verifyRoutineRuntime(session) {
  let sequence = 0;
  async function request(type, fields = {}, responseType = "routine_result") {
    const requestId = `routine-contract-${++sequence}`;
    session.sendJson({ type, requestId, ...fields });
    return session.waitForJson(message => message.type === responseType && message.requestId === requestId, `${type} 요청/응답`, 10000);
  }
  const form = { text: "매일 오전 8시에 새 소식을 정리해 주세요", title: "예약 저장 검사", executionMode: "web", scheduleSourceMode: "manual", scheduleKind: "daily", scheduleTime: "23:59", timezoneId: "Asia/Seoul", runImmediately: false, notifyTelegram: false, maxRetries: 0, retryDelaySeconds: 0 };
  const invalid = await request("create_routine", { ...form, text: "" }, "error");
  assert.equal(invalid.requestType, "create_routine");
  const preview = await request("preview_routine", form, "routine_preview");
  assert.equal(preview.scheduleSourceMode, "manual");
  assert.match(preview.scheduleText, /23:59/);
  const created = await request("create_routine", form);
  assert.equal(created.ok, true, JSON.stringify(created));
  const routineId = created.routine.id;
  assert.equal(created.routine.timeOfDay, "23:59");
  assert.equal(created.routine.running, false);
  assert.ok(created.routine.nextRunAtMs > Date.now());
  assert.equal(created.routine.runs.length, 0, "생성하면서 실행하지 않는다");
  assert.equal(created.routine.notifyTelegram, false);
  const listed = await request("get_routines", {}, "routines_state");
  assert.ok(listed.items.some(item => item.id === routineId));
  const paused = await request("toggle_routine", { routineId, enabled: false });
  assert.equal(paused.ok, true);
  assert.equal(paused.routine.enabled, false);
  const invalidUpdate = await request("update_routine", { ...form, routineId, scheduleTime: "28:00" });
  assert.equal(invalidUpdate.ok, false);
  const updated = await request("update_routine", { ...form, routineId, title: "수정한 예약", scheduleKind: "weekly", weekdays: [1, 3, 5], scheduleTime: "17:40" });
  assert.equal(updated.ok, true, JSON.stringify(updated));
  assert.equal(updated.routine.enabled, false, "편집하면서 꺼 둔 예약을 켜지 않는다");
  assert.deepEqual(updated.routine.weekdays, [1, 3, 5]);
  assert.equal(updated.routine.timeOfDay, "17:40");
  const scheduler = await request("get_routine_scheduler_status", {}, "routine_scheduler_status");
  assert.equal(scheduler.runningRoutines, 0);
  // Gemini 키를 비웠고 URL도 로컬 비활성 경로로 고정한 서버다. 네트워크 추론 이전에 거부해야 한다.
  const run = await request("run_routine", { routineId });
  assert.equal(run.ok, false);
  assert.match(run.message, /Gemini API 키/);
  assert.equal(run.routine.running, false);
  assert.equal(run.routine.runs.length, 1);
  assert.equal(run.routine.runs[0].status, "error");
  const detail = await request("get_routine_run_detail", { routineId, timestamp: run.routine.runs[0].ts }, "routine_run_detail");
  assert.equal(detail.ok, true, JSON.stringify(detail));
  assert.equal(detail.routineId, routineId);
  assert.equal(detail.ts, run.routine.runs[0].ts);
  assert.match(detail.content, /Gemini API 키/);
  assert.match(detail.output, /Gemini API 키/);
  assert.ok(!detail.output.includes("routineId:"));
  const deleted = await request("delete_routine", { routineId });
  assert.equal(deleted.ok, true);
  const remaining = await request("get_routines", {}, "routines_state");
  assert.ok(!remaining.items.some(item => item.id === routineId));
  return { preview, created: created.routine, updated: updated.routine, run: run.routine, detail };
}
