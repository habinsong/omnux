import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "apps/desktop/src/features/task-workspace");
const files = readdirSync(directory).filter(file => /\.(tsx?|css)$/.test(file));
assert.ok(files.length >= 5, "새 작업 화면의 상태·표시·스타일 경계가 필요합니다.");
for (const file of files) {
  const content = readFileSync(path.join(directory, file), "utf8");
  assert.doesNotMatch(content, /from\s+["'][^"']*(?:components\/|planning-store|\/planning\/)/, `${file}: 기존 UI를 가져오지 않습니다.`);
  assert.doesNotMatch(content, /\b(?:WorkbenchPage|WorkbenchSection|CardBoundary|ResponsivePanels)\b/, `${file}: 새 화면 구성을 사용합니다.`);
}
const app = readFileSync(path.join(root, "apps/desktop/src/App.tsx"), "utf8");
assert.match(app, /id:\s*"planning"[^\n]+<TaskWorkspacePage\s*\/>/, "작업 경로는 새 화면에 연결되어야 합니다.");
assert.ok(!existsSync(path.join(root, "apps/desktop/src/features/planning/PlanningPage.tsx")), "이전 작업 화면을 남기지 않습니다.");
assert.ok(!existsSync(path.join(root, "apps/desktop/src/features/planning/planning-store.ts")), "이전 화면 상태 관리를 남기지 않습니다.");
console.log(`[check-task-workspace-source] ok (${files.length}개 새 파일)`);
