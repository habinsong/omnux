import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let assertionCount = 0;

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(text.includes(needle), `${label}: expected to include ${needle}`);
}

function assertNotIncludes(text, needle, label) {
  assertionCount += 1;
  assert.ok(!text.includes(needle), `${label}: expected not to include ${needle}`);
}

function assertEmpty(text, label) {
  assertionCount += 1;
  assert.equal(text, "", `${label}: expected empty text`);
}

function assertPathMissing(relativePath, label) {
  assertionCount += 1;
  assert.equal(existsSync(path.join(repoRoot, relativePath)), false, `${label}: ${relativePath}`);
}

const coreRuntimeClient = read("apps/omnux-middleware/src/CoreRuntimeClient.cs");
const coreDoctor = read("apps/omnux-middleware/src/Application/Doctor/Checks/CoreSocketDoctorCheck.cs");
const settingsService = read("apps/omnux-middleware/src/Application/SettingsApplicationService.cs");
const commandPostRouting = read("apps/omnux-middleware/src/CommandService.Execution.PostRouting.cs");
const telegramLlmControl = read("apps/omnux-middleware/src/CommandService.Telegram.LlmControl.cs");
const program = read("apps/omnux-middleware/src/Program.cs");
const appConfig = read("apps/omnux-middleware/src/AppConfig.cs");
const pathResolver = read("apps/omnux-middleware/src/Infrastructure/Paths/StatePathResolver.cs");
const runTests = read("scripts/run-omnux-tests.mjs");
const repoHygiene = read("scripts/check-repo-hygiene.mjs");
const shellScript = read("scripts/omnux");
const powershellScript = read("scripts/omnux.ps1");
const developPlan = read("develop.md");
const readme = read("README.md");
const readmeEn = read("README.en.md");
const quickstart = read("docs/QUICKSTART.md");
const quickstartEn = read("docs/en/quickstart.md");
const validation = read("docs/검증_가이드.md");
const validationEn = read("docs/en/validation.md");
const directoryGuide = read("docs/디렉터리_가이드.md");
const directoryGuideEn = read("docs/en/directory-guide.md");
const architectureDoc = read("docs/아키텍처_흐름.md");
const architectureDocEn = read("docs/en/architecture.md");
const techStack = read("docs/기술스택_정리.md");
const techStackEn = read("docs/en/tech-stack.md");

for (const relativePath of [
  "apps/omnux-core",
  "omnux-core",
  "omninode-core",
  "apps/omnux-middleware/src/UdsCoreClient.cs",
  "apps/omnux-middleware/src/CoreProcessBootstrapper.cs",
  "apps/omnux-middleware/src/CoreAuthToken.cs"
]) {
  assertPathMissing(relativePath, "legacy C core path must stay removed");
}

assertIncludes(coreRuntimeClient, "public interface ICoreRuntimeClient", "core runtime has a stable interface");
assertIncludes(coreRuntimeClient, "public sealed class DotNetCoreRuntimeClient", "dotnet core runtime client is the only runtime implementation");
assertIncludes(coreRuntimeClient, "GetMetricsAsync", "dotnet core runtime exposes metrics");
assertIncludes(coreRuntimeClient, "KillAsync", "dotnet core runtime exposes kill");
assertIncludes(coreRuntimeClient, "Process.GetProcessById", "dotnet core runtime owns guarded process lookup");
assertIncludes(coreRuntimeClient, "process.Kill(entireProcessTree: false)", "dotnet core runtime kills only the requested process");
assertIncludes(coreRuntimeClient, "getloadavg", "dotnet core runtime reads POSIX load average");
assertIncludes(coreRuntimeClient, "GlobalMemoryStatusEx", "dotnet core runtime reads Windows memory stats");

assertIncludes(coreDoctor, "core_runtime", "doctor checks dotnet core runtime");
assertIncludes(coreDoctor, "runtime=dotnet", "doctor reports dotnet runtime detail");
assertIncludes(program, "new DotNetCoreRuntimeClient()", "program uses dotnet core runtime");
assertIncludes(program, "[core-runtime] .NET core runtime is active.", "program reports dotnet runtime startup");
assertNotIncludes(program, "IsLegacyCoreBootstrapEnabled", "program must not expose legacy core bootstrap gate");
assertNotIncludes(program, "OMNUX_ENABLE_LEGACY_CORE_BOOTSTRAP", "program must not support legacy core bootstrap env");
assertNotIncludes(program, "CoreAuthToken", "program must not create legacy core auth tokens");
assertNotIncludes(program, "UdsCoreClient", "program must not construct legacy UDS clients");
assertNotIncludes(program, "CoreProcessBootstrapper", "program must not bootstrap legacy C core");
assertNotIncludes(appConfig, "CoreSocketPath", "app config must not expose legacy core socket path");
assertNotIncludes(appConfig, "OMNUX_CORE_SOCKET_PATH", "app config must not read legacy core socket env");
assertNotIncludes(pathResolver, "CoreSocketPath", "state path resolver must not expose legacy core socket path");
assertNotIncludes(pathResolver, "omninode_core", "state path resolver must not preserve legacy core socket alias");
assertNotIncludes(pathResolver, "omnux_core", "state path resolver must not preserve core socket path");

assertIncludes(settingsService, "GetMetricsAsync", "settings can read dotnet runtime metrics");
assertIncludes(commandPostRouting, "text.Equals(\"/metrics\"", "local metrics command remains explicit");
assertIncludes(commandPostRouting, "KillCommandPolicy.TryParse", "local kill command remains policy-gated");
assertIncludes(commandPostRouting, "ValidateKillTargetAsync", "local kill command remains guarded");
assertIncludes(commandPostRouting, "RouterIntent.QuerySystem", "query system can still read metrics");
assertIncludes(telegramLlmControl, "ExecuteTelegramMetricsPseudoCommandAsync", "telegram metrics path remains explicit");
assertIncludes(telegramLlmControl, "ExecuteTelegramKillPseudoCommandAsync", "telegram kill path remains explicit");
assertIncludes(telegramLlmControl, "_coreClient.GetMetricsAsync", "telegram metrics path uses core runtime client");
assertIncludes(telegramLlmControl, "_coreClient.KillAsync", "telegram kill path uses core runtime client");

for (const text of [shellScript, powershellScript, repoHygiene]) {
  assertNotIncludes(text, "apps/omnux-core", "scripts must not reference removed core directory");
  assertNotIncludes(text, "omnux_core", "scripts must not reference removed core binary");
  assertNotIncludes(text, "omninode-core", "scripts must not require removed legacy core alias");
}

assertEmpty(readme, "README stays empty until public copy is rewritten");
assertNotIncludes(readmeEn, "legacy C core", "README.en must not document removed legacy core");
assertNotIncludes(quickstart, "C 컴파일러", "quickstart must not require C compiler");
assertNotIncludes(quickstart, "legacy C core", "quickstart must not document removed legacy core");
assertNotIncludes(quickstartEn, "C compiler", "english quickstart must not require C compiler");
assertNotIncludes(validation, "make -C apps/omnux-core", "validation guide must not include removed core build");
assertNotIncludes(validationEn, "make -C apps/omnux-core", "english validation guide must not include removed core build");
assertNotIncludes(directoryGuide, "apps/omnux-core", "directory guide must not list removed core directory");
assertNotIncludes(directoryGuideEn, "apps/omnux-core", "english directory guide must not list removed core directory");
assertNotIncludes(architectureDoc, "C core daemon", "architecture doc must not route through C core");
assertNotIncludes(architectureDocEn, "C core IPC", "english architecture doc must not document removed C core IPC");
assertNotIncludes(techStack, "C11", "tech stack must not keep C11 as active stack");
assertNotIncludes(techStackEn, "C11", "english tech stack must not keep C11 as active stack");

assertIncludes(
  runTests,
  "scripts\", \"check-core-daemon-boundary-contract.mjs",
  "npm test runs the core daemon boundary contract"
);
assertIncludes(developPlan, "8번 내부 진행률: 100% 완료", "develop plan records item 8 full completion");
assertIncludes(developPlan, "C11 코어 데몬 잔재 완전 삭제", "develop plan records legacy core removal");
assertIncludes(developPlan, "남은 회차: 치명적 결함 12선 기준 최소 3회", "develop plan updates remaining loop estimate");

process.stdout.write(`[core-daemon-boundary-contract] ok assertions=${assertionCount}\n`);
