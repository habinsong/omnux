import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPolicy,
  categoryMeta,
  describeChain,
  dirtyKeys,
  formatChain,
  formatDecisionTime,
  isDirty,
  localCheckLabel,
  mergeServerChains,
  overrideCount,
  parseChain
} from "../apps/desktop/src/features/routing/routing-model.ts";

/**
 * 라우팅 화면의 순수 모델을 실제로 실행해 확인한다.
 * 핵심은 하나다: **저장하지 않은 편집을 서버 응답이 덮어쓰지 않는다.**
 * 이전 화면은 조회 응답이 올 때마다 편집을 통째로 서버 값으로 바꿨고,
 * 실제 앱에서 입력 뒤 새로고침만 눌러도 값이 사라지는 것을 확인했다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routingDir = path.join(repoRoot, "apps/desktop/src/features/routing");
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

/* -- 1) 편집 보존 --------------------------------------------------------- */

check("서버 응답이 저장하지 않은 편집을 지우지 않는다", () => {
  const previousEffective = { generalChat: ["groq", "gemini"], planner: ["codex"] };
  const previousDraft = { generalChat: "grok, groq", planner: "codex" };
  const nextEffective = { generalChat: ["groq", "gemini"], planner: ["codex", "groq"] };

  const merged = mergeServerChains(previousDraft, previousEffective, nextEffective);
  // 손댄 항목은 그대로 남는다.
  assert.equal(merged.generalChat, "grok, groq");
  // 손대지 않은 항목은 새 서버 값으로 맞춘다.
  assert.equal(merged.planner, "codex, groq");
});

check("서버가 더 이상 주지 않는 키라도 편집 중이면 잃지 않는다", () => {
  const merged = mergeServerChains(
    { removed: "grok", kept: "codex" },
    { removed: ["groq"], kept: ["codex"] },
    { kept: ["codex"] }
  );
  assert.equal(merged.removed, "grok");
  assert.equal(merged.kept, "codex");
});

check("손대지 않은 키는 새 값으로 갱신된다", () => {
  const merged = mergeServerChains({ a: "groq" }, { a: ["groq"] }, { a: ["gemini"] });
  assert.equal(merged.a, "gemini");
});

check("공백과 표기 차이는 편집으로 보지 않는다", () => {
  assert.equal(isDirty("groq,  gemini ", ["groq", "gemini"]), false);
  assert.equal(isDirty("groq, gemini", ["gemini", "groq"]), true);
  const merged = mergeServerChains({ a: " groq , gemini " }, { a: ["groq", "gemini"] }, { a: ["codex"] });
  assert.equal(merged.a, "codex");
});

check("저장하지 않은 항목을 셀 수 있다", () => {
  const draft = { a: "grok", b: "codex", c: "groq, gemini" };
  const effective = { a: ["groq"], b: ["codex"], c: ["groq", "gemini"] };
  assert.deepEqual(dirtyKeys(draft, effective), ["a"]);
  assert.deepEqual(dirtyKeys({}, {}), []);
});

/* -- 2) 값 다루기 --------------------------------------------------------- */

check("쉼표 목록을 안전하게 나눈다", () => {
  assert.deepEqual(parseChain(" groq , , gemini "), ["groq", "gemini"]);
  assert.deepEqual(parseChain(""), []);
  assert.equal(formatChain(undefined), "");
  assert.equal(formatChain(["a", "b"]), "a, b");
});

check("저장 정책은 편집한 모든 키를 담는다", () => {
  const policy = buildPolicy({ a: "groq, gemini", b: "" });
  assert.deepEqual(policy, { a: ["groq", "gemini"], b: [] });
});

check("직접 지정한 항목 수를 센다", () => {
  assert.equal(overrideCount({ a: ["groq"], b: [], c: ["x", "y"] }), 2);
  assert.equal(overrideCount({}), 0);
});

check("접힌 줄에 실제 경로를 적는다", () => {
  assert.equal(describeChain(["groq", "gemini"], true), "groq, gemini");
  assert.equal(describeChain([], false), "기본값");
  assert.equal(describeChain([], true), "빈 경로(기본값 사용)");
});

check("모르는 작업 종류는 키를 그대로 보여준다", () => {
  assert.equal(categoryMeta("generalChat").label, "일반 대화");
  const unknown = categoryMeta("myOwnCategory");
  assert.equal(unknown.label, "myOwnCategory");
  assert.ok(unknown.hint.length > 0);
});

check("해석하지 못한 시각은 원문을 남긴다", () => {
  assert.equal(formatDecisionTime("not-a-date"), "not-a-date");
  assert.equal(formatDecisionTime(""), "-");
});

check("모르는 점검 이름은 원문 그대로", () => {
  assert.equal(localCheckLabel("local_models"), "로컬 모델");
  assert.equal(localCheckLabel("new_check"), "new_check");
});

/* -- 3) 화면 소스 계약 ---------------------------------------------------- */

const routingFiles = readdirSync(routingDir).filter((file) => /\.(tsx?)$/.test(file));
const routingSources = new Map(
  routingFiles.map((file) => [file, readFileSync(path.join(routingDir, file), "utf8")])
);

check("서버 응답이 편집을 통째로 갈아엎지 않는다", () => {
  const store = routingSources.get("routing-store.ts");
  assert.ok(store.includes("mergeServerChains"), "병합 규칙을 쓴다");
  assert.ok(
    !/draftChains: Object\.keys\(draft\)\.length > 0 \? draft : prev\.draftChains/.test(store),
    "이전의 통째 교체가 남아 있다"
  );
});

check("편집을 버리는 것은 사용자가 누를 때만이다", () => {
  const store = routingSources.get("routing-store.ts");
  assert.ok(store.includes("discardDraft"), "편집 버리기 동작이 있다");
  const page = routingSources.get("RoutingPolicyPage.tsx");
  assert.ok(page.includes("변경 버리기"), "화면에 버튼이 있다");
  assert.ok(page.includes("저장하지 않은 변경"), "저장 안 한 변경을 접히지 않는 자리에 알린다");
});

check("저장은 바뀐 것이 있을 때만 눌린다", () => {
  const page = routingSources.get("RoutingPolicyPage.tsx");
  assert.ok(page.includes("unsaved.length === 0"), "변경이 없으면 저장을 막는다");
});

check("입력칸 열두 개를 한 번에 펼치지 않는다", () => {
  const page = routingSources.get("RoutingPolicyPage.tsx");
  assert.ok(page.includes("<Accordion"), "접이식 목록을 쓴다");
  assert.ok(!page.includes("CardBoundary"), "이전 카드 묶음을 쓰지 않는다");
});

check("상태 색을 이 화면에서 새로 만들지 않는다", () => {
  for (const [file, source] of routingSources) {
    assert.ok(!/function statusTone\s*\(/.test(source), `${file} 이 상태 색 판정을 따로 갖고 있다`);
    assert.ok(!/function statusLabel\s*\(/.test(source), `${file} 이 상태 이름을 따로 갖고 있다`);
  }
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  const source = routingSources.get("routing-model.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "routing-model 에 의존이 있다");
});

check("라우팅 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("RoutingPolicyPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"routing"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
