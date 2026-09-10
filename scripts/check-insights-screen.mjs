import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isKnownStatus,
  isProblemStatus,
  knownStatusValues,
  statusLabel,
  statusTone
} from "../apps/desktop/src/components/ui/status-tone.ts";

import {
  CALL_PAGE_SIZE,
  DIAGNOSTIC_SECTIONS,
  SLICE_IDS,
  callTitle,
  createSliceMap,
  describeFreshness,
  describeLoad,
  formatClock,
  formatDuration,
  formatTokens,
  markFailed,
  markLoading,
  markReady,
  shouldReloadOnReconnect,
  sliceForMessage,
  summarizeCalls
} from "../apps/desktop/src/features/insights/insights-view.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const insightsDir = path.join(repoRoot, "apps/desktop/src/features/insights");
let assertionCount = 0;

function check(label, fn) {
  assertionCount += 1;
  try {
    fn();
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

check("실패 상태를 성공으로 칠하지 않는다", () => {
  assert.equal(statusTone("unavailable"), "destructive");
  assert.notEqual(statusTone("unavailable"), "success");
  assert.equal(statusLabel("unavailable"), "사용 불가");
  assert.notEqual(statusLabel("unavailable"), "정상");
});

check("준비되지 않은 상태를 성공으로 칠하지 않는다", () => {
  assert.equal(statusTone("not_ready"), "warning");
  assert.notEqual(statusTone("not_ready"), "success");
});

check("끊긴 연결을 성공으로 칠하지 않는다", () => {
  assert.equal(statusTone("disconnected"), "destructive");
  assert.equal(statusTone("connected"), "success");
});

check("모르는 값은 성공이 아니라 중립이다", () => {
  for (const value of ["broken", "not_ok", "half-ready", "무언가"]) {
    assert.equal(statusTone(value), "default", value);
    assert.equal(isKnownStatus(value), false, value);
  }
});

check("모르는 값의 이름은 원문 그대로다", () => {
  assert.equal(statusLabel("half-ready"), "half-ready");
  assert.equal(statusLabel(""), "-");
});

check("아는 값은 모두 이름을 갖는다", () => {
  for (const value of knownStatusValues()) {
    assert.notEqual(statusLabel(value), value, `${value} 에 표시 이름이 없다`);
  }
});

check("문제 상태 판정이 색과 일치한다", () => {
  assert.equal(isProblemStatus("failed"), true);
  assert.equal(isProblemStatus("skipped"), false);
  assert.equal(isProblemStatus("ok"), false);
});

check("없음·끔은 실패가 아니다", () => {
  for (const value of ["missing", "empty", "disabled", "skipped", "not_requested"]) {
    assert.equal(statusTone(value), "default", value);
  }
});

check("처음에는 모든 구역이 조회 전이다", () => {
  const map = createSliceMap();
  assert.equal(Object.keys(map).length, SLICE_IDS.length);
  for (const id of SLICE_IDS) assert.equal(map[id].status, "idle");
});

check("한 구역의 상태 변화가 다른 구역을 건드리지 않는다", () => {
  let map = createSliceMap();
  map = markLoading(map, "telemetry");
  map = markFailed(map, "mcp", "실패");
  map = markReady(map, "git", "2026-09-09T00:00:00.000Z");
  assert.equal(map.telemetry.status, "loading");
  assert.equal(map.mcp.status, "failed");
  assert.equal(map.git.status, "ready");
  assert.equal(map.terminal.status, "idle");
  assert.equal(map.semantic.status, "idle");
});

check("실패해도 이전 결과 시각을 잃지 않는다", () => {
  let map = createSliceMap();
  map = markReady(map, "localLlm", "2026-09-09T01:00:00.000Z");
  map = markLoading(map, "localLlm");
  map = markFailed(map, "localLlm", "응답이 오지 않았습니다.");
  assert.equal(map.localLlm.updatedAt, "2026-09-09T01:00:00.000Z");
  assert.equal(map.localLlm.error, "응답이 오지 않았습니다.");
});

check("실패 사유가 비면 기본 문구를 쓴다", () => {
  const map = markFailed(createSliceMap(), "doctor", "");
  assert.ok(map.doctor.error.length > 0);
});

check("응답 종류가 구역과 정확히 이어진다", () => {
  assert.equal(sliceForMessage("telemetry_snapshot"), "telemetry");
  assert.equal(sliceForMessage("local_llm_snapshot"), "localLlm");
  assert.equal(sliceForMessage("self_improvement_snapshot"), "improvements");
  assert.equal(sliceForMessage("무관한_응답"), null);
});

check("모든 조회 단위에 응답 종류가 있다", () => {
  const mapped = new Set(
    [
      "telemetry_snapshot",
      "doctor_result",
      "mcp_servers_snapshot",
      "local_llm_snapshot",
      "terminal_capabilities_snapshot",
      "git_time_machine_snapshot",
      "semantic_search_readiness_snapshot",
      "code_repomap_snapshot",
      "commit_learning_snapshot",
      "self_improvement_snapshot"
    ].map(sliceForMessage)
  );
  for (const id of SLICE_IDS) assert.ok(mapped.has(id), `${id} 에 대응하는 응답 종류가 없다`);
});

check("조회 상태 문구가 네 상태를 구분한다", () => {
  const labels = ["idle", "loading", "ready", "failed"].map((status) =>
    describeLoad({ status, error: "", updatedAt: "" })
  );
  assert.equal(new Set(labels).size, 4);
});

check("실패한 진단 수를 센다", () => {
  let map = createSliceMap();
  map = markFailed(map, "mcp", "x");
  map = markFailed(map, "git", "y");
  const failed = DIAGNOSTIC_SECTIONS.filter((entry) => map[entry.id].status === "failed").length;
  assert.equal(failed, 2);
});

check("진단 구역 정의에 빠짐이 없다", () => {
  assert.equal(DIAGNOSTIC_SECTIONS.length, 9);
  for (const entry of DIAGNOSTIC_SECTIONS) {
    assert.ok(entry.label.length > 0, entry.id);
    assert.ok(entry.hint.length > 0, entry.id);
    assert.ok(SLICE_IDS.includes(entry.id), entry.id);
  }
  assert.ok(!DIAGNOSTIC_SECTIONS.some((entry) => entry.id === "telemetry"));
});

function call(patch = {}) {
  return {
    id: "c1",
    operation: "",
    provider: "groq",
    model: "gpt-oss-20b",
    status: "ok",
    totalTokens: 100,
    durationMs: 500,
    error: "",
    startedUtc: "2026-09-09T01:00:00.000Z",
    ...patch
  };
}

check("제목은 줄을 실제로 구분하는 값이다", () => {
  assert.equal(callTitle(call({ startedUtc: "not-a-date" })), "not-a-date");
  assert.equal(callTitle(call({ startedUtc: "" })), "-");
  assert.notEqual(
    callTitle(call({ startedUtc: "2026-09-09T01:00:00.000Z" })),
    callTitle(call({ startedUtc: "2026-09-09T02:00:00.000Z" }))
  );
});

check("요약은 실제 상태 문자열로 센다", () => {
  const summary = summarizeCalls([
    call({ id: "1", status: "ok" }),
    call({ id: "2", status: "timeout" }),
    call({ id: "3", status: "error" })
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.problem, 2);
  assert.equal(summary.totalTokens, 300);
  assert.equal(summary.averageDurationMs, 500);
});

check("빈 목록에서 나눗셈이 깨지지 않는다", () => {
  const summary = summarizeCalls([]);
  assert.equal(summary.total, 0);
  assert.equal(summary.averageDurationMs, 0);
});

check("숫자 표시가 값이 없을 때 무너지지 않는다", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatDuration(0), "-");
  assert.equal(formatDuration(500), "500ms");
  assert.equal(formatDuration(1500), "1.5초");
  assert.equal(formatClock("not-a-date"), "not-a-date");
});

check("연결이 끊기면 값이 이전 결과임을 밝힌다", () => {
  const stale = describeFreshness("2026-09-09T01:00:00.000Z", false);
  assert.ok(stale.includes("연결 끊김"));
  assert.ok(stale.includes("이전 값"));
  const fresh = describeFreshness("2026-09-09T01:00:00.000Z", true);
  assert.ok(!fresh.includes("연결 끊김"));
  assert.ok(describeFreshness("", true).includes("아직 조회 전"));
  assert.equal(describeFreshness("", true, "loading"), "조회 중");
  assert.notEqual(describeFreshness("", true, "loading"), "아직 조회 전");
});

check("다시 연결되면 이전 조회를 현재 값처럼 두지 않는다", () => {
  assert.equal(shouldReloadOnReconnect(true, false, "ready"), true);
  assert.equal(shouldReloadOnReconnect(true, false, "failed"), true);
  assert.equal(shouldReloadOnReconnect(true, false, "idle"), true);
  assert.equal(shouldReloadOnReconnect(true, true, "ready"), false);
  assert.equal(shouldReloadOnReconnect(false, true, "ready"), false);
  assert.equal(shouldReloadOnReconnect(true, false, "loading"), false);
});

const insightsFiles = readdirSync(insightsDir).filter((file) => /\.(tsx?)$/.test(file));
const insightsSources = new Map(
  insightsFiles.map((file) => [file, readFileSync(path.join(insightsDir, file), "utf8")])
);

check("이전 카드 묶음 파일을 남겨두지 않는다", () => {
  assert.equal(existsSync(path.join(insightsDir, "InsightsPanels.tsx")), false);
  assert.equal(existsSync(path.join(insightsDir, "InsightsLearningPanels.tsx")), false);
});

check("열 개를 한꺼번에 부르는 경로가 없다", () => {
  for (const [file, source] of insightsSources) {
    assert.ok(!source.includes("loadAll"), `${file} 에 한꺼번에 부르는 호출이 남아 있다`);
  }
  const store = insightsSources.get("insights-store.ts");
  assert.ok(!/requestDesktopInsights\.\w+\(\) &&/.test(store), "요청을 && 로 이어 붙이지 않는다");
});

check("조회 상태를 하나로 뭉치지 않는다", () => {
  const store = insightsSources.get("insights-store.ts");
  const stateBlock = store.slice(store.indexOf("type InsightsState = {"));
  const body = stateBlock.slice(0, stateBlock.indexOf("\n};"));
  assert.ok(body.length > 0, "InsightsState 정의를 찾지 못했다");
  assert.ok(!/\bloading: boolean;/.test(body), "공유 loading 필드가 남아 있다");
  assert.ok(!/\blastError: string;/.test(body), "공유 lastError 필드가 남아 있다");
  assert.ok(body.includes("slices: SliceMap"), "구역별 상태가 있다");
});

check("응답이 오지 않는 경우를 실패로 바꾼다", () => {
  const store = insightsSources.get("insights-store.ts");
  assert.ok(store.includes("SLICE_TIMEOUT_MS"), "조회 기한이 있다");
  assert.ok(store.includes("markFailed"), "기한을 넘기면 실패로 남긴다");
});

check("목록을 조용히 자르지 않는다", () => {
  const page = insightsSources.get("InsightsPage.tsx");
  assert.ok(page.includes("더 보기"), "남은 기록을 이어서 볼 수 있어야 한다");
  assert.ok(page.includes("CALL_PAGE_SIZE"));
  assert.ok(CALL_PAGE_SIZE > 0);
});

check("캡슐 탭과 한 칸만 여는 진단을 쓴다", () => {
  const page = insightsSources.get("InsightsPage.tsx");
  assert.ok(page.includes("ScreenTabs"), "캡슐 탭이 있다");
  assert.ok(page.includes("ScreenPanels"), "진단은 접힌 칸이다");
  assert.ok(!page.includes("CardBoundary"));
});

check("재연결 때 호출 목록을 다시 조회한다", () => {
  const page = insightsSources.get("InsightsPage.tsx");
  assert.ok(page.includes("shouldReloadOnReconnect"));
  assert.ok(page.includes("requested.current.clear()"));
});

check("사용 불가 상태가 실패 색이다", () => {
  const diagnostic = insightsSources.get("InsightsDiagnostic.tsx");
  assert.ok(diagnostic.includes("statusTone"));
  assert.equal(statusTone("unavailable"), "destructive");
});

check("화면마다 상태 색을 따로 만들지 않는다", () => {
  const roots = [
    "apps/desktop/src/features/insights",
    "apps/desktop/src/features/routing",
    "apps/desktop/src/features/logic",
    "apps/desktop/src/features/shell"
  ];
  for (const root of roots) {
    for (const file of readdirSync(path.join(repoRoot, root)).filter((name) => /\.tsx?$/.test(name))) {
      const source = readFileSync(path.join(repoRoot, root, file), "utf8");
      assert.ok(!/function statusTone\s*\(/.test(source), `${root}/${file} 이 상태 색 판정을 따로 갖고 있다`);
    }
  }
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  const source = insightsSources.get("insights-view.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "insights-view 에 의존이 있다");
});

check("로그 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("InsightsPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"insights"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
