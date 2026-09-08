import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const directory=path.join(root,"apps/desktop/src/features/build-workspace");
const files=readdirSync(directory).filter(file=>/\.(tsx?|css)$/.test(file));
for(const file of files){
  const source=readFileSync(path.join(directory,file),"utf8");
  assert.doesNotMatch(source,/from\s+["'][^"']*(?:components\/|\/build\/|\/task-workspace\/|\/automation-workspace\/)/,`${file}: 기존 화면을 가져오지 않습니다.`);
  assert.doesNotMatch(source,/\b(?:WorkbenchPage|WorkbenchSection|CardBoundary|ResponsivePanels|useBuildStore)\b/);
}
const app=readFileSync(path.join(root,"apps/desktop/src/App.tsx"),"utf8");
assert.match(app,/id:\s*"build"[^\n]+<BuildWorkspacePage\s*\/>/);
assert.match(app,/useBuildWorkspaceSession\(\)/);
assert.equal(existsSync(path.join(root,"apps/desktop/src/features/build/BuildPage.tsx")),false);
assert.equal(existsSync(path.join(root,"apps/desktop/src/features/build/build-store.ts")),false);
console.log(`[check-build-workspace-source] ok (${files.length}개 새 파일)`);
