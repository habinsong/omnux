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
  DIAGNOSTIC_SLICES,
  SLICE_IDS,
  countFailedSlices,
  createSliceMap,
  describeSliceState,
  markFailed,
  markLoading,
  markReady,
  sliceForMessage
} from "../apps/desktop/src/features/insights/insights-slices.ts";

import {
  callTitle,
  describeFreshness,
  formatClock,
  formatDuration,
  formatTokens,
  summarizeCalls
} from "../apps/desktop/src/features/insights/insights-telemetry.ts";

import {
  buildDoctorView,
  buildGitView,
  buildLocalLlmView,
  buildSemanticView
} from "../apps/desktop/src/features/insights/insights-diagnostics.ts";

/**
 * 로그 화면의 순수 모델을 실제로 실행해 확인한다.
 * 이전 화면은 상태 문자열을 부분문자열로 판정해 `unavailable` 을 초록(정상)으로 칠했고,
 * 열 개의 조회가 하나의 loading·lastError 를 공유해 실패한 조회가 완료로 보였다.
 * 그 방식이 돌아오면 이 검사가 실패한다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const insightsDir = path.join(repoRoot, "apps/desktop/src/features/insights");
const insightsSources0 = new Map(
  readdirSync(insightsDir)
    .filter((file) => /\.(tsx?)$/.test(file))
    .map((file) => [file, readFileSync(path.join(insightsDir, file), "utf8")])
);
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

/* -- 1) 상태 색: 부분문자열로 판정하지 않는다 ----------------------------- */

check("실패 상태를 성공으로 칠하지 않는다", () => {
  // `unavailable` 은 `available` 을 포함한다. 이전 화면은 이 때문에 초록이었다.
  assert.equal(statusTone("unavailable"), "destructive");
  assert.notEqual(statusTone("unavailable"), "success");
  assert.equal(statusLabel("unavailable"), "사용 불가");
  assert.notEqual(statusLabel("unavailable"), "정상");
});

check("준비되지 않은 상태를 성공으로 칠하지 않는다", () => {
  // `not_ready` 는 `ready` 를 포함한다. 셸 상태 카드가 이 때문에 초록이었다.
  assert.equal(statusTone("not_ready"), "warning");
  assert.notEqual(statusTone("not_ready"), "success");
});

check("끊긴 연결을 성공으로 칠하지 않는다", () => {
  // `disconnected` 는 `connected` 를 포함한다.
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

/* -- 2) 조회 단위: 상태를 공유하지 않는다 -------------------------------- */

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
  // 나머지는 그대로다. 한 응답이 열 구역 전체를 완료로 만들지 않는다.
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
    describeSliceState({ status, error: "", updatedAt: "" })
  );
  assert.equal(new Set(labels).size, 4);
});

check("실패한 진단 수를 센다", () => {
  let map = createSliceMap();
  map = markFailed(map, "mcp", "x");
  map = markFailed(map, "git", "y");
  const ids = DIAGNOSTIC_SLICES.map((entry) => entry.id);
  assert.equal(countFailedSlices(map, ids), 2);
});

check("진단 구역 정의에 빠짐이 없다", () => {
  assert.equal(DIAGNOSTIC_SLICES.length, 9);
  for (const entry of DIAGNOSTIC_SLICES) {
    assert.ok(entry.label.length > 0, entry.id);
    assert.ok(entry.description.length > 0, entry.id);
    assert.ok(SLICE_IDS.includes(entry.id), entry.id);
  }
  // 호출 기록은 기본 본문이라 진단 목록에 없다.
  assert.ok(!DIAGNOSTIC_SLICES.some((entry) => entry.id === "telemetry"));
});

/* -- 3) 호출 기록 -------------------------------------------------------- */

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
    completedUtc: "2026-09-09T01:00:00.500Z",
    ...patch
  };
}

check("제목은 줄을 실제로 구분하는 값이다", () => {
  // 작업 이름은 거의 모든 호출이 같은 값이라 제목으로 쓰면 줄이 구분되지 않는다.
  assert.equal(callTitle(call({ operation: "llm.call" })), "groq · gpt-oss-20b");
  assert.equal(callTitle(call({ provider: "", model: "", operation: "llm.call" })), "llm.call");
  assert.equal(callTitle(call({ provider: "", model: "", operation: "" })), "이름 없는 호출");
});

check("목록을 조용히 자르지 않는다", () => {
  const list = insightsSources0.get("CallLogList.tsx");
  assert.ok(list.includes("더 보기"), "남은 기록을 이어서 볼 수 있어야 한다");
  assert.ok(!/events\.slice\(0,\s*\d+\)/.test(list), "고정 개수로 잘라내지 않는다");
});

check("요약은 실제 상태 문자열로 센다", () => {
  const summary = summarizeCalls([
    call({ id: "1", status: "ok" }),
    call({ id: "2", status: "timeout" }),
    call({ id: "3", status: "error" })
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.ok, 1);
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
  assert.ok(stale.includes("이전 결과"));

  const fresh = describeFreshness("2026-09-09T01:00:00.000Z", true);
  assert.ok(!fresh.includes("연결 끊김"));

  assert.ok(describeFreshness("", true).includes("아직 조회하지"));
});

/* -- 4) 진단 내용 -------------------------------------------------------- */

check("보고서가 없으면 없다고 말한다", () => {
  const view = buildDoctorView({ found: false, report: null, action: "", lastError: "" });
  assert.ok(view.headline.includes("없습니다"));
  assert.equal(view.checks.length, 0);
});

check("연결 실패한 로컬 모델 연결점이 실패 상태로 남는다", () => {
  const view = buildLocalLlmView({
    endpoints: [
      { name: "ollama", kind: "ollama", baseUrl: "http://127.0.0.1:11434", status: "unavailable", modelCount: 0, elapsedMs: 12, error: "timeout", models: [] }
    ],
    availableEndpointCount: 0,
    totalModelCount: 0,
    offlineReady: false,
    offlineMode: { requested: false, status: "not_requested", requestedBy: [], cloudProviderKeysPresent: [], checks: [] },
    warnings: [],
    scannedAtUtc: ""
  });
  const endpoint = view.checks[0];
  assert.equal(endpoint.status, "unavailable");
  assert.equal(statusTone(endpoint.status), "destructive");
  assert.equal(view.badges[0].status, "unavailable");
});

check("Git 저장소가 아니면 그 사실만 말한다", () => {
  const view = buildGitView({
    repositoryRoot: "", branchName: "", headHash: "", headShortHash: "",
    isRepository: false, readOnly: true, hasChanges: false, isClean: true,
    changedFileCount: 0, conflictedFileCount: 0, diffShortStat: "", limit: 0,
    checkpointsTruncated: false, snapshotNamespace: "", suggestedSnapshotBranch: "",
    checkpoints: [],
    readiness: { status: "", snapshotCreationRecommended: false, rollbackAvailable: false, requiresApproval: false, blockers: [] },
    checks: [], warnings: [], scannedAtUtc: ""
  });
  assert.ok(view.headline.includes("Git 저장소가 아닙니다"));
});

check("검색 인덱스의 사용 불가 상태가 실패 색이다", () => {
  const view = buildSemanticView({
    status: "ok", mode: "read", readOnly: true,
    vectorSearchEnabled: false, embeddingGenerationEnabled: false, codeSearchRecommended: false,
    index: { dbExists: true, sqliteCliAvailable: true, ftsAvailable: false, sqliteVecAvailable: false, fileCount: 1, chunkCount: 2, embeddingCacheEntryCount: 0, chunkSources: [] },
    embedding: { localEndpointAvailable: false, candidateModelAvailable: false, availableEndpointCount: 0, totalModelCount: 0, candidateModels: [] },
    checks: [], recommendations: [], skipped: [], warnings: [], scannedAtUtc: ""
  });
  const fts = view.badges.find((badge) => badge.label.includes("전문 검색"));
  assert.equal(fts.status, "unavailable");
  assert.equal(statusTone(fts.status), "destructive");
});

/* -- 5) 화면 소스 계약 --------------------------------------------------- */

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
  // 화면 전체가 공유하는 loading/lastError 가 아니라 구역별 상태를 쓴다.
  assert.ok(!/\bloading: boolean;/.test(body), "공유 loading 필드가 남아 있다");
  assert.ok(!/\blastError: string;/.test(body), "공유 lastError 필드가 남아 있다");
  assert.ok(body.includes("slices: SliceMap"), "구역별 상태가 있다");
});

check("응답이 오지 않는 경우를 실패로 바꾼다", () => {
  const store = insightsSources.get("insights-store.ts");
  assert.ok(store.includes("SLICE_TIMEOUT_MS"), "조회 기한이 있다");
  assert.ok(store.includes("markFailed"), "기한을 넘기면 실패로 남긴다");
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
      assert.ok(
        !/function statusTone\s*\(/.test(source),
        `${root}/${file} 이 상태 색 판정을 따로 갖고 있다`
      );
    }
  }
  const readOnly = readFileSync(path.join(repoRoot, "apps/desktop/src/ReadOnlyWsPanel.tsx"), "utf8");
  assert.ok(!/function statusTone\s*\(/.test(readOnly));
});

check("공용 상태 모듈이 한 곳에만 있다", () => {
  const shared = path.join(repoRoot, "apps/desktop/src/components/ui/status-tone.ts");
  assert.equal(existsSync(shared), true);
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  for (const file of ["insights-slices.ts", "insights-telemetry.ts", "insights-diagnostics.ts"]) {
    const source = insightsSources.get(file);
    assert.ok(!source.includes('from "react"'), `${file} 이 React 를 가져온다`);
    assert.ok(!source.includes("zustand"), `${file} 이 저장소를 가져온다`);
    // 값을 가져오는 것은 공용 순수 모듈 하나뿐이다.
    const valueImports = [...source.matchAll(/^import (?!type )[^\n]*from "([^"]+)"/gm)].map((m) => m[1]);
    for (const specifier of valueImports) {
      assert.equal(specifier, "../middleware/slice-state.ts", `${file} 이 ${specifier} 를 가져온다`);
    }
  }
});

check("구역 상태 규칙을 화면마다 새로 만들지 않는다", () => {
  const shared = path.join(repoRoot, "apps/desktop/src/features/middleware/slice-state.ts");
  assert.equal(existsSync(shared), true, "공용 구역 상태 모듈이 있다");
  const source = readFileSync(shared, "utf8");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "공용 모듈은 아무것도 가져오지 않는다");
});

check("로그 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("InsightsPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"insights"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
