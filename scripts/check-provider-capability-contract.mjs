import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(repoRoot, relativePath), "utf8");

let assertions = 0;
function check(condition, message) {
  assertions += 1;
  assert.ok(condition, message);
}

function main() {
  const registry = JSON.parse(read("apps/shared/model-registry.json"));

  // ── 능력표가 단일 소스에 있고, 제공자 목록과 어긋나지 않는다 ──
  check(registry.capabilities, "model-registry.json 에 capabilities 가 있어야 한다");
  const providerKeys = Object.keys(registry.providers).sort();
  const capabilityKeys = Object.keys(registry.capabilities.providers).sort();
  assertions += 1;
  assert.deepEqual(
    capabilityKeys,
    providerKeys,
    "capabilities.providers 는 providers 와 같은 키를 가져야 한다"
  );

  for (const [provider, rules] of Object.entries(registry.capabilities.providers)) {
    check(Array.isArray(rules) && rules.length > 0, `${provider}: 규칙이 최소 1개 있어야 한다`);
    for (const rule of rules) {
      check(typeof rule.match === "string" && rule.match.length > 0, `${provider}: match 가 필요하다`);
      check(
        registry.capabilities.webSearchModes.includes(rule.webSearch),
        `${provider}: 알 수 없는 webSearch 값 ${rule.webSearch}`
      );
      check(
        registry.capabilities.reasoningModes.includes(rule.reasoning),
        `${provider}: 알 수 없는 reasoning 값 ${rule.reasoning}`
      );
      if (rule.reasoning !== "none") {
        check(
          Array.isArray(rule.levels) && rule.levels.length > 0,
          `${provider}: 추론 강도를 지원하면 levels 가 있어야 한다`
        );
        check(
          rule.levels.includes(rule.defaultLevel),
          `${provider}: defaultLevel 은 levels 안에 있어야 한다`
        );
      }
    }

    // 마지막 규칙은 모든 모델을 받는 기본값이어야 한다(미확인 모델이 규칙 밖으로 새지 않게).
    check(rules[rules.length - 1].match === ".", `${provider}: 마지막 규칙은 "." 기본값이어야 한다`);
  }

  // ── 실키 호출로 확인한 사실이 뒤집히지 않았는지 ──
  const groq = registry.capabilities.providers.groq;
  check(
    groq.some((rule) => rule.match.includes("gpt-oss") && rule.webSearch === "groq_browser_search"),
    "groq gpt-oss 는 browser_search 를 쓴다"
  );
  check(
    groq.some((rule) => rule.match.includes("compound") && rule.webSearch === "groq_compound"),
    "groq compound 는 compound_custom 을 쓴다"
  );
  check(
    registry.capabilities.providers.cerebras.every((rule) => rule.webSearch === "none"),
    "cerebras 는 서버측 웹 검색을 지원하지 않는다(tools 가 function 전용)"
  );
  check(
    registry.capabilities.providers.gemini.every((rule) => rule.webSearch === "gemini_google_search"),
    "gemini 는 google_search 그라운딩을 쓴다"
  );
  check(
    !registry.providers.nvidia.fallback.includes("openai/gpt-oss-120b"),
    "NVIDIA 에서 EOL 된 openai/gpt-oss-120b 는 목록에 두지 않는다"
  );

  // ── 미들웨어가 능력표대로 라우팅한다 ──
  const composition = read("apps/omnux-middleware/src/CommandService.SearchAnswerComposition.cs");
  check(
    composition.includes("TryComposeNativeProviderWebAnswerAsync"),
    "선택한 제공자의 네이티브 웹 검색을 먼저 시도해야 한다"
  );
  check(
    composition.includes("TryComposeSelectedProviderWithEvidenceAsync"),
    "네이티브가 없으면 근거를 모아 선택 모델이 직접 답해야 한다"
  );
  check(
    composition.indexOf("TryComposeNativeProviderWebAnswerAsync")
      < composition.indexOf("_llmRouter.HasGeminiApiKey()"),
    "Gemini grounding 은 네이티브 경로 뒤의 폴백이어야 한다"
  );

  const tuning = read("apps/omnux-middleware/src/LlmTuning.cs");
  for (const needle of [
    "reasoning_effort",
    "chat_template_kwargs",
    "browser_search",
    "compound_custom",
    "thinkingConfig"
  ]) {
    check(tuning.includes(needle), `LlmTuning 이 ${needle} 을 실어야 한다`);
  }

  // ── 조절값이 WS 계약을 통과한다(수동 파서라 빠뜨리기 쉽다) ──
  const gateway = read("apps/omnux-middleware/src/WebSocketGateway.cs");
  for (const field of ["reasoningEffort", "contextBudget", "sessionId", "data", "columns", "rows"]) {
    check(gateway.includes(`TryGetProperty("${field}"`), `WS 파서가 ${field} 를 읽어야 한다`);
  }

  // ── 빌드탭 실행이 진짜 터미널을 붙인다 ──
  const terminal = read("apps/omnux-middleware/src/Infrastructure/Process/InteractiveTerminalSession.cs");
  check(terminal.includes("script -qfec"), "리눅스에서는 util-linux script 로 PTY 를 붙인다");
  check(terminal.includes("script -q /dev/null"), "macOS 에서는 BSD script 로 PTY 를 붙인다");
  check(terminal.includes("stty rows"), "터미널 크기를 프로그램에 알려야 한다");

  const runPlan = read("apps/omnux-middleware/src/Application/CodingApplicationService.CodingInteractiveRun.cs");
  check(
    runPlan.includes("SDL_VIDEODRIVER") && runPlan.includes("RemoveEnvironmentMarker"),
    "헤드리스 스모크용 SDL_VIDEODRIVER 가 실제 실행에 새지 않아야 한다"
  );
  check(runPlan.includes("WAYLAND_DISPLAY"), "GUI 실행은 사용자 디스플레이 환경을 물려받아야 한다");

  // ── 제공자 실패를 계획 파싱 실패로 오인하지 않는다 ──
  const loop = read("apps/omnux-middleware/src/Application/CodingApplicationService.CodingLoop.cs");
  check(
    loop.includes("CodingProviderFailurePolicy.Classify"),
    "코딩 루프가 제공자 실패를 먼저 가려내야 한다"
  );
  check(loop.includes("EnsureCodingTaskSignalsAsync"), "요청 성격을 요청당 1회 판정해야 한다");

  // ── 한국어 질의가 검색에서 빠지지 않는다 ──
  const chat = read("apps/omnux-middleware/src/CommandService.Chat.cs");
  check(
    !chat.includes("!webDecision.DecisionSucceeded && SearchQueryPolicy.LooksLikeRealtimeQuestion"),
    "판정 실패 폴백이 영어 토큰에 걸려 있으면 안 된다"
  );
  const appConfig = read("apps/omnux-middleware/src/AppConfig.cs");
  const decisionTimeout = /WebDecisionTimeoutMs \{ get; init; \} = (\d+);/.exec(appConfig);
  check(decisionTimeout != null, "WebDecisionTimeoutMs 기본값을 찾아야 한다");
  check(
    Number(decisionTimeout[1]) >= 2000,
    "web 판정 타임아웃이 2초 미만이면 Groq 외 제공자는 항상 타임아웃한다"
  );

  console.log(`[provider-capability-contract] ok assertions=${assertions}`);
}

main();
