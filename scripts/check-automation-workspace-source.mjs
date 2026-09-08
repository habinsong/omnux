import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, "apps/desktop/src/features/automation-workspace");
const files = readdirSync(directory).filter(file => /\.(tsx?|css)$/.test(file));
for (const file of files) {
  const source = readFileSync(path.join(directory, file), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*(?:components\/|automate-store|\/automate\/|\/task-workspace\/)/, `${file}: 이전 화면을 재사용하지 않습니다.`);
  assert.doesNotMatch(source, /\b(?:WorkbenchPage|WorkbenchSection|CardBoundary|ResponsivePanels)\b/);
}
const app = readFileSync(path.join(root,"apps/desktop/src/App.tsx"),"utf8");
assert.match(app, /id:\s*"automate"[^\n]+<AutomationWorkspacePage\s*\/>/);
assert.match(app, /useAutomationWorkspaceSession\(\)/);
for(const file of ["AutomatePage.tsx","RoutineCreateWizard.tsx","automate-store.ts"]) assert.equal(existsSync(path.join(root,"apps/desktop/src/features/automate",file)),false);
console.log(`[check-automation-workspace-source] ok (${files.length}개 새 파일)`);
