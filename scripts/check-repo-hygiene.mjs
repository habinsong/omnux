import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_DIRECTORIES = ["apps", "docs"];
const OPTIONAL_CANONICAL_DIRECTORIES = ["workspace"];
const DISALLOWED_ROOT_SHORTCUTS = [
  ".runtime",
  "coding",
  "runtime",
  "gemini-retriever-plan",
  "omninode-dashboard",
  "omninode-middleware",
  "omninode-sandbox",
  "omnux-dashboard",
  "omnux-middleware",
  "omnux-sandbox",
  "GEMINI_SEARCH_RETRIEVER_INTEGRATION_PLAN.md",
  "OMNINODE_실환경_수동_최종회귀_체크리스트.md",
  "OMNUX_실환경_수동_최종회귀_체크리스트.md",
  "검증_가이드.md",
  "기술스택_정리.md",
  "도구_통합_패널_사용_가이드.md",
  "디렉터리_가이드.md",
  "사용법_빠른시작.md",
  "아키텍처_흐름.md",
  "토큰_메모리_초기화_가이드.md",
  "환경변수_및_상태파일.md"
];
const REQUIRED_GITIGNORE_PATTERNS = [
  "node_modules/",
  "output/",
  "workspace/",
  "docs/gemini-retriever-plan/loop-automation/runtime/",
  "apps/.runtime/",
  "apps/omnux-middleware/gugudan.py"
];
const ARTIFACT_PATHS = [
  "node_modules",
  "output",
  "workspace",
  "workspace/.runtime",
  "workspace/runtime",
  "workspace/coding",
  "docs/gemini-retriever-plan/loop-automation/runtime",
  "apps/.runtime"
];
const DISALLOWED_TRACKED_FILES = [
  "apps/omnux-middleware/gugudan.py",
  "main.js",
  "preload.js",
  "worker.js"
];
const GENERATED_STACK_ARTIFACT_PATHS = [
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
];

function toAbsolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readTrackedFiles(relativePath) {
  const result = spawnSync("git", ["ls-files", "--", relativePath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error(`git ls-files 실패: ${relativePath}`);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function filterExistingTrackedFiles(trackedFiles) {
  return trackedFiles.filter((relativePath) => !!lstatSync(toAbsolute(relativePath), { throwIfNoEntry: false }));
}

function ensureDirectory(relativePath) {
  const stat = lstatSync(toAbsolute(relativePath), { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory()) {
    throw new Error(`필수 canonical 디렉터리가 없거나 디렉터리가 아닙니다: ${relativePath}`);
  }
}

function inspectCanonicalDirectory(relativePath) {
  const stat = lstatSync(toAbsolute(relativePath), { throwIfNoEntry: false });
  return {
    path: relativePath,
    present: !!stat,
    kind: !stat ? "missing" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file"
  };
}

function readTrackedSymlinks() {
  const result = spawnSync("git", ["ls-files", "-z", "-s"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    throw new Error("git ls-files symlink 검사 실패");
  }

  return result.stdout
    .split("\0")
    .filter(Boolean)
    .flatMap((record) => {
      const tabIndex = record.indexOf("\t");
      if (tabIndex < 0) {
        return [];
      }

      const metadata = record.slice(0, tabIndex);
      const filePath = record.slice(tabIndex + 1);
      const [mode] = metadata.split(" ");
      return mode === "120000" ? [filePath] : [];
    });
}

function ensureNoRootShortcuts() {
  const existingRootShortcuts = DISALLOWED_ROOT_SHORTCUTS.filter((relativePath) =>
    !!lstatSync(toAbsolute(relativePath), { throwIfNoEntry: false })
  );
  if (existingRootShortcuts.length > 0) {
    throw new Error(`루트 바로가기 alias가 남아 있습니다: ${existingRootShortcuts.join(", ")}`);
  }

  const trackedSymlinks = readTrackedSymlinks();
  if (trackedSymlinks.length > 0) {
    throw new Error(`git에 추적되는 심볼릭 링크가 남아 있습니다: ${trackedSymlinks.join(", ")}`);
  }

  return {
    disallowedRootShortcuts: DISALLOWED_ROOT_SHORTCUTS.length,
    trackedSymlinks: 0
  };
}

function ensureGitignorePatterns() {
  const gitignore = readFileSync(toAbsolute(".gitignore"), "utf8");
  const lines = new Set(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );

  const missingPatterns = REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !lines.has(pattern));
  if (missingPatterns.length > 0) {
    throw new Error(`.gitignore 누락 패턴: ${missingPatterns.join(", ")}`);
  }
}

function ensureArtifactsAreUntracked() {
  const trackedArtifactCounts = {};
  const violations = [];

  for (const relativePath of ARTIFACT_PATHS) {
    const trackedFiles = filterExistingTrackedFiles(readTrackedFiles(relativePath));
    trackedArtifactCounts[relativePath] = trackedFiles.length;
    if (trackedFiles.length > 0) {
      violations.push(`${relativePath} (${trackedFiles.length})`);
    }
  }

  for (const relativePath of DISALLOWED_TRACKED_FILES) {
    const trackedFiles = filterExistingTrackedFiles(readTrackedFiles(relativePath));
    if (trackedFiles.length > 0) {
      violations.push(`${relativePath} (tracked sample artifact)`);
    }
  }

  if (violations.length > 0) {
    throw new Error(`재생성 가능한 아티팩트가 git 인덱스에 남아 있습니다: ${violations.join(", ")}`);
  }

  return trackedArtifactCounts;
}

function ensureGeneratedStackArtifactsAreAbsent() {
  const existingArtifacts = GENERATED_STACK_ARTIFACT_PATHS.filter((relativePath) =>
    !!lstatSync(toAbsolute(relativePath), { throwIfNoEntry: false })
  );

  if (existingArtifacts.length > 0) {
    throw new Error(`미들웨어/루트 생성 스택 산출물이 남아 있습니다: ${existingArtifacts.join(", ")}`);
  }
}

function main() {
  REQUIRED_DIRECTORIES.forEach(ensureDirectory);
  const canonicalDirectories = OPTIONAL_CANONICAL_DIRECTORIES.map(inspectCanonicalDirectory);
  const rootShortcuts = ensureNoRootShortcuts();
  ensureGitignorePatterns();
  const trackedArtifactCounts = ensureArtifactsAreUntracked();
  ensureGeneratedStackArtifactsAreAbsent();

  console.log(JSON.stringify({
    ok: true,
    canonicalDirectories,
    rootShortcuts,
    trackedArtifactCounts
  }, null, 2));
}

main();
