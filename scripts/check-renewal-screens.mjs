import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (...parts) => path.join(root, "apps/desktop/src", ...parts);
const read = (file) => readFileSync(file, "utf8");

const app = read(src("App.tsx"));
const nav = read(src("features/shell/nav-areas.ts"));
const home = read(src("features/home/HomePage.tsx"));
const rail = read(src("features/shell/DesktopRail.tsx"));
const fixed = read(src("components/screen/fixed-screens.ts"));

assert.ok(app.includes("<HomePage"), "홈을 제거하지 않는다");
assert.ok(app.includes("DesktopRail"), "좌측 레일을 제거하지 않는다");
assert.ok(nav.includes('"home"') && nav.includes('"ask"') && nav.includes('"build"'));
assert.ok(home.includes("HeroComposer") || home.includes("좋은 아침"));
assert.ok(rail.includes("NAV_AREAS") || rail.includes("onSelectArea"));

const gone = [
  "features/ask/AskPage.tsx",
  "features/build/BuildPage.tsx",
  "features/automate/AutomatePage.tsx",
  "features/planning/PlanningPage.tsx",
  "features/explore/ExplorePage.tsx"
];
for (const file of gone) {
  assert.equal(existsSync(src(file)), false, `${file} 이전 페이지가 남아 있다`);
}

const pages = [
  ["ask", "features/chat-workspace/ChatWorkspacePage.tsx", ["ScreenTabs", "ChatTranscript", "ChatComposer", "surface=\"chat\"", "chat-request"]],
  ["build", "features/build-workspace/BuildWorkspacePage.tsx", ["ScreenTabs", "BuildComposer", "surface=\"build-workspace\""]],
  ["automate", "features/automation-workspace/AutomationWorkspacePage.tsx", ["Screen"]],
  ["explore", "features/explore-workspace/ExploreWorkspacePage.tsx", ["Screen"]],
  ["insights", "features/insights/InsightsPage.tsx", ["ScreenTabs", "ScreenPanels"]],
  ["activity", "features/activity/ActivityPage.tsx", ["ScreenTabs"]],
  ["operations", "features/ops/OperationsPage.tsx", ["ScreenTabs", "ScreenPanels"]],
  ["agents", "features/agents/AgentsPage.tsx", ["ScreenTabs"]],
  ["skills", "features/skills/SkillsPage.tsx", ["ScreenTabs"]],
  ["routing", "features/routing/RoutingPolicyPage.tsx", ["ScreenTabs"]],
  ["refactor", "features/refactor/RefactorPage.tsx", ["ScreenTabs"]],
  ["settings", "features/settings/SettingsPage.tsx", ["ScreenTabs"]]
];

for (const [id, file, needles] of pages) {
  const source = read(src(file));
  assert.ok(fixed.includes(`"${id}"`) || fixed.includes(`'${id}'`), `${id} 가 고정 화면이 아니다`);
  assert.ok(!source.includes("WorkbenchPage"), `${id} 가 WorkbenchPage 를 쓴다`);
  assert.ok(!source.includes("CardBoundary"), `${id} 가 CardBoundary 를 쓴다`);
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${id} 에 ${needle} 가 없다`);
  }
}

assert.match(app, /id:\s*"ask"[^\n]+<ChatWorkspacePage/);
assert.match(app, /id:\s*"build"[^\n]+<BuildWorkspacePage/);
assert.ok(read(src("features/settings/LlmModelsPanel.tsx")).includes("GrokConnectionPanel"));
assert.equal(existsSync(src("features/settings/GrokConnectionPanel.tsx")), true);

console.log("[check-renewal-screens] ok");
