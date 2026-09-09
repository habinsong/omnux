import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALL_SOURCES,
  UNKNOWN_DAY_KEY,
  activityLevelLabel,
  activityLevelTone,
  activitySourceLabel,
  buildActivityHandoff,
  countActivityLevels,
  describeActivity,
  describeActivityFilter,
  filterActivities,
  formatActivityDay,
  formatActivityDateTime,
  formatActivityTime,
  groupActivitiesByDay,
  isActivityFilterActive,
  listActivitySources
} from "../apps/desktop/src/features/activity/activity-model.ts";

import {
  TIMELINE_ID_KINDS,
  TIMELINE_LIMIT_DEFAULT,
  TIMELINE_LIMIT_MAX,
  TIMELINE_LIMIT_MIN,
  TIMELINE_PAGE_SIZE,
  buildTimelineIdFields,
  clampTimelineLimit,
  timelineIdError,
  timelineIdKindLabel,
  timelineIdPlaceholder,
  timelineSeverityLabel,
  timelineSeverityTone
} from "../apps/desktop/src/features/activity/session-timeline-query.ts";

/**
 * 활동 화면의 순수 모델을 실제로 실행해 확인한다.
 * 표식만 훑지 않고 함수를 호출해 결과를 대조한다.
 * 이전 화면은 본문 문자열을 훑어 활동 종류를 짐작했고, 파일 경로 글자에 따라
 * 같은 활동이 질문/빌드/비교로 갈렸다. 그 방식이 돌아오면 이 검사가 실패한다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const activityDir = path.join(repoRoot, "apps/desktop/src/features/activity");
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

function record(patch = {}) {
  return {
    id: "r1",
    level: "info",
    message: "기록",
    createdAt: "2026-09-09T01:02:03.000Z",
    source: "shell",
    componentStack: null,
    ...patch
  };
}

/* -- 1) 본문 제목: 접두사만 바꾼다 --------------------------------------- */

check("기계용 접두사는 사람이 읽는 제목이 된다", () => {
  assert.equal(describeActivity("logic_path_list: 3건"), "경로 목록 3건");
  assert.equal(describeActivity("get_metrics: cpu 12%"), "리소스 사용량 확인");
  assert.equal(describeActivity("command: git status"), "명령 실행");
});

check("접두사가 아니면 본문을 그대로 둔다", () => {
  // 본문 가운데 같은 글자가 있어도 바꾸지 않는다.
  assert.equal(describeActivity("사용자가 command: 형식을 물었다"), "사용자가 command: 형식을 물었다");
  assert.equal(describeActivity("plan_list 는 접두사가 아니다"), "plan_list 는 접두사가 아니다");
});

check("같은 활동은 본문 속 글자와 무관하게 같은 제목이다", () => {
  // 이전 화면의 결함: 경로에 storage/refactor/multi 가 들어가면 질문/빌드/비교로 갈렸다.
  const paths = [
    "read_workspace_file: /a/storage/index.ts",
    "read_workspace_file: /a/refactor/plan.ts",
    "read_workspace_file: /a/docs/multipart.md",
    "read_workspace_file: /a/b/c.txt"
  ];
  const titles = new Set(paths.map(describeActivity));
  assert.deepEqual([...titles], ["작업 파일 읽기"]);
});

check("본문이 비면 빈 제목을 만들지 않는다", () => {
  assert.equal(describeActivity(""), "본문 없는 기록");
  assert.equal(describeActivity("   "), "본문 없는 기록");
});

check("펼친 본문은 조건 없이 원문 전체를 보여준다", () => {
  // 제목은 좁은 화면에서 잘린다. 원문을 조건부로만 보여주면 긴 본문을 읽을 방법이 없어진다.
  const timeline = readFileSync(path.join(activityDir, "ActivityTimeline.tsx"), "utf8");
  assert.ok(timeline.includes("기록 원문"), "원문 영역이 있다");
  assert.ok(!timeline.includes("showsRawMessage"), "원문 표시를 조건에 걸지 않는다");
  assert.ok(!timeline.includes("activityTitleHidesMessage"), "원문 표시를 조건에 걸지 않는다");
});

/* -- 2) 출처: 모르는 값을 임의로 바꾸지 않는다 ---------------------------- */

check("아는 출처는 이름을 붙인다", () => {
  assert.equal(activitySourceLabel("ops"), "운영");
  assert.equal(activitySourceLabel("middleware"), "미들웨어");
});

check("모르는 출처는 원문 그대로 보여준다", () => {
  // 이전 화면은 모르는 출처를 전부 "셸"로 표시해 실제 출처를 가렸다.
  assert.equal(activitySourceLabel("new-subsystem"), "new-subsystem");
  assert.notEqual(activitySourceLabel("new-subsystem"), "셸");
});

/* -- 3) 집계 -------------------------------------------------------------- */

check("레벨 집계는 실제 기록 수와 같다", () => {
  const counts = countActivityLevels([
    record({ id: "1", level: "error" }),
    record({ id: "2", level: "error" }),
    record({ id: "3", level: "warn" })
  ]);
  assert.deepEqual(counts, { info: 0, warn: 1, error: 2 });
});

check("출처 목록은 실제로 나타난 출처만 담는다", () => {
  const sources = listActivitySources([
    record({ id: "1", source: "ops" }),
    record({ id: "2", source: "ops" }),
    record({ id: "3", source: "auth" })
  ]);
  assert.deepEqual(sources, [
    { source: "ops", label: "운영", count: 2 },
    { source: "auth", label: "인증", count: 1 }
  ]);
});

check("출처 목록 순서는 건수가 같아도 흔들리지 않는다", () => {
  const first = listActivitySources([record({ id: "1", source: "b" }), record({ id: "2", source: "a" })]);
  const second = listActivitySources([record({ id: "1", source: "a" }), record({ id: "2", source: "b" })]);
  assert.deepEqual(first.map((entry) => entry.source), ["a", "b"]);
  assert.deepEqual(first, second);
});

/* -- 4) 거르기 ------------------------------------------------------------ */

check("레벨과 출처로 함께 거른다", () => {
  const records = [
    record({ id: "1", level: "error", source: "ops" }),
    record({ id: "2", level: "error", source: "auth" }),
    record({ id: "3", level: "info", source: "ops" })
  ];
  assert.deepEqual(
    filterActivities(records, { level: "error", source: "ops" }).map((entry) => entry.id),
    ["1"]
  );
  assert.equal(filterActivities(records, { level: "all", source: ALL_SOURCES }).length, 3);
});

check("거르는 중인지 화면이 알 수 있다", () => {
  assert.equal(isActivityFilterActive({ level: "all", source: ALL_SOURCES }), false);
  assert.equal(isActivityFilterActive({ level: "error", source: ALL_SOURCES }), true);
  assert.equal(isActivityFilterActive({ level: "all", source: "ops" }), true);
});

check("거르기 설명은 사람이 읽는 문구다", () => {
  assert.equal(describeActivityFilter({ level: "all", source: ALL_SOURCES }), "전체");
  assert.equal(describeActivityFilter({ level: "error", source: "ops" }), "오류 · 운영");
});

/* -- 5) 날짜 묶기 --------------------------------------------------------- */

const now = new Date(2026, 8, 9, 12, 0, 0);

check("오늘과 어제만 이름을 붙인다", () => {
  const today = new Date(2026, 8, 9, 3, 0, 0).toISOString();
  const yesterday = new Date(2026, 8, 8, 23, 0, 0).toISOString();
  const older = new Date(2026, 8, 1, 9, 0, 0).toISOString();
  assert.equal(formatActivityDay(today, now), "오늘");
  assert.equal(formatActivityDay(yesterday, now), "어제");
  assert.notEqual(formatActivityDay(older, now), "오늘");
});

check("묶음 안에서 입력 순서를 유지한다", () => {
  const a = record({ id: "a", createdAt: new Date(2026, 8, 9, 10, 0, 0).toISOString() });
  const b = record({ id: "b", createdAt: new Date(2026, 8, 9, 9, 0, 0).toISOString() });
  const c = record({ id: "c", createdAt: new Date(2026, 8, 8, 9, 0, 0).toISOString() });
  const groups = groupActivitiesByDay([a, b, c], now);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].records.map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(groups[1].records.map((entry) => entry.id), ["c"]);
});

check("모든 기록은 정확히 한 묶음에만 들어간다", () => {
  const records = [
    record({ id: "a", createdAt: new Date(2026, 8, 9, 10, 0, 0).toISOString() }),
    record({ id: "b", createdAt: new Date(2026, 8, 8, 9, 0, 0).toISOString() }),
    record({ id: "c", createdAt: "" })
  ];
  const groups = groupActivitiesByDay(records, now);
  const ids = groups.flatMap((group) => group.records.map((entry) => entry.id));
  assert.deepEqual(ids.slice().sort(), ["a", "b", "c"]);
  assert.equal(new Set(ids).size, ids.length);
});

check("해석하지 못한 시각도 잃지 않는다", () => {
  const groups = groupActivitiesByDay([record({ id: "x", createdAt: "not-a-date" })], now);
  assert.equal(groups[0].key, UNKNOWN_DAY_KEY);
  assert.equal(groups[0].label, "시각 없음");
  assert.equal(groups[0].records.length, 1);
});

check("시각 표시는 해석 실패 시 원문을 남긴다", () => {
  assert.equal(formatActivityTime("not-a-date"), "not-a-date");
  assert.equal(formatActivityDateTime("not-a-date"), "not-a-date");
  assert.equal(formatActivityTime(""), "-");
});

/* -- 6) 레벨 표시 --------------------------------------------------------- */

check("레벨 이름과 색이 서로 어긋나지 않는다", () => {
  assert.equal(activityLevelLabel("error"), "오류");
  assert.equal(activityLevelTone("error"), "destructive");
  assert.equal(activityLevelTone("warn"), "warning");
  assert.equal(activityLevelTone("info"), "success");
});

/* -- 7) 빌드 넘기기 ------------------------------------------------------- */

check("빌드로 넘기는 본문에 원문이 그대로 실린다", () => {
  const text = buildActivityHandoff(
    record({ message: "read_workspace_file: /a/storage/index.ts", level: "error", source: "ops" })
  );
  assert.ok(text.includes("read_workspace_file: /a/storage/index.ts"));
  assert.ok(text.includes("오류"));
  assert.ok(text.includes("(ops)"));
});

check("컴포넌트 기록이 있으면 함께 넘긴다", () => {
  const text = buildActivityHandoff(record({ componentStack: "at Foo\nat Bar" }));
  assert.ok(text.includes("컴포넌트 기록:"));
  assert.ok(text.includes("at Foo"));
});

/* -- 8) 세션 타임라인 입력 ------------------------------------------------ */

check("고른 종류에만 값이 들어간다", () => {
  assert.deepEqual(buildTimelineIdFields("run", " r-1 "), {
    conversationId: "",
    runId: "r-1",
    agentId: "",
    groupId: ""
  });
  assert.deepEqual(buildTimelineIdFields("conversation", "c-1"), {
    conversationId: "c-1",
    runId: "",
    agentId: "",
    groupId: ""
  });
});

check("종류를 바꾸면 이전 값이 남지 않는다", () => {
  const first = buildTimelineIdFields("conversation", "c-1");
  const second = buildTimelineIdFields("agent", "a-1");
  assert.equal(first.conversationId, "c-1");
  assert.equal(second.conversationId, "");
  assert.equal(second.agentId, "a-1");
});

check("네 종류 모두 이름과 안내 문구가 있다", () => {
  assert.equal(TIMELINE_ID_KINDS.length, 4);
  for (const entry of TIMELINE_ID_KINDS) {
    assert.equal(timelineIdKindLabel(entry.kind), entry.label);
    assert.equal(timelineIdPlaceholder(entry.kind), entry.placeholder);
  }
});

check("빈 ID 는 사유와 함께 막는다", () => {
  assert.notEqual(timelineIdError("   "), "");
  assert.equal(timelineIdError("c-1"), "");
});

check("표시 수는 서버 범위로 맞춘다", () => {
  assert.equal(clampTimelineLimit("5"), TIMELINE_LIMIT_MIN);
  assert.equal(clampTimelineLimit("9999"), TIMELINE_LIMIT_MAX);
  assert.equal(clampTimelineLimit("abc"), TIMELINE_LIMIT_DEFAULT);
  assert.equal(clampTimelineLimit("100"), 100);
});

check("severity 는 서버가 보내는 값에만 색을 준다", () => {
  assert.equal(timelineSeverityTone("error"), "destructive");
  assert.equal(timelineSeverityTone("warning"), "warning");
  assert.equal(timelineSeverityTone("info"), "success");
  // 모르는 값을 성공(초록)으로 칠하지 않는다.
  assert.equal(timelineSeverityTone("not_ok"), "outline");
  assert.equal(timelineSeverityLabel("not_ok"), "not_ok");
  assert.equal(timelineSeverityLabel(""), "기록");
});

check("결과를 한 번에 다 그리지 않아도 건수를 밝힐 수 있다", () => {
  assert.ok(TIMELINE_PAGE_SIZE > 0);
});

/* -- 9) 화면 소스 계약 ---------------------------------------------------- */

const activityFiles = readdirSync(activityDir).filter((file) => /\.(tsx?)$/.test(file));
const activitySources = new Map(
  activityFiles.map((file) => [file, readFileSync(path.join(activityDir, file), "utf8")])
);

check("본문 문자열로 활동 종류를 짐작하는 코드가 없다", () => {
  for (const [file, source] of activitySources) {
    assert.ok(!source.includes("inferActivityType"), `${file} 에 추측 분류가 남아 있다`);
    assert.ok(!source.includes("ProductTypeFilter"), `${file} 에 추측 분류 타입이 남아 있다`);
  }
});

check("이전 화면 파일을 남겨두지 않는다", () => {
  assert.equal(existsSync(path.join(activityDir, "SessionReplayPanel.tsx")), false);
});

check("같은 기록을 목록에 두 번 그리지 않는다", () => {
  const page = activitySources.get("ActivityPage.tsx");
  // 목록을 그리는 곳은 하나뿐이다. 요약·이력·전체를 따로 그리면 같은 기록이 겹친다.
  assert.equal((page.match(/<ActivityTimeline/g) || []).length, 1);
  assert.ok(!page.includes("최근 실행 기록"));
  assert.ok(!page.includes("작업 이력"));
});

check("직접 만든 모달 대신 접이식 본문을 쓴다", () => {
  for (const [file, source] of activitySources) {
    assert.ok(!source.includes('aria-modal'), `${file} 에 직접 만든 모달이 있다`);
  }
});

check("타임라인 결과를 조용히 자르지 않는다", () => {
  const panel = activitySources.get("SessionTimelinePanel.tsx");
  assert.ok(panel.includes("더 보기"), "남은 기록을 이어서 볼 수 있어야 한다");
  assert.ok(!/events\.slice\(0,\s*\d+\)/.test(panel), "고정 개수로 잘라내지 않는다");
});

check("순수 모델은 React 나 저장소를 가져오지 않는다", () => {
  for (const file of ["activity-model.ts", "session-timeline-query.ts"]) {
    const source = activitySources.get(file);
    assert.ok(!source.includes('from "react"'), `${file} 이 React 를 가져온다`);
    assert.ok(!source.includes("zustand"), `${file} 이 저장소를 가져온다`);
    assert.ok(!/^import [^t]/m.test(source), `${file} 에 실행 시 의존이 있다`);
  }
});

check("활동 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("ActivityPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"activity"'));
});

check("보관 한도를 화면이 밝힌다", () => {
  const page = activitySources.get("ActivityPage.tsx");
  assert.ok(page.includes("MAX_UI_LOGS"), "보관 한도를 화면이 읽는다");
  const store = readFileSync(
    path.join(repoRoot, "apps/desktop/src/features/ui-log/ui-log-store.ts"),
    "utf8"
  );
  assert.ok(store.includes("export const MAX_UI_LOGS"), "한도가 한 곳에서 정의된다");
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
