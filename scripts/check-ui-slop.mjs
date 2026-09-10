import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "apps/desktop/src");

const GRADIENT = /from-violet|from-purple|to-cyan|to-indigo|#6D5EF7|#667eea|#764ba2|#38BDF8|#A855F7|#6366f1|#fee500|#ead400|bg-clip-text/;
const SCALE = /hover:scale|focus-within:scale|active:scale|scale-\[1/;
const GLASS = /backdrop-blur|lg-edge|shadow-xl|shadow-2xl|bg-card\/60/;
const CAPS = /uppercase tracking/;
const MARKETING = /\b(streamline|empower|supercharge|robust|leverage)\b/i;
const FILLER = /혁신적|강력한 기능|차세대|손쉽게|Provider API keys|Provider priority/;
const CONTRAST = /가 아니라 .+(입니다|한다)/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts|css)$/.test(name.name)) acc.push(full);
  }
  return acc;
}

const files = walk(srcRoot);
const hits = [];
for (const file of files) {
  const rel = path.relative(root, file);
  const source = readFileSync(file, "utf8");
  const checks = [
    ["gradient/glow", GRADIENT],
    ["scale", SCALE],
    ["glass", GLASS],
    ["caps-tracking", CAPS],
    ["marketing-en", MARKETING],
    ["filler", FILLER]
  ];
  for (const [kind, pattern] of checks) {
    const match = source.match(pattern);
    if (match) hits.push({ file: rel, kind, sample: match[0] });
  }
  if (CONTRAST.test(source) && !rel.includes("status-tone.ts") && !rel.includes("composer-intent.ts")) {
    const match = source.match(CONTRAST);
    hits.push({ file: rel, kind: "contrast-pair", sample: match[0] });
  }
}

assert.equal(hits.length, 0, `AI-slop tells:\n${hits.map((hit) => `${hit.file} ${hit.kind} ${hit.sample}`).join("\n")}`);

const home = readFileSync(path.join(srcRoot, "features/home/HomePage.tsx"), "utf8");
assert.ok(!home.includes("habinsong"), "홈 인사에 계정 이름을 박지 않는다");
assert.ok(!home.includes("#6D5EF7"), "홈 퀵액션에 보라 악센트를 쓰지 않는다");
assert.ok(!home.includes("hover:scale"), "홈 퀵액션에 hover scale을 쓰지 않는다");

const keys = readFileSync(path.join(srcRoot, "features/settings/LlmModelsPanel.tsx"), "utf8");
assert.ok(!keys.includes("Provider API keys"));
const priority = readFileSync(path.join(srcRoot, "features/settings/SettingsCards.tsx"), "utf8");
assert.ok(!priority.includes("provider chain"));
assert.ok(!priority.includes("Provider priority"));

const css = readFileSync(path.join(srcRoot, "App.css"), "utf8");
assert.ok(!css.includes('"Inter"') && !css.includes("'Inter'"), "기본 글꼴로 Inter를 쓰지 않는다");
assert.ok(!css.includes("#6366f1"), "기본 primary로 indigo를 쓰지 않는다");
const primitives = readFileSync(path.join(srcRoot, "components/ui/primitives.tsx"), "utf8");
assert.ok(!primitives.includes("backdrop-blur"), "Card 기본에 글래스를 쓰지 않는다");
assert.ok(!primitives.includes("lg-edge"), "Card 기본에 엣지 라이팅을 쓰지 않는다");

const topbar = readFileSync(path.join(srcRoot, "features/shell/DesktopTopBar.tsx"), "utf8");
assert.ok(topbar.includes("data-topbar-search"));
assert.ok(topbar.includes("flex-1"));
assert.ok(!topbar.includes("max-w-lg"), "검색창을 왼쪽에 가두지 않는다");

const chatCss = readFileSync(path.join(srcRoot, "features/chat-workspace/chat-workspace.css"), "utf8");
const buildCss = readFileSync(path.join(srcRoot, "features/build-workspace/build-workspace.css"), "utf8");
assert.ok(!chatCss.includes("#fee500") && !chatCss.includes("#ead400"), "질문 말풍선에 카카오 hex를 쓰지 않는다");
assert.ok(!buildCss.includes("#fee500") && !buildCss.includes("#ead400"), "빌드 말풍선에 카카오 hex를 쓰지 않는다");
assert.ok(chatCss.includes("var(--muted)") && chatCss.includes("[data-role=user]"), "질문 사용자 말풍선은 토큰을 쓴다");
assert.ok(buildCss.includes("var(--muted)") && buildCss.includes("[data-role=user]"), "빌드 사용자 말풍선은 토큰을 쓴다");

const hero = readFileSync(path.join(srcRoot, "features/home/HeroComposer.tsx"), "utf8");
assert.ok(!hero.includes("focus-within:scale") && !hero.includes("shadow-xl") && !hero.includes("!bg-card/60"));
assert.ok(!hero.includes("scale-["));
assert.ok(!hero.includes("active:scale"));

const app = readFileSync(path.join(srcRoot, "App.tsx"), "utf8");
assert.ok(app.includes("lg:ml-[260px]"), "영역 레일 옆에 페이지 목록이 붙는다");
assert.ok(!app.includes("ResourceUsageDrawer"), "홈에 리소스 위젯을 띄우지 않는다");
assert.ok(!app.includes("MediaWidget"), "홈에 미디어 위젯을 띄우지 않는다");

console.log(JSON.stringify({ ok: true, files: files.length }, null, 2));
