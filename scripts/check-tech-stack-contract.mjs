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

function assertOptionalFilesExactly(relativeDir, expectedFiles, label) {
  assertionCount += 1;
  if (!existsSync(path.join(repoRoot, relativeDir))) {
    return;
  }

  const actualFiles = collectFiles(relativeDir);
  assert.deepEqual(actualFiles, expectedFiles, label);
}

const techStack = read("docs/기술스택_정리.md");
const englishTechStack = read("docs/en/tech-stack.md");
const packageJson = read("package.json");
const englishReadme = read("README.en.md");
const dashboardShell = read("apps/omnux-dashboard/shell.js");
const testRunner = read("scripts/run-omnux-tests.mjs");
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
assertIncludes(techStack, "새 언어/런타임 승인 기준", "새 런타임 승인 기준 섹션");
assertIncludes(techStack, "새 언어, 런타임, 프레임워크, 번들러는 기본 거부한다.", "새 런타임 기본 거부");
assertIncludes(techStack, "현재 스택으로 요구사항을 만족할 수 없거나 플랫폼이 공식적으로 요구할 때만 예외를 검토한다.", "새 런타임 예외 조건");
assertIncludes(techStack, "이 문서, 영문 문서, `scripts/check-tech-stack-contract.mjs` 계약 검사를 함께 갱신한다.", "새 런타임 문서/계약 동시 갱신");
assertIncludes(techStack, "책임자, canonical source home, 상태 파일 위치, secret 취급 방식, 빌드/검증 명령, 제거/rollback 계획", "새 런타임 승인 기록 필수 항목");
assertIncludes(techStack, "비즈니스 로직, provider 라우팅, 상태 오케스트레이션을 `.NET 9` 미들웨어 밖으로 옮기는 명분이 될 수 없다.", "새 런타임 미들웨어 책임 유지");
assertIncludes(techStack, "실험/스파이크 산출물은 `workspace/`에만 두고", "새 런타임 실험 산출물 위치");
assertIncludes(techStack, "Phase 5 스택 유입 차단 게이트", "Phase 5 스택 유입 차단 게이트 섹션");
assertIncludes(techStack, "Phase 5 화면 이식은 기존 `apps/desktop/` Tauri/Vite/React/TypeScript 셸과 `apps/omnux-dashboard/` 정적 대시보드 원본만 사용한다.", "Phase 5 기존 source home만 사용");
assertIncludes(techStack, "Phase 5 변경 전후에는 `npm test`를 통과시킨다.", "Phase 5 npm test 게이트");
assertIncludes(techStack, "최소 `node scripts/check-tech-stack-contract.mjs`와 `node scripts/check-repo-hygiene.mjs`를 함께 실행한다.", "Phase 5 범위 축소 게이트");
assertIncludes(techStack, "새 루트 앱 디렉터리, 새 source home, 새 번들러, 새 package manager, 새 runtime shortcut은 새 언어/런타임 승인 기준을 통과하기 전까지 만들지 않는다.", "Phase 5 새 스택 유입 거부");
assertIncludes(techStack, "기존 루트 `omnux/` 프로토타입은 활성 source home이 아니다.", "루트 omnux 프로토타입 비활성 source home");
assertIncludes(techStack, "브랜드와 호환 alias 경계", "브랜드/alias 경계 섹션");
assertIncludes(techStack, "canonical 이름은 `omnux`다.", "브랜드 canonical 이름");
assertIncludes(techStack, "`Omni-node`는 현재 저장소 폴더명, 이전 이름을 설명하는 문맥, 마이그레이션 예시에만 남길 수 있다.", "Omni-node 허용 문맥");
assertIncludes(techStack, "`omninode-*` 루트 alias, Electron/Codex legacy alias, 새 런타임 shortcut은 다시 만들지 않는다.", "legacy alias 재생성 금지");
assertIncludes(techStack, "호환 alias가 필요하면 임시 shim으로만 추가하고", "호환 alias 임시 shim 조건");
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
assertIncludes(englishTechStack, "New Language / Runtime Approval Criteria", "영문 새 런타임 승인 기준 섹션");
assertIncludes(englishTechStack, "New languages, runtimes, frameworks, and bundlers are denied by default.", "영문 새 런타임 기본 거부");
assertIncludes(englishTechStack, "the current stack cannot meet the requirement or an official platform requirement forces it", "영문 새 런타임 예외 조건");
assertIncludes(englishTechStack, "update this document, the Korean document, and `scripts/check-tech-stack-contract.mjs` in the same change", "영문 새 런타임 문서/계약 동시 갱신");
assertIncludes(englishTechStack, "owner, canonical source home, state-file location, secret handling, build/verification commands, and removal/rollback plan", "영문 새 런타임 승인 기록 필수 항목");
assertIncludes(englishTechStack, "move business logic, provider routing, or state orchestration out of the `.NET 9` middleware", "영문 새 런타임 미들웨어 책임 유지");
assertIncludes(englishTechStack, "Experimental spike artifacts belong only in `workspace/`", "영문 새 런타임 실험 산출물 위치");
assertIncludes(englishTechStack, "Phase 5 Stack Ingress Gate", "영문 Phase 5 스택 유입 차단 게이트 섹션");
assertIncludes(englishTechStack, "Phase 5 screen migration uses only the existing `apps/desktop/` Tauri/Vite/React/TypeScript shell and the `apps/omnux-dashboard/` static dashboard source.", "영문 Phase 5 기존 source home만 사용");
assertIncludes(englishTechStack, "Run `npm test` before and after Phase 5 changes.", "영문 Phase 5 npm test 게이트");
assertIncludes(englishTechStack, "run at least `node scripts/check-tech-stack-contract.mjs` and `node scripts/check-repo-hygiene.mjs` together", "영문 Phase 5 범위 축소 게이트");
assertIncludes(englishTechStack, "Do not create new root app directories, new source homes, new bundlers, new package managers, or new runtime shortcuts", "영문 Phase 5 새 스택 유입 거부");
assertIncludes(englishTechStack, "The existing root `omnux/` prototype is not an active source home.", "영문 루트 omnux 프로토타입 비활성 source home");
assertIncludes(englishTechStack, "Brand And Compatibility Alias Boundary", "영문 브랜드/alias 경계 섹션");
assertIncludes(englishTechStack, "new user-facing copy use `omnux`", "영문 브랜드 canonical 이름");
assertIncludes(englishTechStack, "`Omni-node` may remain only as the current repository folder name, historical name context, or migration example.", "영문 Omni-node 허용 문맥");
assertIncludes(englishTechStack, "Root `omninode-*` aliases, Electron/Codex legacy aliases, and new runtime shortcuts must not be recreated.", "영문 legacy alias 재생성 금지");
assertIncludes(packageJson, "\"name\": \"omnux\"", "package name canonical omnux");
assertNotIncludes(packageJson, "\"name\": \"omninode\"", "package name must not use legacy omninode");
assertIncludes(englishReadme, "# omnux", "영문 README canonical title");
assertIncludes(dashboardShell, "brand-name' }, 'omnux'", "대시보드 셸 canonical brand");
assertIncludes(testRunner, "scripts\", \"check-repo-hygiene.mjs", "npm test runs repo hygiene gate");
assertIncludes(testRunner, "scripts\", \"check-tech-stack-contract.mjs", "npm test runs tech stack contract");
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
assertOptionalFilesExactly(
  "omnux",
  [
    "omnux/app.jsx",
    "omnux/ask.jsx",
    "omnux/automate.jsx",
    "omnux/build.jsx",
    "omnux/data.jsx",
    "omnux/home.jsx",
    "omnux/i18n.jsx",
    "omnux/icons.jsx",
    "omnux/omnux.html",
    "omnux/palette.jsx",
    "omnux/projects.jsx",
    "omnux/settings.jsx",
    "omnux/shell.jsx",
    "omnux/styles.css"
  ],
  "legacy root omnux prototype file list stays frozen until deletion or migration is confirmed"
);

const develop = read("develop.md");
assertIncludes(develop, "12번은 기술 스택 책임 경계 문서화, 계약 검사, 루트/미들웨어 생성 산출물 삭제에 더해 새 언어/런타임 승인 기준과 브랜드/호환 alias 경계까지 문서와 계약 검사에 추가했다.", "develop 12번 보강");
assertIncludes(develop, "완료: 4건 (6번, 8번, 9번, 12번)", "develop 완료 건수");
assertIncludes(develop, "1차 보강 완료: 8건 (1번~5번, 7번, 10번~11번)", "develop 보강 건수");
assertIncludes(develop, "1차 착수: 0건", "develop 착수 건수");
assertIncludes(develop, "처리율(착수 이상): 100% (12/12)", "develop 처리율");
assertIncludes(develop, "1차 보강 이상 완료율: 100% (12/12)", "develop 1차 보강 이상 완료율");
assertIncludes(develop, "미완료률(완전 해결 기준): 67% (8/12)", "develop 미완료률");
assertIncludes(develop, "원본 위치 경계", "develop documents source home boundary");
assertIncludes(develop, "새 언어/런타임 승인 기준", "develop 새 런타임 승인 기준");
assertIncludes(develop, "Phase 5 스택 유입 차단 게이트", "develop Phase 5 스택 유입 차단 게이트");
assertIncludes(develop, "브랜드와 호환 alias 경계", "develop 브랜드/alias 경계");
assertIncludes(develop, "루트 `omnux/` 프로토타입 파일 목록 동결", "develop 루트 omnux 프로토타입 동결");

console.log(JSON.stringify({ ok: true, assertions: assertionCount }, null, 2));
