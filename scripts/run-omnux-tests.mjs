import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 배포판 Node 는 TypeScript 타입 제거 없이 빌드되기도 한다. 그때만 .ts 변환 로더를 붙인다.
const nodeTypeScriptArgs = process.features.typescript
  ? []
  : ["--import", pathToFileURL(path.join(repoRoot, "scripts", "typescript-loader.mjs")).href];

function toRelative(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function runStep(label, command, args) {
  process.stdout.write(`\n[test] ${label}\n`);
  const result = spawnSync(command, command === "node" ? [...nodeTypeScriptArgs, ...args] : args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolvePythonCommand() {
  const candidates = ["python3", "python"];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: repoRoot,
      stdio: "ignore",
      env: process.env
    });
    if (result.status === 0) {
      return candidate;
    }
  }
  throw new Error("python3/python 실행 파일을 찾을 수 없습니다.");
}

function main() {
  runStep("renewal inventory checks", "node", ["--test", "apps/shared/audit-renewal.test.mjs"]);
  runStep("shared model catalog ids", "node", ["--test", "apps/shared/model-registry.test.mjs"]);
  runStep(
    "repo hygiene gate",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-repo-hygiene.mjs"))]
  );

  runStep(
    "core daemon boundary contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-core-daemon-boundary-contract.mjs"))]
  );
  runStep(
    "desktop shell boundary contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-desktop-shell-boundary-contract.mjs"))]
  );
  runStep(
    "security boundary contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-security-boundaries.mjs"))]
  );
  runStep(
    "extension wiring contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-extension-wiring-contract.mjs"))]
  );
  runStep(
    "activity screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-activity-screen.mjs"))]
  );
  runStep(
    "insights screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-insights-screen.mjs"))]
  );
  runStep(
    "operations screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-operations-screen.mjs"))]
  );
  runStep(
    "routing screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-routing-screen.mjs"))]
  );
  runStep(
    "agents screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-agents-screen.mjs"))]
  );
  runStep(
    "review screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-review-screen.mjs"))]
  );
  runStep(
    "skills screen model",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-skills-screen.mjs"))]
  );
  runStep("fresh build workspace", "node", ["scripts/check-build-workspace-source.mjs"]);
  runStep("fresh chat workspace", "node", ["scripts/check-chat-workspace-source.mjs"]);
  runStep("fresh explore workspace", "node", ["scripts/check-explore-workspace-source.mjs"]);
  runStep("fresh automation workspace", "node", ["scripts/check-automation-workspace-source.mjs"]);
  runStep("fresh task workspace", "node", ["scripts/check-task-workspace-source.mjs"]);
  runStep("renewal screen contracts", "node", ["scripts/check-renewal-screens.mjs"]);
  runStep("ui slop tells", "node", ["scripts/check-ui-slop.mjs"]);
  runStep(
    "tech stack contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-tech-stack-contract.mjs"))]
  );
  runStep(
    "shared model registry",
    "node",
    ["apps/shared/generate-cs-registry.js", "--check"]
  );
  runStep(
    "coding python game contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-coding-python-game-contract.mjs"))]
  );
  runStep(
    "browser intent contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-browser-intent-contract.mjs"))]
  );
  runStep(
    "chat telegram contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-chat-telegram-contract.mjs"))]
  );
  runStep(
    "middleware build",
    "dotnet",
    ["build", "apps/omnux-middleware/Omnux.Middleware.csproj"]
  );
  runStep(
    "middleware unit tests",
    "dotnet",
    ["test", "apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj"]
  );
  runStep(
    "gateway runtime contract",
    "node",
    [toRelative(path.join(repoRoot, "scripts", "check-gateway-runtime-contract.mjs"))]
  );

  const pythonCommand = resolvePythonCommand();
  runStep(
    "sandbox smoke",
    pythonCommand,
    ["apps/omnux-sandbox/executor.py", "--code", "print('ok')"]
  );

  process.stdout.write("\n[test] ok\n");
}

main();
