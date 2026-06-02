import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0;

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(text.includes(needle), `${label}: ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(!text.includes(needle), `${label}: ${needle}`);
}

function collectFiles(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(repoRoot, relativePath);
    if (entry.name === "__pycache__" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
      continue;
    }

    if (entry.isSymbolicLink() && statSync(absolutePath).isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function assertFilesMatch(relativeDir, predicate, label) {
  assertionCount += 1;
  const files = collectFiles(relativeDir);
  const violations = files.filter((filePath) => !predicate(filePath));
  assert.deepEqual(violations, [], `${label}: ${violations.join(", ")}`);
}

function assertPathMissing(relativePath, label) {
  assertionCount += 1;
  assert.equal(existsSync(path.join(repoRoot, relativePath)), false, `${label}: ${relativePath}`);
}

const techStack = read("docs/기술스택_정리.md");
const englishTechStack = read("docs/en/tech-stack.md");
assertIncludes(techStack, "데스크톱 셸", "기술 스택 문서");
assertIncludes(techStack, "Rust + TypeScript + React", "데스크톱 셸 언어 조합");
assertIncludes(techStack, "metrics, guarded kill", "코어 런타임 역할 경계");
assertIncludes(techStack, "도메인 오케스트레이션", "미들웨어 책임");
assertIncludes(techStack, "언어 책임 경계", "언어 책임 섹션");
assertIncludes(techStack, "Rust는 앱 셸(Window 관리)만 맡고", "Rust 책임 경계");
assertIncludes(techStack, "새 비즈니스 로직과 상태 오케스트레이션은 기본적으로 .NET 9 미들웨어가 전담한다.", "비즈니스 로직 책임 경계");
assertIncludes(techStack, "Python은 샌드박스 실행과 코드 검증에만 쓴다.", "Python 책임 경계");
assertIncludes(techStack, "Node.js는 테스트, 위생 검사, 계약 검사에만 쓴다.", "Node.js 책임 경계");
assertIncludes(techStack, "원본 위치 경계", "기술 스택 원본 위치 경계 섹션");
assertIncludes(techStack, "apps/omnux-middleware/src/", ".NET canonical source home");
assertIncludes(techStack, "apps/desktop/src/", "desktop React/TS canonical source home");
assertIncludes(techStack, "apps/desktop/src-tauri/src/", "desktop Rust canonical source home");
assertIncludes(techStack, "apps/omnux-sandbox/executor.py", "Python canonical source home");
assertIncludes(techStack, "scripts/", "Node.js canonical source home");
assertIncludes(techStack, "루트에는 Electron/Codex 번들 산출물인 `main.js`, `preload.js`, `worker.js`를 보관하지 않는다.", "루트 Node 번들 잔재 금지");
assertIncludes(techStack, "미들웨어 루트에는 코딩 스모크가 생성한 `main.py`, `main.js`, `main.c` 같은 작업 산출물을 보관하지 않는다.", "미들웨어 생성 산출물 금지");
assertNotIncludes(techStack, "C#와 Rust를 같은 계층에 섞는다", "언어 책임 경계는 혼합을 권장하지 않는다");
assertIncludes(englishTechStack, "Updated: 2026-06-02", "영문 기술 스택 업데이트 날짜");
assertIncludes(englishTechStack, "Desktop shell", "영문 데스크톱 셸 문서");
assertIncludes(englishTechStack, "Rust owns only the app shell and window lifecycle.", "영문 Rust 책임 경계");
assertIncludes(englishTechStack, "New business logic and state orchestration belong to the .NET 9 middleware by default.", "영문 비즈니스 로직 책임 경계");
assertIncludes(englishTechStack, "Canonical Source Homes", "영문 canonical source homes 섹션");
assertIncludes(englishTechStack, "apps/omnux-middleware/src/", "영문 .NET canonical source home");
assertIncludes(englishTechStack, "apps/desktop/src/", "영문 desktop React/TS canonical source home");
assertIncludes(englishTechStack, "apps/desktop/src-tauri/src/", "영문 desktop Rust canonical source home");
assertIncludes(englishTechStack, "apps/omnux-sandbox/executor.py", "영문 Python canonical source home");
assertIncludes(englishTechStack, "scripts/", "영문 Node.js canonical source home");
assertIncludes(englishTechStack, "The repository root must not keep Electron/Codex bundle artifacts such as `main.js`, `preload.js`, or `worker.js`.", "영문 루트 Node 번들 잔재 금지");
assertIncludes(englishTechStack, "The middleware root must not keep coding-smoke generated artifacts such as `main.py`, `main.js`, or `main.c`.", "영문 미들웨어 생성 산출물 금지");
assertFilesMatch(
  "apps/omnux-middleware/src",
  (filePath) => filePath.endsWith(".cs"),
  ".NET canonical source home"
);
assertFilesMatch(
  "apps/desktop/src",
  (filePath) => filePath.endsWith(".ts")
    || filePath.endsWith(".tsx")
    || filePath.endsWith(".css")
    || filePath.endsWith(".d.ts")
    || filePath.endsWith(".svg"),
  "desktop React/TS canonical source home"
);
assertFilesMatch(
  "apps/desktop/src-tauri/src",
  (filePath) => filePath.endsWith(".rs"),
  "desktop Rust canonical source home"
);
assertFilesMatch(
  "apps/omnux-sandbox",
  (filePath) => filePath === "apps/omnux-sandbox/executor.py",
  "Python canonical source home"
);
assertFilesMatch(
  "scripts",
  (filePath) => filePath.endsWith(".mjs")
    || filePath.endsWith(".js")
    || filePath.endsWith(".sh")
    || filePath.endsWith(".ps1")
    || filePath.endsWith(".cmd")
    || filePath === "scripts/Omni-node"
    || filePath === "scripts/omnux",
  "Node.js and runner canonical source home"
);
[
  "main.js",
  "preload.js",
  "worker.js",
  "apps/omnux-middleware/app",
  "apps/omnux-middleware/app.js",
  "apps/omnux-middleware/main.js",
  "apps/omnux-middleware/planner.js",
  "apps/omnux-middleware/main.py",
  "apps/omnux-middleware/ledger.py",
  "apps/omnux-middleware/main.c",
  "apps/omnux-middleware/ledger.c",
  "apps/omnux-middleware/ledger.h",
  "apps/omnux-middleware/Main.java",
  "apps/omnux-middleware/Ledger.java",
  "apps/omnux-middleware/index.html",
  "apps/omnux-middleware/styles.css",
  "apps/omnux-middleware/schedule.json",
  "apps/omnux-middleware/snapshot.json",
  "apps/omnux-middleware/snapshot.txt"
].forEach((relativePath) => assertPathMissing(relativePath, "legacy generated stack artifact must stay absent"));

const develop = read("develop.md");
assertIncludes(develop, "12번은 기술 스택 책임 경계 문서화, 계약 검사, 루트/미들웨어 생성 산출물 삭제로 1차 보강까지 진행했다.", "develop 12번 보강");
assertIncludes(develop, "1차 보강 완료: 10건 (1번~7번, 9번~10번, 12번)", "develop 보강 건수");
assertIncludes(develop, "1차 착수: 1건 (11번)", "develop 착수 건수");
assertIncludes(develop, "처리율(착수 이상): 100% (12/12)", "develop 처리율");
assertIncludes(develop, "미완료률(완전 해결 기준): 92% (11/12)", "develop 미완료률");
assertIncludes(develop, "원본 위치 경계", "develop documents source home boundary");

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
