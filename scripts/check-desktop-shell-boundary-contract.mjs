import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0;

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(source, needle, label) {
  assertionCount += 1;
  assert.ok(source.includes(needle), `${label}: expected to include ${needle}`);
}

function collectFiles(directory, predicate) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, predicate));
      continue;
    }
    if (entry.isFile() && predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

const develop = read("develop.md");
assertIncludes(
  develop,
  "Tauri Rust 백엔드는 앱 셸(Window 관리)만 담당한다.",
  "develop.md desktop shell role"
);
assertIncludes(
  develop,
  "비즈니스 로직은 .NET 미들웨어가 전담한다.",
  "develop.md middleware ownership"
);
assertIncludes(
  develop,
  "Rust 쪽 금지",
  "develop.md rust prohibition heading"
);
assertIncludes(
  develop,
  "LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책",
  "develop.md forbidden business domains"
);
assertIncludes(
  develop,
  "node scripts/check-desktop-shell-boundary-contract.mjs",
  "develop.md desktop shell contract command"
);

const runTests = read("scripts/run-omnux-tests.mjs");
assertIncludes(
  runTests,
  "check-desktop-shell-boundary-contract.mjs",
  "npm test desktop shell contract"
);

const desktopDir = path.join(repoRoot, "apps", "desktop");
const srcTauriDir = path.join(desktopDir, "src-tauri");
const srcDir = path.join(desktopDir, "src");

if (!existsSync(desktopDir) || !statSync(desktopDir).isDirectory()) {
  console.log(`[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, apps/desktop scaffold 전)`);
  process.exit(0);
}

if (!existsSync(srcTauriDir) || !statSync(srcTauriDir).isDirectory()) {
  console.log(`[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, src-tauri scaffold 전)`);
  process.exit(0);
}

const inspectedFiles = collectFiles(
  srcTauriDir,
  (filePath) => filePath.endsWith(".rs") || filePath.endsWith("Cargo.toml")
);

const forbiddenRustPatterns = [
  { pattern: /\breqwest\b/i, reason: "Rust 셸에서 직접 HTTP 클라이언트로 provider/API 호출 금지" },
  { pattern: /\basync-openai\b/i, reason: "Rust 셸에서 LLM SDK 의존 금지" },
  { pattern: /\b(openai|anthropic|gemini|groq|cerebras|ollama)\b/i, reason: "Rust 셸에서 LLM provider 결합 금지" },
  { pattern: /\b(rusqlite|sqlx|diesel)\b/i, reason: "Rust 셸에서 비즈니스 상태 DB 직접 소유 금지" },
  { pattern: /\b(std::process::Command|tokio::process|Command::new)\b/, reason: "Rust 셸에서 임의 프로세스 실행 금지" },
  { pattern: /\b(std::net|tokio::net)\b/, reason: "Rust 셸에서 별도 네트워크 서버/소켓 계층 생성 금지" },
  { pattern: /\b(llm|coding|routine|refactor|logic_graph|routing[_-]policy)\b/i, reason: "Rust 셸에 도메인 비즈니스 로직 배치 금지" },
  { pattern: /\.omnux\b/i, reason: "Rust 셸에서 ~/.omnux 영속 상태 직접 접근 금지" },
  { pattern: /\bworkspaceRoot\b|\bworkspace_root\b|workspace\//i, reason: "Rust 셸에서 workspace 산출물 직접 변경 금지" }
];

const violations = [];
for (const filePath of inspectedFiles) {
  const source = readFileSync(filePath, "utf8");
  for (const { pattern, reason } of forbiddenRustPatterns) {
    assertionCount += 1;
    if (pattern.test(source)) {
      violations.push(`${toRelative(filePath)}: ${reason} (${pattern})`);
    }
  }
}

assert.deepEqual(violations, [], `Tauri Rust 셸 경계 위반:\n${violations.join("\n")}`);

if (existsSync(srcDir) && statSync(srcDir).isDirectory()) {
  const requiredFrontendFiles = [
    "src/App.tsx",
    "src/App.css",
    "src/main.tsx",
    "src/shell-store.ts",
    "src/ShellErrorBoundary.tsx",
    "src/middleware-contract.ts",
    "src/use-middleware-bootstrap-events.ts",
    "src/use-middleware-runtime-probe.ts"
  ];

  for (const relativePath of requiredFrontendFiles) {
    const absolutePath = path.join(desktopDir, relativePath);
    assertionCount += 1;
    assert.ok(existsSync(absolutePath), `desktop frontend file missing: ${relativePath}`);
  }

  const appSource = read("apps/desktop/src/App.tsx");
  assertIncludes(
    appSource,
    "useDesktopShellStore",
    "desktop App.tsx shell store boundary"
  );
  assertIncludes(
    appSource,
    "WebSocket",
    "desktop App.tsx middleware websocket contract"
  );
  assertIncludes(
    appSource,
    "sidecar",
    "desktop App.tsx sidecar contract"
  );
  assertIncludes(
    appSource,
    "reconnectPolicy",
    "desktop App.tsx reconnect policy contract"
  );
  assertIncludes(
    appSource,
    "CardBoundary",
    "desktop App.tsx card error boundary"
  );
  assertIncludes(
    appSource,
    "recordCardError",
    "desktop App.tsx card error logging"
  );
  assertIncludes(
    appSource,
    "useMiddlewareBootstrapEvents",
    "desktop App.tsx bootstrap lifecycle listener"
  );
  assertIncludes(
    appSource,
    "bootstrapPhase",
    "desktop App.tsx bootstrap phase display"
  );
  assertIncludes(
    appSource,
    "healthStatus",
    "desktop App.tsx healthz probe status display"
  );
  assertIncludes(
    appSource,
    "readyStatus",
    "desktop App.tsx readyz probe status display"
  );

  const shellStoreSource = read("apps/desktop/src/shell-store.ts");
  assertIncludes(
    shellStoreSource,
    "middleware",
    "desktop shell store middleware state"
  );
  assertIncludes(
    shellStoreSource,
    "sidecarBootstrap",
    "desktop shell store sidecar bootstrap reservation"
  );
  assertIncludes(
    shellStoreSource,
    "dev-dotnet-run-bootstrap",
    "desktop shell store dev bootstrap label"
  );
  assertIncludes(
    shellStoreSource,
    "bundle-external-bin",
    "desktop shell store bundle external bin label"
  );
  assertIncludes(
    shellStoreSource,
    "WebSocket",
    "desktop shell store websocket endpoint"
  );
  assertIncludes(
    shellStoreSource,
    "markReconnectPlanned",
    "desktop shell store reconnect planning action"
  );
  assertIncludes(
    shellStoreSource,
    "scheduleNextReconnect",
    "desktop shell store reconnect scheduler action"
  );
  assertIncludes(
    shellStoreSource,
    "markHealthProbe",
    "desktop shell store health probe action"
  );
  assertIncludes(
    shellStoreSource,
    "markHttpProbe",
    "desktop shell store http probe action"
  );
  assertIncludes(
    shellStoreSource,
    "healthStatus",
    "desktop shell store healthz status"
  );
  assertIncludes(
    shellStoreSource,
    "readyStatus",
    "desktop shell store readyz status"
  );
  assertIncludes(
    shellStoreSource,
    "syncRuntimeContract(state.runtime, \"connected\", 0",
    "desktop shell store reconnect reset on success"
  );
  assertIncludes(
    shellStoreSource,
    "lastProbeAt",
    "desktop shell store last probe tracking"
  );
  assertIncludes(
    shellStoreSource,
    "markBootstrapEvent",
    "desktop shell store bootstrap lifecycle action"
  );
  assertIncludes(
    shellStoreSource,
    "bootstrapPid",
    "desktop shell store bootstrap pid"
  );
  assertIncludes(
    read("apps/desktop/src/middleware-contract.ts"),
    "manual-until-sidecar",
    "desktop middleware reconnect policy mode"
  );
  assertIncludes(
    read("apps/desktop/src/middleware-contract.ts"),
    "DESKTOP_MIDDLEWARE_HEALTH_URL",
    "desktop middleware health url contract"
  );

  const boundarySource = read("apps/desktop/src/ShellErrorBoundary.tsx");
  assertIncludes(
    boundarySource,
    "데스크톱 셸 렌더링을 중단했다",
    "desktop shell error boundary fallback"
  );
  assertIncludes(
    read("apps/desktop/src/main.tsx"),
    "ShellErrorBoundary",
    "desktop main shell error boundary wiring"
  );

  const rustShellSource = read("apps/desktop/src-tauri/src/lib.rs");
  assertIncludes(
    rustShellSource,
    "tauri_plugin_shell::init",
    "desktop rust shell plugin init"
  );
  assertIncludes(
    rustShellSource,
    "bootstrap_desktop_middleware",
    "desktop rust middleware bootstrap helper"
  );
  assertIncludes(
    rustShellSource,
    "OMNUX_WS_PORT",
    "desktop rust middleware bootstrap port"
  );
  assertIncludes(
    rustShellSource,
    "CommandEvent::Terminated",
    "desktop rust middleware bootstrap lifecycle"
  );
  assertIncludes(
    rustShellSource,
    "dotnet",
    "desktop rust middleware bootstrap command"
  );
  assertIncludes(
    rustShellSource,
    "MIDDLEWARE_BOOTSTRAP_EVENT",
    "desktop rust emits middleware bootstrap event"
  );
  assertIncludes(
    rustShellSource,
    "emit_middleware_bootstrap_event",
    "desktop rust middleware bootstrap event helper"
  );

  const tauriConfig = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
  assertionCount += 1;
  assert.ok(Array.isArray(tauriConfig.bundle?.externalBin), "desktop tauri config must declare externalBin");
  assertionCount += 1;
  assert.ok(
    tauriConfig.bundle.externalBin.includes("binaries/omnux-middleware"),
    "desktop tauri config must include omnux middleware external bin"
  );

  const runtimeProbeSource = read("apps/desktop/src/use-middleware-runtime-probe.ts");
  assertIncludes(
    runtimeProbeSource,
    "new WebSocket(runtime.wsUrl)",
    "desktop runtime probe uses websocket contract"
  );
  assertIncludes(
    runtimeProbeSource,
    "fetch(url",
    "desktop runtime probe checks healthz and readyz"
  );
  assertIncludes(
    runtimeProbeSource,
    "markHttpProbe",
    "desktop runtime probe records http probe status"
  );
  assertIncludes(
    runtimeProbeSource,
    "\"ping\"",
    "desktop runtime probe sends ping only"
  );
  assertIncludes(
    runtimeProbeSource,
    "\"pong\"",
    "desktop runtime probe waits for pong"
  );
  assertIncludes(
    runtimeProbeSource,
    "scheduleNextReconnect",
    "desktop runtime probe schedules reconnect"
  );
  assertIncludes(
    runtimeProbeSource,
    "triggerMiddlewareRuntimeProbe",
    "desktop runtime probe manual retrigger hook"
  );

  const bootstrapEventsSource = read("apps/desktop/src/use-middleware-bootstrap-events.ts");
  assertIncludes(
    bootstrapEventsSource,
    "isTauri",
    "desktop bootstrap event listener browser guard"
  );
  assertIncludes(
    bootstrapEventsSource,
    "omnux://middleware-bootstrap",
    "desktop bootstrap event listener channel"
  );
  assertIncludes(
    bootstrapEventsSource,
    "markBootstrapEvent",
    "desktop bootstrap event listener state bridge"
  );

  const desktopPackage = read("apps/desktop/package.json");
  assertionCount += 1;
  assert.ok(
    !desktopPackage.includes("@tauri-apps/plugin-opener"),
    "desktop package should not keep opener plugin dependency"
  );

  const frontendFiles = collectFiles(
    srcDir,
    (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx")
  );
  const frontendForbiddenPatterns = [
    { pattern: /\bpaletteOpen\b/, reason: "예전 paletteOpen ReferenceError 회귀 차단" }
  ];

  const frontendViolations = [];
  for (const filePath of frontendFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const { pattern, reason } of frontendForbiddenPatterns) {
      assertionCount += 1;
      if (pattern.test(source)) {
        frontendViolations.push(`${toRelative(filePath)}: ${reason} (${pattern})`);
      }
    }
  }

  assert.deepEqual(
    frontendViolations,
    [],
    `desktop frontend boundary 위반:\n${frontendViolations.join("\n")}`
  );
}

console.log(
  `[check-desktop-shell-boundary-contract] ok (${assertionCount} assertions, inspected ${inspectedFiles.length} files)`
);
