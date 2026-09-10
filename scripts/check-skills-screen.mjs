import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SKILL_NAME_PATTERN,
  countByScope,
  defaultSkillBody,
  describeNameHint,
  describeSaveBlock,
  describeUsage,
  filterSkills,
  parseScope,
  scopeLabel,
  shouldReplaceList,
  skillKey,
  skillRequestId
} from "../apps/desktop/src/features/skills/skills-model.ts";

/**
 * 도구(스킬) 화면의 순수 모델을 실제로 실행해 확인한다.
 * 실제 앱에서 재현한 문제:
 *   - 새 도구를 저장해도 편집기가 계속 "새 도구"라, 저장을 한 번 더 누르면
 *     "같은 이름의 스킬이 이미 있습니다" 로 실패했다.
 *   - 목록 조회가 실패하면 이미 받아 둔 목록이 통째로 지워졌다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(repoRoot, "apps/desktop/src/features/skills");
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

function editor(patch = {}) {
  return { name: "my-skill", scope: "project", description: "설명", body: "# 본문", isNew: true, ...patch };
}

/* -- 1) 저장 조건 --------------------------------------------------------- */

check("모두 채우면 저장을 막지 않는다", () => {
  assert.equal(describeSaveBlock(editor()), "");
});

check("빠진 값마다 다른 사유를 돌려준다", () => {
  assert.equal(describeSaveBlock(null), "먼저 도구를 고르거나 새로 만드세요.");
  assert.ok(describeSaveBlock(editor({ name: "  " })).includes("이름"));
  assert.ok(describeSaveBlock(editor({ body: "  " })).includes("본문"));
});

check("새 도구의 이름 규칙을 지킨다", () => {
  assert.ok(describeSaveBlock(editor({ name: "Bad Name" })).includes("소문자"));
  assert.ok(describeSaveBlock(editor({ name: "-starts-with-dash" })).includes("소문자"));
  assert.equal(describeSaveBlock(editor({ name: "ok-name-9" })), "");
});

check("이미 저장한 도구는 이름 규칙을 다시 따지지 않는다", () => {
  // 서버가 이미 받아들인 이름이다. 규칙이 바뀌어도 편집을 막지 않는다.
  assert.equal(describeSaveBlock(editor({ name: "Legacy_Name", isNew: false })), "");
});

check("이름 안내는 잘못된 값일 때만 바뀐다", () => {
  assert.equal(describeNameHint(editor({ name: "ok-name" })).invalid, false);
  assert.equal(describeNameHint(editor({ name: "Bad" })).invalid, true);
  assert.equal(describeNameHint(editor({ name: "" })).invalid, false);
  assert.equal(describeNameHint(null).text, "");
});

/* -- 2) 목록이 실패로 지워지지 않는다 -------------------------------------- */

check("실패 응답으로 받아 둔 목록을 지우지 않는다", () => {
  // 이전 구현은 실패 응답의 빈 items 를 그대로 반영해 목록을 비웠다.
  assert.equal(shouldReplaceList(false, 0, 5), false);
});

check("성공 응답은 항상 반영한다", () => {
  assert.equal(shouldReplaceList(true, 0, 5), true);
  assert.equal(shouldReplaceList(true, 3, 0), true);
});

check("아직 목록이 없으면 실패 응답이라도 빈 목록을 받아들인다", () => {
  assert.equal(shouldReplaceList(false, 0, 0), true);
});

/* -- 3) 목록 다루기 ------------------------------------------------------- */

const list = [
  { name: "code-review", scope: "project", description: "코드를 살펴본다" },
  { name: "brainstorming", scope: "project", description: "아이디어를 모은다" },
  { name: "shared-style", scope: "global", description: "공통 문체" }
];

check("이름·설명·범위로 찾는다", () => {
  assert.equal(filterSkills(list, "code").length, 1);
  assert.equal(filterSkills(list, "아이디어").length, 1);
  assert.equal(filterSkills(list, "전역").length, 1);
  assert.equal(filterSkills(list, "").length, 3);
  assert.equal(filterSkills(list, "없는말").length, 0);
});

check("범위별로 센다", () => {
  assert.deepEqual(countByScope(list), { project: 2, global: 1 });
  assert.deepEqual(countByScope([]), { project: 0, global: 0 });
});

check("같은 이름이라도 범위가 다르면 다른 항목이다", () => {
  assert.notEqual(skillKey({ name: "a", scope: "project" }), skillKey({ name: "a", scope: "global" }));
});

check("모르는 범위 값은 프로젝트로 본다", () => {
  assert.equal(parseScope("global"), "global");
  assert.equal(parseScope("project"), "project");
  assert.equal(parseScope("무언가"), "project");
  assert.equal(scopeLabel("global"), "전역");
});

/* -- 4) 안내 문구 --------------------------------------------------------- */

check("쓰는 법을 이름과 함께 알려준다", () => {
  assert.ok(describeUsage("code-review").includes("code-review"));
  assert.ok(describeUsage("  ").includes("이름을 먼저"));
});

check("기본 양식은 제목을 이름에서 만든다", () => {
  const body = defaultSkillBody("ui-review");
  assert.ok(body.startsWith("# Ui Review"));
  assert.ok(body.includes("## 언제 쓰나"));
  assert.ok(defaultSkillBody("").startsWith("# 새 도구"));
});

check("요청 ID 는 종류와 번호를 담는다", () => {
  assert.notEqual(skillRequestId("get", 1), skillRequestId("get", 2));
  assert.ok(skillRequestId("save", 3).includes("save"));
});

check("이름 규칙이 실제 값과 맞는다", () => {
  assert.ok(SKILL_NAME_PATTERN.test("code-review"));
  assert.ok(!SKILL_NAME_PATTERN.test("Code-Review"));
  assert.ok(!SKILL_NAME_PATTERN.test("-dash"));
});

/* -- 5) 화면 소스 계약 ---------------------------------------------------- */

const files = readdirSync(skillsDir).filter((file) => /\.(tsx?)$/.test(file));
const sources = new Map(files.map((file) => [file, readFileSync(path.join(skillsDir, file), "utf8")]));

check("저장에 성공하면 더 이상 새 도구가 아니다", () => {
  const store = sources.get("skill-store.ts");
  assert.ok(store.includes("isNew: false } : prev.editor"), "저장 성공 시 isNew 를 내린다");
});

check("늦게 온 조회 응답이 편집기를 덮어쓰지 않는다", () => {
  const store = sources.get("skill-store.ts");
  assert.ok(store.includes("pendingGetId"), "기다리는 조회를 구분한다");
  assert.ok(store.includes("requestId !== state.pendingGetId"), "다른 응답을 걸러 낸다");
});

check("실패 응답이 목록을 지우지 않는다", () => {
  const store = sources.get("skill-store.ts");
  assert.ok(store.includes("shouldReplaceList"), "목록 교체 규칙을 쓴다");
});

check("두 칸 배치를 쓰지 않는다", () => {
  const page = sources.get("SkillsPage.tsx");
  assert.ok(!page.includes("ResponsivePanels"), "목록과 편집기를 동시에 띄우지 않는다");
  assert.ok(!page.includes("CardBoundary"), "이전 카드 묶음을 쓰지 않는다");
  assert.ok(page.includes("ScreenTabs"), "캡슐 탭으로 범위를 나눈다");
  assert.ok(!page.includes("h-[calc(100vh"), "화면 높이를 고정하지 않는다");
});

check("못 누르는 이유를 화면에 적는다", () => {
  const page = sources.get("SkillsPage.tsx");
  assert.ok(page.includes("describeSaveBlock"), "막힘 사유를 계산한다");
  assert.ok(page.includes("{blocked}"), "사유를 그린다");
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  const source = sources.get("skills-model.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "skills-model 에 의존이 있다");
});

check("덮어쓰기 허용 값이 서버 파서까지 전달된다", () => {
  // 이 값을 파서가 읽지 않으면 dispatcher 의 `SkillAllowOverwrite == true` 가 늘 거짓이 되어
  // 이미 있는 도구를 영영 고칠 수 없다. 실제 앱에서 재현하고 고쳤다.
  const parser = readFileSync(path.join(repoRoot, "apps/omnux-middleware/src/WebSocketGateway.cs"), "utf8");
  assert.ok(parser.includes('TryGetProperty("skillAllowOverwrite"'), "파서가 값을 읽는다");
  assert.ok(parser.includes("SkillAllowOverwrite = skillAllowOverwrite"), "읽은 값을 메시지에 담는다");
  const dispatcher = readFileSync(
    path.join(repoRoot, "apps/omnux-middleware/src/WsContextCommandDispatcher.cs"),
    "utf8"
  );
  assert.ok(dispatcher.includes("message.SkillAllowOverwrite == true"), "dispatcher 가 그 값을 쓴다");
});

check("도구 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("SkillsPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"skills"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
