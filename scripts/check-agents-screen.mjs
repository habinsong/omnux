import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_SECTIONS,
  AGENT_SLICE_IDS,
  agentRequestId,
  agentSliceForMessage,
  agentSliceForRequestId,
  countFailedAgentSlices,
  createAgentSliceMap,
  describeAgentSlice,
  describeWriteBlock,
  markAgentFailed,
  markAgentLoading,
  markAgentReady
} from "../apps/desktop/src/features/agents/agents-sections.ts";

import { statusLabel, statusTone } from "../apps/desktop/src/components/ui/status-tone.ts";

/**
 * 에이전트 화면의 순수 모델을 실제로 실행해 확인한다.
 * 이전 화면은 조회4개를 `&&` 로 이어 붙이고 하나의 loading 을 공유했으며,
 * 그 loading 이 **버스 응답에서만** 풀렸다. 버스 조회가 실패하면 화면이 영원히 "조회 중"이었다.
 * 상태 색도 자체 판정이라 `warning` 조차 중립으로 떨어졌다.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = path.join(repoRoot, "apps/desktop/src/features/agents");
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

/* -- 1) 조회 단위 --------------------------------------------------------- */

check("네 조회가 각각 자기 상태를 갖는다", () => {
  let map = createAgentSliceMap();
  assert.equal(Object.keys(map).length, 4);
  map = markAgentFailed(map, "bus", "버스 실패");
  map = markAgentReady(map, "watchdog", "2026-09-09T00:00:00.000Z");
  assert.equal(map.bus.status, "failed");
  assert.equal(map.watchdog.status, "ready");
  // 버스가 실패해도 나머지는 자기 상태를 유지한다.
  assert.equal(map.worktree.status, "idle");
  assert.equal(map.trace.status, "idle");
});

check("실패해도 이전 결과 시각을 잃지 않는다", () => {
  let map = createAgentSliceMap();
  map = markAgentReady(map, "trace", "2026-09-09T01:00:00.000Z");
  map = markAgentLoading(map, "trace");
  map = markAgentFailed(map, "trace", "");
  assert.equal(map.trace.updatedAt, "2026-09-09T01:00:00.000Z");
  assert.ok(map.trace.error.length > 0, "사유가 비면 기본 문구를 쓴다");
});

check("응답 종류가 구역과 정확히 이어진다", () => {
  assert.equal(agentSliceForMessage("agent_bus_snapshot"), "bus");
  assert.equal(agentSliceForMessage("agent_watchdog_snapshot"), "watchdog");
  assert.equal(agentSliceForMessage("agent_worktree_snapshot"), "worktree");
  assert.equal(agentSliceForMessage("multi_agent_trace_snapshot"), "trace");
  assert.equal(agentSliceForMessage("무관한_응답"), null);
});

check("요청 ID 로 실패한 구역을 되짚을 수 있다", () => {
  for (const id of AGENT_SLICE_IDS) {
    assert.equal(agentSliceForRequestId(agentRequestId(id)), id);
  }
  assert.equal(agentSliceForRequestId("other-bus"), null);
  assert.equal(agentSliceForRequestId("agents-없는구역"), null);
});

check("조회 상태 문구가 네 상태를 구분한다", () => {
  const labels = ["idle", "loading", "ready", "failed"].map((status) =>
    describeAgentSlice({ status, error: "", updatedAt: "" })
  );
  assert.equal(new Set(labels).size, 4);
});

check("실패한 구역 수를 센다", () => {
  let map = createAgentSliceMap();
  map = markAgentFailed(map, "bus", "x");
  map = markAgentFailed(map, "worktree", "y");
  assert.equal(countFailedAgentSlices(map), 2);
});

check("구역 정의에 빠짐이 없다", () => {
  assert.equal(AGENT_SECTIONS.length, AGENT_SLICE_IDS.length);
  for (const section of AGENT_SECTIONS) {
    assert.ok(AGENT_SLICE_IDS.includes(section.id), section.id);
    assert.ok(section.label.length > 0, section.id);
    assert.ok(section.description.length > 0, section.id);
  }
});

/* -- 2) 쓰기 막힘 사유 ---------------------------------------------------- */

function draft(patch = {}) {
  return {
    messageFrom: "human",
    messageBody: "본문",
    boardAgentId: "human",
    boardKey: "progress",
    boardValue: "값",
    lifecycleAgentId: "human",
    lifecycleState: "running",
    commandFrom: "human",
    command: "stop",
    commandGroupId: "g1",
    commandRunId: "",
    ...patch
  };
}

check("모두 채우면 막지 않는다", () => {
  for (const kind of ["message", "board", "lifecycle", "command"]) {
    assert.equal(describeWriteBlock(kind, draft()), "", kind);
  }
});

check("빠진 입력마다 다른 사유를 돌려준다", () => {
  assert.ok(describeWriteBlock("message", draft({ messageFrom: " " })).includes("보낸 쪽"));
  assert.ok(describeWriteBlock("message", draft({ messageBody: "" })).includes("메시지 내용"));
  assert.ok(describeWriteBlock("board", draft({ boardKey: "" })).includes("항목 이름"));
  assert.ok(describeWriteBlock("lifecycle", draft({ lifecycleState: "" })).includes("상태"));
});

check("그룹 명령은 그룹이나 실행 ID 중 하나면 된다", () => {
  assert.equal(describeWriteBlock("command", draft({ commandGroupId: "", commandRunId: "r1" })), "");
  assert.ok(
    describeWriteBlock("command", draft({ commandGroupId: "", commandRunId: "" })).includes("그룹 ID")
  );
});

/* -- 3) 상태 색 ----------------------------------------------------------- */

check("작업자 상태 값이 공용 표에 있다", () => {
  // 이전 화면의 자체 판정은 `warning` 조차 중립으로 떨어뜨렸고 `blocked` 도 중립이었다.
  assert.equal(statusTone("warning"), "warning");
  assert.equal(statusTone("blocked"), "destructive");
  assert.equal(statusTone("attention_required"), "warning");
  assert.equal(statusTone("heartbeat_stale"), "warning");
  assert.equal(statusTone("timeout_due"), "warning");
  assert.equal(statusTone("monitoring"), "primary");
  assert.equal(statusTone("killed"), "destructive");
  assert.notEqual(statusTone("broken"), "success");
  assert.equal(statusLabel("attention_required"), "확인 필요");
});

/* -- 4) 화면 소스 계약 ---------------------------------------------------- */

const agentFiles = readdirSync(agentsDir).filter((file) => /\.(tsx?)$/.test(file));
const agentSources = new Map(agentFiles.map((file) => [file, readFileSync(path.join(agentsDir, file), "utf8")]));

check("이전 쓰기 패널 파일을 남겨두지 않는다", () => {
  assert.equal(existsSync(path.join(agentsDir, "AgentBusWritePanel.tsx")), false);
});

check("요청을 && 로 이어 붙이지 않는다", () => {
  const store = agentSources.get("agents-store.ts");
  assert.ok(
    !/requestDesktopAgents\.\w+\(\) &&/.test(store),
    "하나가 실패하면 나머지를 건너뛰는 연쇄가 남아 있다"
  );
  assert.ok(store.includes("slices:"), "구역별 상태가 있다");
  assert.ok(!/^\s*loading: boolean;/m.test(store), "공유 loading 이 남아 있다");
});

check("응답이 오지 않는 경우를 실패로 바꾼다", () => {
  const store = agentSources.get("agents-store.ts");
  assert.ok(store.includes("SLICE_TIMEOUT_MS"), "조회 기한이 있다");
  assert.ok(store.includes("markAgentFailed"), "기한을 넘기면 실패로 남긴다");
});

check("상태 색을 이 화면에서 새로 만들지 않는다", () => {
  for (const [file, source] of agentSources) {
    assert.ok(!/function healthTone\s*\(/.test(source), `${file} 이 상태 색 판정을 따로 갖고 있다`);
    assert.ok(!/function statusTone\s*\(/.test(source), `${file} 이 상태 색 판정을 따로 갖고 있다`);
  }
});

check("구역을 열 때만 조회한다", () => {
  const page = agentSources.get("AgentsPage.tsx");
  assert.ok(page.includes("requested.current"), "이미 조회한 구역을 다시 부르지 않는다");
  assert.ok(!page.includes("store.loadAll()"), "화면에 들어오자마자 전부 부르지 않는다");
});

check("쓰기 버튼은 못 누르는 이유를 적는다", () => {
  const page = agentSources.get("AgentsPage.tsx");
  assert.ok(page.includes("describeWriteBlock"), "막힘 사유를 계산한다");
  assert.ok(page.includes("{blocked}"), "사유를 화면에 그린다");
});

check("순수 모델은 화면·저장소에 기대지 않는다", () => {
  const source = agentSources.get("agents-sections.ts");
  assert.ok(!source.includes('from "react"'));
  assert.ok(!source.includes("zustand"));
  const valueImports = [...source.matchAll(/^import (?!type )[^\n]*from "([^"]+)"/gm)].map((m) => m[1]);
  for (const specifier of valueImports) {
    assert.equal(specifier, "../middleware/slice-state.ts", `agents-sections 가 ${specifier} 를 가져온다`);
  }
});

check("에이전트 화면이 앱과 사이드 탭에 연결돼 있다", () => {
  const app = readFileSync(path.join(repoRoot, "apps/desktop/src/App.tsx"), "utf8");
  assert.ok(app.includes("AgentsPage"));
  const navAreas = readFileSync(path.join(repoRoot, "apps/desktop/src/features/shell/nav-areas.ts"), "utf8");
  assert.ok(navAreas.includes('"agents"'));
});

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
