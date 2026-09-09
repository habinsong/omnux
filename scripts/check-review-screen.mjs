import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REQUEST_LABELS,
  REQUEST_TIMEOUT_MS,
  buildRequestId,
  defaultAnchorRange,
  describeBlocked,
  formatAnchorContent,
  isPreviewForAnotherFile,
  replacementForRequest,
  requestKindOf,
  selectAnchorRange
} from "../apps/desktop/src/features/refactor/refactor-model.ts";

/**
 * 리뷰(Safe Refactor) 화면의 순수 모델을 실제로 실행해 확인한다.
 * 이 화면은 파일을 실제로 바꾼다. 실제 앱에서 확인한 문제:
 *   - 요청을 보내고 화면을 떠났다 돌아오면 모든 버튼이 영원히 비활성이었다.
 *   - 새 미리보기가 실패해도 이전 previewId 가 남아 적용 버튼이 켜져 있었다.
 *   - 줄을 지울 수 없었다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const refactorDir = path.join(repoRoot, "apps/desktop/src/features/refactor");
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

function lines(count, from = 1) {
  return Array.from({ length: count }, (_, index) => ({
    lineNumber: from + index,
    hash: `h${from + index}`,
    content: `line ${from + index}`
  }));
}

function form(patch = {}) {
  return {
    path: "src/a.ts",
    anchorLines: lines(10),
    anchorStartLine: "1",
    anchorEndLine: "3",
    anchorReplacement: "새 코드",
    anchorDelete: false,
    pattern: "",
    replacement: "",
    symbol: "",
    newName: "",
    previewId: "",
    previewPath: "",
    ...patch
  };
}

/* -- 1) 줄 범위 확인 ------------------------------------------------------ */

check("읽은 줄과 정확히 맞을 때만 통과한다", () => {
  const ok = selectAnchorRange(lines(10), 2, 4);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.lines.map((line) => line.lineNumber), [2, 3, 4]);
});

check("빠진 줄이 있으면 보내지 않는다", () => {
  // 3번 줄이 없는 목록. 범위가 채워지지 않으므로 막아야 한다.
  const partial = [...lines(2), ...lines(2, 4)];
  const result = selectAnchorRange(partial, 1, 4);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("다시 읽으세요"));
});

check("잘못된 범위를 사유와 함께 막는다", () => {
  assert.equal(selectAnchorRange(lines(5), 0, 3).ok, false);
  assert.equal(selectAnchorRange(lines(5), 4, 2).ok, false);
  assert.equal(selectAnchorRange([], 1, 1).ok, false);
  assert.ok(selectAnchorRange([], 1, 1).reason.includes("먼저 파일을 읽으세요"));
});

/* -- 2) 줄 지우기 --------------------------------------------------------- */

check("지우기를 고르면 빈 교체도 통과한다", () => {
  // 이전 화면은 교체 코드가 비면 요청 자체를 막아 줄을 지울 수 없었다.
  assert.equal(describeBlocked("preview", form({ anchorDelete: true, anchorReplacement: "" })), "");
  assert.equal(replacementForRequest({ anchorDelete: true, anchorReplacement: "무시됨" }), "");
});

check("지우기를 고르지 않으면 빈 교체를 막는다", () => {
  const blocked = describeBlocked("preview", form({ anchorDelete: false, anchorReplacement: "" }));
  assert.ok(blocked.includes("지웁니다"), blocked);
  assert.equal(replacementForRequest({ anchorDelete: false, anchorReplacement: "코드" }), "코드");
});

/* -- 3) 적용 조건 --------------------------------------------------------- */

check("미리보기 없이 적용할 수 없다", () => {
  const blocked = describeBlocked("apply", form({ previewId: "" }));
  assert.ok(blocked.includes("먼저 미리보기"), blocked);
});

check("다른 파일의 미리보기는 적용하지 못한다", () => {
  const state = form({ previewId: "p1", previewPath: "src/other.ts", path: "src/a.ts" });
  assert.equal(isPreviewForAnotherFile(state), true);
  assert.ok(describeBlocked("apply", state).includes("다른 파일"));
});

check("같은 파일이면 상대·절대 경로가 달라도 받아들인다", () => {
  assert.equal(isPreviewForAnotherFile({ previewPath: "/w/src/a.ts", path: "src/a.ts" }), false);
  assert.equal(isPreviewForAnotherFile({ previewPath: "", path: "src/a.ts" }), false);
});

check("조건이 맞으면 적용을 막지 않는다", () => {
  assert.equal(describeBlocked("apply", form({ previewId: "p1", previewPath: "src/a.ts" })), "");
});

/* -- 4) 나머지 입력 ------------------------------------------------------- */

check("각 방식이 빠진 입력을 다르게 알린다", () => {
  assert.ok(describeBlocked("read", form({ path: " " })).includes("파일 경로"));
  assert.ok(describeBlocked("ast", form({ pattern: "" })).includes("패턴"));
  assert.ok(describeBlocked("rename", form({ symbol: "", newName: "b" })).includes("바꿀 이름"));
  assert.ok(describeBlocked("rename", form({ symbol: "a", newName: "" })).includes("새 이름"));
  assert.equal(describeBlocked("rename", form({ symbol: "a", newName: "b" })), "");
});

/* -- 5) 요청 식별과 기한 --------------------------------------------------- */

check("요청 ID 로 종류를 되짚을 수 있다", () => {
  for (const kind of ["read", "preview", "ast", "rename", "apply"]) {
    assert.equal(requestKindOf(buildRequestId(kind, 1)), kind);
  }
  assert.equal(requestKindOf("other-read-1"), null);
  assert.equal(requestKindOf("refactor-없는것-1"), null);
});

check("요청 ID 는 매번 다르다", () => {
  assert.notEqual(buildRequestId("read", 1), buildRequestId("read", 2));
});

check("응답 없이 잠기지 않게 기한이 있다", () => {
  assert.ok(REQUEST_TIMEOUT_MS > 0);
  for (const kind of ["read", "preview", "ast", "rename", "apply"]) {
    assert.ok(REQUEST_LABELS[kind].length > 0, kind);
  }
});

/* -- 6) 표시 ------------------------------------------------------------- */

check("읽은 본문에 줄 번호를 붙인다", () => {
  const text = formatAnchorContent(lines(2));
  assert.ok(text.includes("1"));
  assert.ok(text.includes("line 1"));
  assert.equal(text.split("\n").length, 2);
});

check("읽은 뒤 기본 줄 범위를 정한다", () => {
  assert.deepEqual(defaultAnchorRange(lines(10)), { start: "1", end: "5" });
  assert.deepEqual(defaultAnchorRange(lines(2)), { start: "1", end: "2" });
  assert.deepEqual(defaultAnchorRange([]), { start: "", end: "" });
});

/* -- 7) 화면 소스 계약 ---------------------------------------------------- */

const refactorFiles = readdirSync(refactorDir).filter((file) => /\.(tsx?)$/.test(file));
const sources = new Map(refactorFiles.map((file) => [file, readFileSync(path.join(refactorDir, file), "utf8")]));

check("응답이 안 와도 화면이 잠기지 않는다", () => {
  const store = sources.get("refactor-store.ts");
  assert.ok(store.includes("REQUEST_TIMEOUT_MS"), "기한이 있다");
  assert.ok(store.includes("pendingTimer"), "모듈 수준 기한이라 화면을 떠나도 돈다");
  assert.ok(store.includes("pendingRequestId"), "기다리는 요청을 구분한다");
});

check("다른 요청의 응답을 받아들이지 않는다", () => {
  const store = sources.get("refactor-store.ts");
  assert.ok(
    store.includes("requestId !== state.pendingRequestId"),
    "기다리는 요청의 응답만 반영한다"
  );
});

check("실패한 미리보기에 적용 버튼이 남지 않는다", () => {
  const store = sources.get("refactor-store.ts");
  assert.ok(store.includes("previewId: preview && ok ?"), "성공했을 때만 previewId 를 남긴다");
  assert.ok(!/previewId: preview \? s\(preview\.previewId\) : action === "apply"/.test(store), "이전 유지 경로가 남아 있다");
});

check("세 방식을 한 번에 펼치지 않는다", () => {
  const page = sources.get("RefactorPage.tsx");
  assert.ok(page.includes("<Accordion"), "접이식으로 고른다");
  assert.ok(page.includes("single"), "한 번에 하나만 연다");
  assert.ok(!page.includes("CardBoundary"), "이전 카드 묶음을 쓰지 않는다");
});

check("못 누르는 이유를 화면에 적는다", () => {
  const page = sources.get("RefactorPage.tsx");
  assert.ok(page.includes("describeBlocked"), "막힘 사유를 계산한다");
  assert.ok(page.includes("{blocked}"), "사유를 그린다");
  assert.ok(page.includes("{applyBlocked ||"), "적용도 사유를 그린다");
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  const source = sources.get("refactor-model.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  assert.ok(!/^import /m.test(source), "refactor-model 에 의존이 있다");
});

check("리뷰 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("RefactorPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"refactor"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
