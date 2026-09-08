import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "apps/desktop/src/features/explore-workspace");
const files = readdirSync(directory).filter(file => /\.(tsx?|css)$/.test(file));
for (const file of files) {
  const source = readFileSync(path.join(directory, file), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:components\/|\/explore\/)/, `${file}: 이전 화면을 가져오지 않습니다.`);
  assert.doesNotMatch(source, /\b(?:WorkbenchPage|WorkbenchSection|CardBoundary|ResponsivePanels|useExploreStore)\b/);
}
assert.equal(existsSync(path.join(root, "apps/desktop/src/features/explore/ExplorePage.tsx")), false);
const app = readFileSync(path.join(root, "apps/desktop/src/App.tsx"), "utf8");
assert.match(app, /id:\s*"explore"[^\n]+<ExploreWorkspacePage\s*\/>/);
assert.match(app, /useExploreWorkspaceSession\(\)/);
console.log(`[check-explore-workspace-source] ok (${files.length}개 새 파일)`);
