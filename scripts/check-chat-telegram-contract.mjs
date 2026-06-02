import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const telegram = read("apps/omnux-middleware/src/CommandService.Telegram.cs");
const telegramClient = read("apps/omnux-middleware/src/TelegramClient.cs");
const telegramCoding = read("apps/omnux-middleware/src/CommandService.Telegram.Coding.cs");
const telegramConversation = read("apps/omnux-middleware/src/CommandService.Telegram.Conversation.cs");
const telegramRefactor = read("apps/omnux-middleware/src/CommandService.Telegram.Refactor.cs");
const telegramDoctor = read("apps/omnux-middleware/src/CommandService.Telegram.Doctor.cs");
const taskSlashCommandHandler = read("apps/omnux-middleware/src/CommandDispatch/TaskSlashCommandHandler.cs");
const doctorSlashCommandHandler = read("apps/omnux-middleware/src/CommandDispatch/DoctorSlashCommandHandler.cs");
const handoffSlashCommandHandler = read("apps/omnux-middleware/src/CommandDispatch/HandoffSlashCommandHandler.cs");
const updateLoop = read("apps/omnux-middleware/src/TelegramUpdateLoop.cs");
const execution = read("apps/omnux-middleware/src/CommandService.Execution.cs");
const executionContext = read("apps/omnux-middleware/src/Application/ExecutionContext.cs");
const contracts = read("apps/omnux-middleware/src/Application/ApplicationServiceContracts.cs");
const inputPrep = read("apps/omnux-middleware/src/CommandService.InputPreparation.cs");
const utils = read("apps/omnux-middleware/src/CommandService.Utils.cs");
const searchPipeline = read("apps/omnux-middleware/src/CommandService.SearchPipeline.cs");
const searchQueryPolicy = read("apps/omnux-middleware/src/Infrastructure/Search/SearchQueryPolicy.cs");
const telegramResponseFormatterPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramResponseFormatterPolicy.cs"
);
const telegramCodingHandoffPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCodingHandoffPolicy.cs"
);
const telegramCodingDownloadPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCodingDownloadPolicy.cs"
);
const telegramCommandHandoffPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCommandHandoffPolicy.cs"
);
const telegramHandoffPresentationPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHandoffPresentationPolicy.cs"
);
const telegramPromptPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramPromptPolicy.cs"
);
const telegramConversationContextPolicy = read(
  "apps/omnux-middleware/src/Infrastructure/Telegram/TelegramConversationContextPolicy.cs"
);
const telegramCodingDownloadPolicyTests = read(
  "apps/omnux-middleware-tests/TelegramCodingDownloadPolicyTests.cs"
);
const telegramClientTests = read("apps/omnux-middleware-tests/TelegramClientTests.cs");
const telegramMobileLiveQa = read("scripts/telegram-mobile-live-qa.mjs");
const telegramGuide = read("docs/텔레그램_봇_가이드.md");
const notebooksHandoffGuide = read("docs/NOTEBOOKS_AND_HANDOFF.md");
const manualRegressionChecklist = read("docs/OMNUX_실환경_수동_최종회귀_체크리스트.md");
const docsIndex = read("docs/README.md");

assert(
  contracts.includes("TelegramTurnContext? telegramContext = null"),
  "ICommandExecutionService가 TelegramTurnContext를 전달해야 합니다."
);
assert(
  execution.includes("_executionContext.CurrentTelegramTurn = telegramContext") &&
    execution.includes("_executionContext.CurrentTelegramTurn = previousTelegramContext") &&
    executionContext.includes("public TelegramTurnContext? CurrentTelegramTurn"),
  "CommandService 실행 중 TelegramTurnContext를 설정하고 복원해야 합니다."
);
assert(
  telegramConversation.includes("ResolveTelegramStateKey") &&
    telegramConversation.includes("_executionContext.CurrentTelegramTurn?.SessionKey"),
  "텔레그램 상태 키는 chat/user 컨텍스트를 우선해야 합니다."
);
assert(
  updateLoop.includes("TryBuildTelegramTurnContext(update, isCallback: false") &&
    updateLoop.includes("TryBuildTelegramTurnContext(update, isCallback: true"),
  "TelegramUpdateLoop가 일반 메시지와 callback에 TelegramTurnContext를 전달해야 합니다."
);
assert(
  updateLoop.includes("IsAllowedCallbackCommand") &&
    updateLoop.includes("StartsWith(\"/skill \"") &&
    updateLoop.includes("StartsWith(\"/think \"") &&
    updateLoop.includes("StartsWith(\"/web \""),
  "callback data는 허용된 텔레그램 명령으로 제한해야 합니다."
);
assert(
  telegram.includes("shouldAllowFastWeb") &&
    telegram.includes("&& !isSkillContextQuery") &&
    telegram.includes("var effectiveWebSearchEnabled = snapshot.Mode == \"single\"") &&
    !telegram.includes("var effectiveWebSearchEnabled = snapshot.Mode == \"single\" ? false : webSearchEnabled"),
  "텔레그램 단일 모드에서 스킬/Think+ 조합의 웹검색 컨텍스트가 무조건 꺼지면 안 됩니다."
);
assert(
  telegram.includes("BuildTelegramFullFidelityPrompt") &&
    telegram.includes("preserveContext") &&
    telegramPromptPolicy.includes("첨부/검색/스킬 컨텍스트를 임의로 줄이지 마세요"),
  "텔레그램은 스킬/검색/첨부 컨텍스트가 있을 때 7줄 압축 프롬프트를 쓰면 안 됩니다."
);
assert(
  telegram.includes("ShouldSkipTelegramDriftRecovery") &&
    telegramConversationContextPolicy.includes("[직전 주제]") &&
    telegram.includes("[Active Skill") &&
    telegram.includes("[Think+ 참고 자료"),
  "텔레그램 off-topic 재요청은 follow-up, 스킬, Think+ 컨텍스트에서 보수적으로 건너뛰어야 합니다."
);
assert(
  !telegram.includes(".Take(safeMaxChars == 0 ? 200") &&
    telegram.includes("TelegramResponseFormatterPolicy.FormatSanitizedResponse") &&
    telegramResponseFormatterPolicy.includes("telegram_response_truncated") &&
    telegramResponseFormatterPolicy.includes("telegram_heavy_output_handoff") &&
    telegramResponseFormatterPolicy.includes("/handoff") &&
    telegramResponseFormatterPolicy.includes("데스크톱"),
  "FormatTelegramResponse가 줄 수 기준으로 조용히 자르거나 handoff 안내 없이 끝나면 안 됩니다."
);
assert(
  telegramCoding.includes("TelegramCodingHandoffPolicy.ShouldUseMobileHandoff") &&
    telegramCoding.includes("TelegramCodingHandoffPolicy.BuildMobileHandoffText") &&
    telegramCodingHandoffPolicy.includes("코딩 결과가 커서 텔레그램에는 요약만 표시합니다.") &&
    telegramCodingHandoffPolicy.includes("/coding files") &&
    telegramCodingHandoffPolicy.includes("/coding download <번호>") &&
    telegramCodingHandoffPolicy.includes("/handoff"),
  "텔레그램 코딩 결과는 대형 변경/워커 결과를 사전 요약+handoff로 제한해야 합니다."
);
assert(
  telegramCoding.includes("TelegramCodingDownloadPolicy.TryResolveChangedFile") &&
    telegramCoding.includes("TelegramCodingDownloadPolicy.IsAllowedDocumentSize") &&
    telegramCoding.includes("TelegramCodingDownloadPolicy.BuildSafeDocumentName") &&
    telegramCodingDownloadPolicy.includes("MaxDocumentBytes = 8 * 1024 * 1024") &&
    telegramCodingDownloadPolicy.includes("TryResolveChangedFile") &&
    telegramCodingDownloadPolicy.includes("ToRelativePath") &&
    telegramCodingDownloadPolicy.includes("BuildSafeDocumentName") &&
    telegramCodingDownloadPolicyTests.includes("TryResolveChangedFileResolvesOneBasedIndex") &&
    telegramCodingDownloadPolicyTests.includes("TryResolveChangedFileResolvesRelativePathOnlyFromChangedFiles") &&
    telegramCodingDownloadPolicyTests.includes("ToRelativePathDoesNotTreatSiblingPrefixAsRunDirectory") &&
    telegramCodingDownloadPolicyTests.includes("IsAllowedDocumentSizeKeepsEightMegabyteLimit"),
  "텔레그램 /coding download는 변경 파일 목록 기반 선택, 안전 파일명, 8MB 상한을 정책과 테스트로 고정해야 합니다."
);
assert(
  telegramClient.includes("internal TelegramClient(RuntimeSettings runtimeSettings, HttpClient httpClient)") &&
    telegramClient.includes("sendDocument") &&
    telegramClientTests.includes("SendDocumentAsyncPostsMultipartDocumentToTelegram") &&
    telegramClientTests.includes("SendDocumentAsyncDoesNotPostWhenTelegramRouteIsMissing") &&
    telegramClientTests.includes("https://api.telegram.org/botbot-token/sendDocument") &&
    telegramClientTests.includes("chat_id") &&
    telegramClientTests.includes("caption") &&
    telegramClientTests.includes("document"),
  "텔레그램 sendDocument는 fake HTTP 단위 테스트로 endpoint/chat_id/caption/document 요청과 미설정 route 차단을 고정해야 합니다."
);
assert(
  telegramMobileLiveQa.includes("OMNUX_TELEGRAM_BOT_TOKEN") &&
    telegramMobileLiveQa.includes("OMNUX_TELEGRAM_CHAT_ID") &&
    telegramMobileLiveQa.includes("find-generic-password") &&
    telegramMobileLiveQa.includes("sendMessage") &&
    telegramMobileLiveQa.includes("sendDocument") &&
    telegramMobileLiveQa.includes("getUpdates") &&
    telegramMobileLiveQa.includes("/omniqa-ok") &&
    telegramMobileLiveQa.includes("inboundTextAckOk") &&
    telegramMobileLiveQa.includes("inboundDocumentEchoOk") &&
    telegramMobileLiveQa.includes("allowed_updates"),
  "텔레그램 모바일 live QA 스크립트는 실제 sendMessage/sendDocument, 모바일 ack, 첨부 echo-back 판정을 포함해야 합니다."
);
assert(
  telegramCommandHandoffPolicy.includes("telegram_command_output_handoff") &&
    telegramCommandHandoffPolicy.includes("ShouldUseCommandHandoff") &&
    telegramCommandHandoffPolicy.includes("BuildCommandHandoffText") &&
    telegramCoding.includes("TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(content)") &&
    telegramRefactor.includes("TelegramCommandHandoffPolicy.ShouldUseCommandHandoff") &&
    taskSlashCommandHandler.includes("FormatTaskOutput(output, isTelegram)") &&
    taskSlashCommandHandler.includes("BuildRawTaskOutputText") &&
    doctorSlashCommandHandler.includes("TelegramCommandHandoffPolicy.ShouldUseCommandHandoff(jsonText") &&
    telegramDoctor.includes("TryHandleViaSlashRouterAsync(text, \"telegram\", cancellationToken)"),
  "텔레그램 명령별 대형 파일/diff/task output/doctor JSON은 본문 직접 출력 대신 요약+handoff 정책을 거쳐야 합니다."
);
assert(
  handoffSlashCommandHandler.includes("TelegramHandoffPresentationPolicy.BuildTelegramHandoffResult") &&
    telegramHandoffPresentationPolicy.includes("handoffPath=") &&
    telegramHandoffPresentationPolicy.includes("Notebooks 화면의 Handoff 패널") &&
    telegramHandoffPresentationPolicy.includes("텔레그램에서는 요약과 트리거만 확인") &&
    !telegramHandoffPresentationPolicy.includes("omnux://"),
  "텔레그램 /handoff 결과는 데스크톱 Handoff 화면과 로컬 handoff 문서 경로를 명확히 안내하고 deep link를 만들지 않아야 합니다."
);
assert(
  docsIndex.includes("텔레그램 봇") &&
    docsIndex.includes("./텔레그램_봇_가이드.md"),
  "문서 인덱스에서 텔레그램 봇 가이드로 연결해야 합니다."
);
assert(
  telegramGuide.includes("업데이트 기준: 2026-06-02") &&
    telegramGuide.includes("모바일 handoff 운영 기준") &&
    telegramGuide.includes("telegram_command_output_handoff") &&
    telegramGuide.includes("telegram_heavy_output_handoff") &&
    telegramGuide.includes("/coding download <번호>") &&
    telegramGuide.includes("TelegramCodingDownloadPolicy") &&
    telegramGuide.includes("TelegramCodingDownloadPolicyTests") &&
    telegramGuide.includes("변경 파일 목록 기반") &&
    telegramGuide.includes("목록 밖 경로 거부") &&
    telegramGuide.includes("8MB") &&
    telegramGuide.includes("TelegramClientTests") &&
    telegramGuide.includes("fake HTTP") &&
    telegramGuide.includes("sendDocument") &&
    telegramGuide.includes("node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180") &&
    telegramGuide.includes("outboundMessageOk") &&
    telegramGuide.includes("outboundDocumentOk") &&
    telegramGuide.includes("inboundTextAckOk") &&
    telegramGuide.includes("inboundDocumentEchoOk") &&
    telegramGuide.includes("echo-back 문서 본문에서 같은 `QA-ID` 확인") &&
    telegramGuide.includes("실제 모바일 QA 체크리스트") &&
    telegramGuide.includes("Deep link 최종 판단") &&
    telegramGuide.includes("Phase 5에서 데스크톱 라우팅과 앱 프로토콜이 확정되면") &&
    telegramGuide.includes("텔레그램 응답에 `omnux://` 링크가 없어야 하며"),
  "텔레그램 가이드는 모바일 handoff 정책, 다운로드, 실제 모바일 QA, deep link 최종 판단을 문서화해야 합니다."
);
assert(
  manualRegressionChecklist.includes("node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180") &&
    manualRegressionChecklist.includes("outboundMessageOk") &&
    manualRegressionChecklist.includes("outboundDocumentOk") &&
    manualRegressionChecklist.includes("inboundTextAckOk") &&
    manualRegressionChecklist.includes("inboundDocumentEchoOk") &&
    manualRegressionChecklist.includes("echo-back 문서 본문 `QA-ID` 확인"),
  "실환경 수동 회귀 체크리스트는 텔레그램 모바일 live QA 완료 판정을 포함해야 합니다."
);
assert(
  notebooksHandoffGuide.includes("업데이트 기준: 2026-06-02") &&
    notebooksHandoffGuide.includes("텔레그램 handoff") &&
    notebooksHandoffGuide.includes("~/.omnux/notebooks/<project-key>/handoff.md") &&
    notebooksHandoffGuide.includes("Notebooks 화면의 Handoff 패널") &&
    notebooksHandoffGuide.includes("Deep link 최종 판단") &&
    notebooksHandoffGuide.includes("`omnux://` 링크를 만들지 않고") &&
    notebooksHandoffGuide.includes("Phase 5에서 데스크톱 라우팅과 앱 프로토콜이 확정되면"),
  "노트북/Handoff 문서는 텔레그램 /handoff가 만드는 로컬 문서, 데스크톱 화면 연결, deep link 최종 판단을 설명해야 합니다."
);
assert(
  updateLoop.includes("cleanedText.Length > 3800") &&
    updateLoop.includes("응답이 길어 별도 메시지로 나눠 보냅니다."),
  "긴 텔레그램 응답은 progress replace 대신 일반 분할/문서 송신 경로로 보내야 합니다."
);
assert(
  inputPrep.includes("canSelectedProviderHandleAttachments") &&
    inputPrep.includes("선택 모델(") &&
    inputPrep.includes("로 먼저 요약했습니다."),
  "첨부는 선택 모델이 직접 못 볼 때 가능한 보조 provider로 요약 후 전달해야 합니다."
);
assert(
  utils.includes("ConversationContextPolicy.LooksLikeExplicitStandaloneQuestion") &&
    utils.includes("LooksLikeStandaloneFreshGreeting(input)") &&
    utils.includes("contextDecisionInput") &&
    utils.includes("새 요청에 자체 주제와 대상이 분명하면 [최근 대화]는 배경으로만 참고"),
  "대화탭은 독립 질문, 독립 인사를 구분하는 공통 맥락 판단 규칙을 가져야 합니다."
);
assert(
  utils.includes("SearchQueryPolicy.LooksLikeStandaloneFreshGreeting") &&
    searchQueryPolicy.includes("\"ㅎㅇ\"") &&
    searchQueryPolicy.includes("\"hello\""),
  "대화탭은 'ㅎㅇ' 같은 독립 인사를 최근 대화 맥락 주입에서 제외해야 합니다."
);
assert(
  telegramConversation.includes("TelegramConversationContextPolicy.BuildFollowupAwareInput") &&
    telegramConversationContextPolicy.includes("FindAnchorTurn") &&
    telegramConversationContextPolicy.includes("[직전 답변]") &&
    telegramConversationContextPolicy.includes("IsContextualFollowup") &&
    telegramConversationContextPolicy.includes("[현재 후속 질문]"),
  "텔레그램 후속 질문은 직전 사용자 주제와 직전 assistant 답변을 함께 전달해야 합니다."
);

console.log("[check-chat-telegram-contract] ok");
