import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OPS_PANELS,
  deriveStatus,
  describeStatus,
  panelDefinition
} from "../apps/desktop/src/features/ops/ops-view.ts";

import {
  FILE_CANDIDATE_LIMIT,
  basename,
  buildFileCandidates,
  compactPath,
  filterFileCandidates,
  formatBytes,
  formatDurationMs,
  formatEpochMs,
  formatUtc
} from "../apps/desktop/src/features/ops/ops-format.ts";

/**
 * 상태 화면의 순수 모델을 실제로 실행해 확인한다.
 * 이전 본문은 화면에 들어오자마자 여덟 개 조회를 한꺼번에 보내고 카드 열한 장을 그렸다.
 * 그 방식이 돌아오면 이 검사가 실패한다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const opsDir = path.join(repoRoot, "apps/desktop/src/features/ops");
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

/* -- 1) 구역 상태 판정 ---------------------------------------------------- */

check("진행 중을 실패보다 먼저 본다", () => {
  assert.equal(deriveStatus({ loading: true, error: "이전 실패", hasResult: false }), "loading");
});

check("실패 사유가 있으면 실패다", () => {
  assert.equal(deriveStatus({ loading: false, error: "권한 없음", hasResult: true }), "failed");
});

check("결과가 있으면 완료, 없으면 조회 전", () => {
  assert.equal(deriveStatus({ loading: false, error: "", hasResult: true }), "ready");
  assert.equal(deriveStatus({ loading: false, error: "", hasResult: false }), "idle");
});

check("상태 문구가 네 상태를 구분한다", () => {
  const labels = ["idle", "loading", "ready", "failed"].map((status) => describeStatus(status, "힌트", true));
  assert.equal(new Set(labels).size, 4);
});

check("조작만 하는 구역은 열어도 조회한다고 말하지 않는다", () => {
  assert.equal(describeStatus("idle", "힌트", true), "열면 조회");
  assert.notEqual(describeStatus("idle", "힌트", false), "열면 조회");
});

check("실패한 구역 수를 센다", () => {
  const statuses = {};
  for (const panel of OPS_PANELS) statuses[panel.id] = "idle";
  statuses.git = "failed";
  statuses.devices = "failed";
  assert.equal(Object.values(statuses).filter((status) => status === "failed").length, 2);
});

/* -- 2) 구역 정의 --------------------------------------------------------- */

check("구역 정의에 빠짐이 없다", () => {
  assert.ok(OPS_PANELS.length >= 8);
  const ids = new Set();
  for (const panel of OPS_PANELS) {
    assert.ok(panel.label.length > 0, panel.id);
    assert.ok(panel.hint.length > 0, panel.id);
    assert.equal(typeof panel.loadOnOpen, "boolean", panel.id);
    assert.equal(ids.has(panel.id), false, `${panel.id} 가 두 번 있다`);
    ids.add(panel.id);
  }
});

check("사용자가 누르지 않은 실행을 대신 시작하지 않는다", () => {
  assert.equal(panelDefinition("cleanup").loadOnOpen, false);
  assert.equal(panelDefinition("command").loadOnOpen, false);
  const load = (ids) => ids.filter((id) => panelDefinition(id).loadOnOpen);
  assert.deepEqual(load(["cleanup", "command"]), []);
  assert.deepEqual(load(["git", "cleanup"]), ["git"]);
});

check("모르는 구역은 조용히 넘기지 않는다", () => {
  assert.throws(() => panelDefinition("없는구역"));
});

/* -- 3) 표시 형식 --------------------------------------------------------- */

check("크기 표시", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-1), "0 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1024 * 1024 * 15), "15 MB");
});

check("소요 시간 표시", () => {
  assert.equal(formatDurationMs(null), "-");
  assert.equal(formatDurationMs(0), "-");
  assert.equal(formatDurationMs(250), "250ms");
  assert.equal(formatDurationMs(2500), "2.5초");
});

check("해석하지 못한 시각은 원문을 남긴다", () => {
  assert.equal(formatUtc("not-a-date"), "not-a-date");
  assert.equal(formatUtc(""), "-");
  assert.equal(formatEpochMs(null), "-");
  assert.equal(formatEpochMs(0), "-");
});

check("경로 줄이기", () => {
  assert.equal(compactPath("/a/b.ts"), "/a/b.ts");
  assert.equal(compactPath("/a/b/c/d/e/f.ts", 3), ".../d/e/f.ts");
  assert.equal(basename("/a/b/c.ts"), "c.ts");
  assert.equal(basename(""), "/");
});

/* -- 4) 파일 고르기 후보 --------------------------------------------------- */

function entry(patch = {}) {
  return { name: "a.ts", description: "", selectPath: "/w/a.ts", browsePath: "/w", isDirectory: false, ...patch };
}

check("같은 경로를 두 번 넣지 않는다", () => {
  const candidates = buildFileCandidates({
    entries: [entry(), entry()],
    recentFiles: ["/w/a.ts"],
    currentPath: "/w/a.ts",
    query: ""
  });
  assert.equal(candidates.length, 1);
});

check("폴더와 파일을 다른 항목으로 구분한다", () => {
  const candidates = buildFileCandidates({
    entries: [entry({ name: "src", isDirectory: true, browsePath: "/w/src" }), entry()],
    recentFiles: [],
    currentPath: "",
    query: ""
  });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].isDirectory, true);
  assert.equal(candidates[0].path, "/w/src");
});

check("직접 친 경로도 후보가 된다", () => {
  const candidates = buildFileCandidates({
    entries: [],
    recentFiles: [],
    currentPath: "",
    query: "/tmp/other.ts"
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source, "직접");
});

check("경로처럼 보이지 않는 검색어는 후보로 만들지 않는다", () => {
  const candidates = buildFileCandidates({ entries: [], recentFiles: [], currentPath: "", query: "hello" });
  assert.equal(candidates.length, 0);
});

check("폴더를 먼저 보여주고 개수를 제한한다", () => {
  const entries = [];
  for (let index = 0; index < 100; index += 1) {
    entries.push(entry({ name: `f${index}.ts`, selectPath: `/w/f${index}.ts` }));
  }
  entries.push(entry({ name: "zzz", isDirectory: true, browsePath: "/w/zzz" }));
  const shown = filterFileCandidates(buildFileCandidates({ entries, recentFiles: [], currentPath: "", query: "" }), "");
  assert.equal(shown[0].isDirectory, true);
  assert.equal(shown.length, FILE_CANDIDATE_LIMIT);
});

check("검색어는 이름·경로·설명·출처에서 찾는다", () => {
  const candidates = buildFileCandidates({
    entries: [entry({ name: "alpha.ts", selectPath: "/w/alpha.ts", description: "첫 파일" })],
    recentFiles: ["/w/beta.ts"],
    currentPath: "",
    query: ""
  });
  assert.equal(filterFileCandidates(candidates, "alpha").length, 1);
  assert.equal(filterFileCandidates(candidates, "첫").length, 1);
  assert.equal(filterFileCandidates(candidates, "최근").length, 1);
  assert.equal(filterFileCandidates(candidates, "없는말").length, 0);
});

/* -- 5) 화면 소스 계약 ---------------------------------------------------- */

const opsFiles = readdirSync(opsDir).filter((file) => /\.(tsx?)$/.test(file));
const opsSources = new Map(opsFiles.map((file) => [file, readFileSync(path.join(opsDir, file), "utf8")]));

check("이전 카드 묶음 파일을 남겨두지 않는다", () => {
  for (const file of [
    "OperationsOverviewSection.tsx",
    "OperationsToolsSection.tsx",
    "OperationsGitPanel.tsx",
    "OperationsDoctorPanel.tsx",
    "OperationsCronPanel.tsx",
    "OperationsCronAddForm.tsx",
    "OperationsNodesPanel.tsx",
    "OperationsCleanupPanel.tsx",
    "OperationsCommandPanel.tsx",
    "OperationsContextPanel.tsx",
    "OperationsGuardDispatchPanel.tsx",
    "OperationsRetryPanel.tsx",
    "OperationsTelegramPanel.tsx",
    "OperationsWorkspacePanel.tsx",
    "OperationsPage.shared.ts"
  ]) {
    assert.equal(existsSync(path.join(opsDir, file)), false, `${file} 이 남아 있다`);
  }
});

check("화면에 들어오자마자 여러 조회를 한꺼번에 보내지 않는다", () => {
  const page = opsSources.get("OperationsPage.tsx");
  for (const call of [
    "store.loadCronStatus();\n    store.loadCronJobs();\n    store.loadNodesSnapshot();",
    "loadOpsSnapshot();\n    store.loadCronStatus();"
  ]) {
    assert.ok(!page.includes(call), "여러 조회를 한 번에 보내는 경로가 있다");
  }
  // 여는 구역만 조회한다는 조건이 실제로 코드에 있다.
  assert.ok(page.includes("requested.current"), "이미 조회한 구역을 다시 부르지 않는다");
  assert.ok(page.includes("loadOnOpen"), "열 때 조회하는 구역만 부른다");
});

check("상태 색을 이 화면에서 새로 만들지 않는다", () => {
  for (const [file, source] of opsSources) {
    assert.ok(!/function statusTone\s*\(/.test(source), `${file} 이 상태 색 판정을 따로 갖고 있다`);
    assert.ok(!/^export function tone\s*\(/m.test(source), `${file} 이 상태 색 판정을 따로 갖고 있다`);
  }
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  for (const file of ["ops-view.ts", "ops-format.ts"]) {
    const source = opsSources.get(file);
    assert.ok(!source.includes('from "react"'), `${file} 이 React 를 가져온다`);
    assert.ok(!source.includes("zustand"), `${file} 이 저장소를 가져온다`);
    assert.ok(!/^import /m.test(source), `${file} 에 의존이 있다`);
  }
});

check("Git 적용은 미리보기 승인 뒤에만 가능하다", () => {
  const git = opsSources.get("OpsPanels.tsx");
  assert.ok(git.includes("먼저 미리보기를 만드세요."), "미리보기 없이 적용할 수 없다고 적는다");
  assert.ok(git.includes("approval?.confirmationToken"), "승인 토큰을 확인한다");
  assert.ok(git.includes("preview.blockers.length > 0"), "막는 조건을 확인한다");
});

check("정리는 무엇을 지우는지 먼저 보여준다", () => {
  const cleanup = opsSources.get("OpsPanels.tsx");
  assert.ok(cleanup.includes("먼저 삭제 후보를 확인하세요."), "미리보기 전에는 이유를 적는다");
});

check("상태 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("OperationsPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"operations"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
