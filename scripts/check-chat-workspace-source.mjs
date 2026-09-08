import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "apps/desktop/src/features/chat-workspace");
const files = readdirSync(directory).filter(file => /\.(tsx?|css)$/.test(file));
for (const file of files) {
  const source = readFileSync(path.join(directory, file), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:components\/|\/AskPage|\/AskThread|\/AskMessages|\/AskHistoryPanel|\/AskSettingsPanel|\/AskResourcesPanel|\/MarkdownMessage)/, `${file}: 이전 화면을 가져오지 않습니다.`);
  assert.doesNotMatch(source, /\b(?:WorkbenchPage|WorkbenchSection|CardBoundary|ResponsivePanels)\b/);
}
assert.equal(existsSync(path.join(root, "apps/desktop/src/features/ask/AskPage.tsx")), false);
const app = readFileSync(path.join(root, "apps/desktop/src/App.tsx"), "utf8");
assert.match(app, /id:\s*"ask"[^\n]+<ChatWorkspacePage\s*\/>/);
assert.match(app, /useAskPageBridge\(\)/);
console.log(`[check-chat-workspace-source] ok (${files.length}개 새 파일)`);
