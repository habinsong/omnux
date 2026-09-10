import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TIMELINE_KINDS,
  TIMELINE_PAGE_SIZE,
  buildHandoff,
  countLevels,
  entryTitle,
  filterByLevel,
  formatDateTime,
  formatTime,
  levelLabel,
  sourceLabel,
  timelineFields,
  timelineSeverityLabel,
  timelineSeverityTone
} from "../apps/desktop/src/features/activity/activity-view.ts";

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

check("기계용 접두사는 사람이 읽는 제목이 된다", () => {
  assert.equal(entryTitle("logic_path_list: 3건"), "경로 목록 3건");
  assert.equal(entryTitle("get_metrics: cpu 12%"), "자원 사용량 확인");
  assert.equal(entryTitle("command: git status"), "명령 실행");
});

check("접두사가 아니면 본문을 그대로 둔다", () => {
  assert.equal(entryTitle("사용자가 command: 형식을 물었다"), "사용자가 command: 형식을 물었다");
  assert.equal(entryTitle("plan_list 는 접두사가 아니다"), "plan_list 는 접두사가 아니다");
});

check("같은 활동은 본문 속 글자와 무관하게 같은 제목이다", () => {
  const paths = [
    "read_workspace_file: /a/storage/index.ts",
    "read_workspace_file: /a/refactor/plan.ts",
    "read_workspace_file: /a/docs/multipart.md",
    "read_workspace_file: /a/b/c.txt"
  ];
  assert.deepEqual([...new Set(paths.map(entryTitle))], ["작업 파일 읽기"]);
});

check("본문이 비면 빈 제목을 만들지 않는다", () => {
  assert.equal(entryTitle(""), "본문 없는 기록");
  assert.equal(entryTitle("   "), "본문 없는 기록");
});

check("아는 출처는 이름을 붙인다", () => {
  assert.equal(sourceLabel("ops"), "운영");
  assert.equal(sourceLabel("middleware"), "미들웨어");
});

check("모르는 출처는 원문 그대로 보여준다", () => {
  assert.equal(sourceLabel("new-subsystem"), "new-subsystem");
  assert.notEqual(sourceLabel("new-subsystem"), "셸");
});

check("레벨 집계는 실제 기록 수와 같다", () => {
  assert.deepEqual(
    countLevels([record({ id: "1", level: "error" }), record({ id: "2", level: "error" }), record({ id: "3", level: "warn" })]),
    { info: 0, warn: 1, error: 2 }
  );
});

check("레벨로 거른다", () => {
  const records = [
    record({ id: "1", level: "error", source: "ops" }),
    record({ id: "2", level: "error", source: "auth" }),
    record({ id: "3", level: "info", source: "ops" })
  ];
  assert.deepEqual(filterByLevel(records, "error").map((entry) => entry.id), ["1", "2"]);
  assert.equal(filterByLevel(records, "all").length, 3);
});

check("시각 표시는 해석 실패 시 원문을 남긴다", () => {
  assert.equal(formatTime("not-a-date"), "not-a-date");
  assert.equal(formatDateTime("not-a-date"), "not-a-date");
  assert.equal(formatTime(""), "-");
});

check("레벨 이름이 맞다", () => {
  assert.equal(levelLabel("error"), "오류");
  assert.equal(levelLabel("warn"), "주의");
  assert.equal(levelLabel("info"), "정보");
});

check("빌드로 넘기는 본문에 원문이 그대로 실린다", () => {
  const text = buildHandoff(record({ message: "read_workspace_file: /a/storage/index.ts", level: "error", source: "ops" }));
  assert.ok(text.includes("read_workspace_file: /a/storage/index.ts"));
  assert.ok(text.includes("오류"));
  assert.ok(text.includes("(ops)"));
});

check("컴포넌트 기록이 있으면 함께 넘긴다", () => {
  const text = buildHandoff(record({ componentStack: "at Foo\nat Bar" }));
  assert.ok(text.includes("컴포넌트 기록:"));
  assert.ok(text.includes("at Foo"));
});

check("고른 종류에만 값이 들어간다", () => {
  assert.deepEqual(timelineFields("run", " r-1 "), { conversationId: "", runId: "r-1", agentId: "", groupId: "" });
  assert.deepEqual(timelineFields("conversation", "c-1"), { conversationId: "c-1", runId: "", agentId: "", groupId: "" });
});

check("종류를 바꾸면 이전 값이 남지 않는다", () => {
  const first = timelineFields("conversation", "c-1");
  const second = timelineFields("agent", "a-1");
  assert.equal(first.conversationId, "c-1");
  assert.equal(second.conversationId, "");
  assert.equal(second.agentId, "a-1");
});

check("네 종류 모두 이름이 있다", () => {
  assert.equal(TIMELINE_KINDS.length, 4);
  for (const entry of TIMELINE_KINDS) assert.ok(entry.label.length > 0, entry.kind);
});

check("severity 는 서버가 보내는 값에만 색을 준다", () => {
  assert.equal(timelineSeverityTone("error"), "destructive");
  assert.equal(timelineSeverityTone("warning"), "warning");
  assert.equal(timelineSeverityTone("info"), "success");
  assert.equal(timelineSeverityTone("not_ok"), "default");
  assert.equal(timelineSeverityLabel("not_ok"), "not_ok");
  assert.equal(timelineSeverityLabel(""), "기록");
});

check("결과를 한 번에 다 그리지 않아도 건수를 밝힐 수 있다", () => {
  assert.ok(TIMELINE_PAGE_SIZE > 0);
});

const activityFiles = readdirSync(activityDir).filter((file) => /\.(tsx?)$/.test(file));
const activitySources = new Map(activityFiles.map((file) => [file, readFileSync(path.join(activityDir, file), "utf8")]));

check("본문 문자열로 활동 종류를 짐작하는 코드가 없다", () => {
  for (const [file, source] of activitySources) {
    assert.ok(!source.includes("inferActivityType"), `${file} 에 추측 분류가 남아 있다`);
    assert.ok(!source.includes("ProductTypeFilter"), `${file} 에 추측 분류 타입이 남아 있다`);
  }
});

check("이전 화면 파일을 남겨두지 않는다", () => {
  assert.equal(existsSync(path.join(activityDir, "SessionReplayPanel.tsx")), false);
  assert.equal(existsSync(path.join(activityDir, "ActivityTimeline.tsx")), false);
});

check("펼친 본문은 원문 전체를 보여준다", () => {
  const page = activitySources.get("ActivityPage.tsx");
  assert.ok(page.includes("{entry.message}"));
  assert.ok(page.includes("whitespace-pre-wrap"));
});

check("타임라인 결과를 조용히 자르지 않는다", () => {
  const page = activitySources.get("ActivityPage.tsx");
  assert.ok(page.includes("더 보기"));
  assert.ok(page.includes("TIMELINE_PAGE_SIZE"));
});

check("캡슐 탭을 쓴다", () => {
  const page = activitySources.get("ActivityPage.tsx");
  assert.ok(page.includes("ScreenTabs"));
  assert.ok(!page.includes("CardBoundary"));
});

check("순수 모델은 React 나 저장소를 가져오지 않는다", () => {
  const source = activitySources.get("activity-view.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "activity-view 에 실행 시 의존이 있다");
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
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
