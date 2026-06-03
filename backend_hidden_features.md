# Omni-node Backend Hidden Features

현재 프론트엔드(데스크톱 앱 UI)에는 브릿지(`desktop-message-gateway.ts`)나 버튼이 전혀 연결되어 있지 않지만, **백엔드(미들웨어) 단에 코드로 완벽하게 구현되어 동작 대기 중인 주요 기능 목록**입니다.

## 1. 멀티 에이전트 스웜 및 자율 제어 (Agent Swarm & Control)
* **서브 에이전트 스폰 및 큐잉 (Agent Spawn Queue)**
  * AI가 필요에 따라 스스로 서브 에이전트를 생성(`sessions_spawn`)하고, 이를 큐(`FileAgentSpawnQueueStore`)에 넣어 비동기로 스케줄링하는 멀티 에이전트 시스템.
  * Redis나 외부 메시지 큐(MQ) 서버 없이, 로컬 파일 시스템의 락(`.queue.lease`)을 활용하여 다중 프로세스 간의 에이전트 스폰 대기열을 관리합니다. API Rate Limit(HTTP 429)이나 토큰 한도 초과 시 Exponential Backoff 알고리즘으로 지연 시간을 계산해 큐를 재시도합니다.
* **스웜 안전 장치 (Run Breaker & Cost Ledger)**
  * 에이전트들이 폭주하여 무한 루프를 도는 것을 막는 서킷 브레이커(`AgentSpawnRunBreaker`)와, 하루 API 비용 한도를 초과하지 못하게 막는 회계 장부(`AgentSpawnDailyCostLedger`) 구현.
  * 하루 단위로 소모된 토큰 총량을 기록하며, 기본 하루 60,000 토큰(`DefaultDailyTokenCap`) 상한에 도달하면 추가 스폰을 전면 차단합니다.
* **스폰 토큰 버킷 제어기 (Agent Spawn Admission Limiter)**
  * 여러 서브 에이전트(Swarm)가 무한정 스폰되어 API 비용 폭탄을 맞거나 시스템이 마비되는 것을 막기 위해, 토큰 버킷(Token Bucket) 알고리즘으로 에이전트 생성 요청을 통제합니다(`AgentSpawnAdmissionLimiter`). 초당/분당 충전되는 토큰 한도 내에서만 에이전트가 실행되도록 동시성과 예산을 조율합니다.
* **워크스페이스 롤백 정책 (Workspace Rollback Policy)**
  * 스폰된 서브 에이전트가 코드를 망치거나 작업에 실패했을 경우, 해당 에이전트가 건드린 코드(Diff)를 완벽하게 원상 복구하는 자동 롤백 시스템(`AgentSpawnWorkspaceRollbackPolicy`). 서브 에이전트가 코드를 수정하기 전에 워크스페이스 상태를 스냅샷(`CaptureBaseline`)으로 자동 저장해 두며, 최대 400개 파일 또는 4MB까지 지원합니다.
* **에이전트 세션 스폰 오케스트레이터 (Session Spawn Tool)**
  * 메인 에이전트가 하위 에이전트를 스폰할 때 남은 일일 토큰 예산을 계산하고 큐에 대기열을 만들어 서버 과부하를 막습니다(`SessionSpawnTool`). 파일 롤백 베이스라인을 스냅샷으로 찍어두어 하위 에이전트가 코드를 망치면 즉시 복구할 수 있게 대비합니다.

## 2. 네이티브 CLI 도구 하이재킹 연동 (GitHub Copilot & Codex)
* **GitHub Copilot CLI 및 OpenAI Codex 래퍼 내장**
  * 자체 LLM API 키에만 의존하지 않고, 사용자의 시스템에 설치된 `gh copilot` 및 `codex` CLI 바이너리를 백엔드가 직접 호출하고 결과를 파싱하는 하이재킹 모듈(`CopilotCliWrapper`, `CodexCliWrapper`)이 내장되어 있습니다.
  * **Device Auth 가로채기**: CLI 인증 시 떨어지는 디바이스 코드(Device Code)와 인증 URL을 미들웨어가 정규식으로 낚아채어 처리하는 극단적인 최적화 및 토큰 우회 기술이 사용되었습니다. 시스템에 깔려 있는 CLI의 백그라운드 프로세스를 직접 열어서 `--device-auth` OAuth 로그인 출력을 감청하며, 텍스트 스트림에서 "one-time code" 8자리를 정규식으로 실시간으로 탈취해 프론트엔드로 전송합니다.
* **Copilot Premium 과금 추적기**
  * 사용자의 GitHub 계정에 연동된 Copilot Premium 계정의 월 누적 사용량(Quota)과 잔여 한도, 사용 퍼센티지를 백그라운드에서 주기적으로 크롤링/조회합니다. 로컬 요청 횟수뿐만 아니라 외부 클라이언트에서 발생한 실제 과금 수준의 월간 API Limit을 추적하는 빌링 트래커가 내장되어 있습니다.

## 3. 다국어 유니버설 런타임 엔진 (Universal Code Runner)
* **서버 사이드 컴파일 & 실행**
  * 단순히 코드를 작성해 주는 데서 그치지 않고, 백엔드 내부(`UniversalCodeRunner.cs`)에서 Python, JS, Bash 스크립트는 물론 **C, C++, C#, Java, Kotlin** 같은 컴파일 언어까지 즉시 컴파일하고 실행 결과를 반환받는 강력한 코드 실행 엔진이 내장되어 있습니다. HTML/CSS는 정적 파일로 자동 저장합니다.

## 4. 로컬 SQLite 기반 통합 인덱스 검색망 (Local FTS Memory Index)
* **청크 분할 기반 Full-Text-Search (FTS)**
  * 백엔드는 백그라운드에서 프로젝트 전체 파일(`apps/`, `docs/`, `scripts/`, `workspace/`)과 대화 기록, 메모리 노트들을 스스로 청크(Token) 단위로 쪼개어 로컬 SQLite FTS(Full Text Search) 데이터베이스에 저장합니다. (`MemoryIndexDocumentSync.cs`)
  * 파일이 변경되면 해시(SHA-256)를 비교하여 변경된 부분만 실시간 동기화하며 초고속 코드베이스/대화내역 검색을 지원하는 로컬 검색 엔진을 갖추고 있습니다.

## 5. 자가 증식형 커스텀 스킬 엔진 (Auto-Skill Directive Engine)
* **동적 `SKILL.md` 생성 런타임 (`SkillCreateDirective`)**
  * 사용자가 "~~하는 스킬 만들어줘"라고 요청하면, AI가 출력하는 `<omni:skill>` 디렉티브를 미들웨어가 정규식으로 가로채어(`DirectiveRegex`) 즉시 물리적인 `.omni/skills/<name>/SKILL.md` 파일(YAML Frontmatter 포함)로 컴파일하고 디스크에 저장합니다.
  * 이를 통해 AI가 스스로 규칙과 행동 강령을 코드로 써서 자신(또는 다른 에이전트)에게 주입하는 '자가 증식형' 엔진이 내장되어 있습니다.
* **스킬 파일 시스템 관리 (`SkillFileService`)**
  * `.omni/skills/` 폴더 하위에 생성되는 `SKILL.md` 파일들의 생성, 삭제, 수정을 관리합니다. Markdown YAML Frontmatter를 파싱하여 스킬의 이름과 설명을 추출하고, 프로젝트 스코프(Project)와 글로벌 스코프(Global)를 분리하여 경로 취약점(Path Traversal)을 막아냅니다.

## 6. AI 컨텍스트 메모리 및 핸드오프 (Notebook & Handoff)
* **노트북 및 핸드오프 엔드포인트 (`WsNotebookCommandDispatcher`)**
  * AI가 스스로 학습한 내용(`learning`), 내린 결정(`decision`), 및 검증 결과(`verification`)를 컨텍스트 노트북에 차곡차곡 누적시킬 수 있습니다.
  * 또한 작업을 다른 에이전트나 세션으로 넘길 때 작업 명세서인 `handoff` 문서를 자동 생성하여 맥락 유실을 막아주는 메모리 핸드오프 기능이 내장되어 있습니다.
* **에이전트/디바이스 인수인계 명령어 (`HandoffSlashCommandHandler`)**
  * `/handoff` 슬래시 커맨드를 통해 현재 에이전트의 작업 문맥이나 노트북을 다른 모바일 디바이스(Telegram)나 다른 에이전트로 통째로 넘겨주는 세션 이관 기능을 제공합니다.

## 7. UI 실시간 렌더링 캔버스 엔진 (Canvas Tool)
* **AI 생성 UI 라이브 프리뷰 (`CanvasTool.cs`)**
  * 단순히 코드를 넘겨주는 것을 넘어, 생성된 HTML/JS 코드를 평가(`eval`)하고 실시간으로 스냅샷을 찍어내는(`snapshot`) 캔버스 상태 관리 기능이 존재합니다.
  * 상태 머신을 이용해 UI 컴포넌트(`a2ui_push`, `a2ui_reset`)를 단계별로 렌더링하고 업데이트합니다.
  * `OMNUX_CANVAS_TOOL_MODE` 환경변수로 켜고 끌 수 있으며, 뷰포트 크기, 스냅샷 포맷, 런타임 자바스크립트 실행 내역을 모니터링합니다.

## 8. 음성 인식 및 음성 명령 지원 (STT Audio Transcription)
* **텔레그램 음성 메시지 네이티브 변환 (`SttTranscriptionAdapter.cs`)**
  * 텔레그램 연동 시 사용자가 음성 메시지(.ogg 등)를 보내면, 백엔드에서 자체적으로 OpenAI API(`/audio/transcriptions`)를 호출하여 STT(Speech-to-Text) 텍스트로 변환 후 자연어 명령으로 실행합니다. Base64로 캡처한 뒤 외부 모델 엔진(Whisper 호환 등)으로 전송하여 텍스트로 즉각 변환합니다.

## 9. 노드 기반 시각적 프로그래밍 엔진 (Visual Node Logic Graphs)
* **로직 그래프 런타임 (`CommandService.RoutineLogicGraphRunner.cs`)**
  * 단순한 텍스트 프롬프트를 넘어, 사용자가 시각적인 '노드(Node)'들을 연결하여 프로그램을 짜듯 워크플로우를 만들 수 있는 엔진.
  * 지원 노드: `if`(조건 분기), `chat_orchestration`(협업 채팅), `coding_single`(코드 작성), `memory_search`(메모리 검색), `web_search`(웹 검색), `session_spawn`(하위 에이전트 생성), `telegram_stub`(텔레그램 연동) 등 비주얼 프로그래밍 런타임 탑재.

## 10. Think+ 및 검색 파이프라인 (Search & Grounding)
* **Think+ 모드 및 웹 그라운딩**
  * Gemini API를 활용한 실시간 웹 검색(Grounded Search)을 지원하며, 텔레그램 등을 통해 `/think on`, `/web on` 명령어로 컨텍스트를 즉시 전환합니다. (`CommandService.ThinkPlus.cs`)
* **텔레그램 URL 패스트트랙**
  * 사용자가 텔레그램 방에 URL 링크만 툭 던져도, 무거운 LLM 라우팅을 타지 않고 즉시 웹사이트 내용을 긁어와 요약 및 분석해 주는 전용 패스트트랙 라우터(`TryHandleTelegramUrlFastPathAsync`).
* **검색 증거 팩 및 가드 (Evidence Pack & Guard)**
  * 웹 검색 결과를 무비판적으로 LLM에 던지는 것이 아니라, '증거 팩(Evidence Pack)'으로 묶어 출처와 신뢰도를 검증(`SearchGuard`)한 뒤 팩트 기반의 답변만 조합(`EvidenceFallbackSearchAnswerComposer`)해 내는 검색 방어 파이프라인. 문장 단위 인용구조(`Citation`) 매핑 매칭을 지원합니다.
* **검색 답변 인용 무결성 검증 (`CommandService.Citations.cs`)**
  * AI가 검색 기반 답변을 생성했을 때, 답변 내의 인용구(Citation)가 실제 검색 엔진이 반환한 원본 문서(Snippet)에 존재하는지 크로스체크합니다. 없는 내용을 지어내서 인용(Hallucination)한 것으로 판명되면 답변 출력을 즉시 차단(Fail-closed)하는 가드레일입니다.
* **Gemini Grounding 메타데이터 파서 (`GeminiCitationParser.cs`)**
  * Gemini API가 응답으로 내려주는 JSON 구조 깊숙한 곳의 `groundingChunks`와 `urlContextMetadata`를 파싱하여, 모델이 어떤 웹 URL들을 참조하여 답변을 생성했는지 추적하고 고유한 인용 아이디(Citation ID)를 부여합니다.
* **AI 기반 웹 검색 결과 필터링 (`CommandService.WebResultSelection.cs`)**
  * 검색 엔진에서 반환된 원시 검색 결과를 그대로 사용자에게 주지 않고, 백그라운드 LLM을 호출해 문서가 뉴스 기사인지 단순 홈페이지인지 판별(`IsHardNonArticleCandidate`)하고 사용자 의도(Intent)에 맞게 재정렬합니다.
* **URL/문맥 파악기 및 응답 포맷팅 (`SearchUrlContextPolicy.cs` & `SearchAnswerFormatterPolicy.cs`)**
  * 주어진 URL이 기사인지, API 공식 문서인지, 일반 사이트인지, 깃허브 코드인지 URL 패턴만으로 의도를 파악해 LLM 프롬프트를 다르게 주입합니다.
  * 응답 결과가 나오면 텔레그램, 마크다운 표, 번호가 매겨진 리스트 등 사용자가 요구한 형태나 UI 채널의 특성에 맞춰 문장 구조를 포맷팅합니다.
* **웹 검색 LLM 라우팅 최적화 (`GeminiUrlContextAnswerService.cs`)**
  * 사용자의 질문에 따라 어떤 LLM 모델을 할당할지, 출력 토큰 수는 몇 개로 할지, 타임아웃은 어떻게 제한할지 동적으로 제어하여 검색/요약 속도를 최적화합니다.
* **GitHub 저장소 지식 컨텍스트 로더 (`GitHubRepositoryContextLoader.cs`)**
  * 사용자가 GitHub URL을 입력하면 숨겨진 React Payload(`application/json`)와 `raw.githubusercontent.com` API를 우회 호출하여 README 전체 원문을 강제로 추출합니다. 추출한 본문을 분석해 질문과 연관된 부분만 발췌합니다.

## 11. 브라우저 및 인텐트 제어 (Browser Intent & NLP)
* **Playwright 기반 브라우저 조작 엔진 (`BrowserTool.cs`)**
  * "네이버 접속해", "유튜브 열어줘" 같은 자연어 인텐트를 `CommandService.BrowserIntent.cs`가 정규식으로 분석하여 Playwright 어댑터를 통해 실제 크로미움 브라우저를 백그라운드나 새 탭에서 구동합니다.
  * C# 백엔드 코드 내부에 JavaScript(Node.js) Playwright 구동 스크립트가 리터럴 문자열로 하드코딩되어 있으며, 표준 입출력(stdin/stdout) 기반 JSON 통신으로 로컬 Chromium 탭을 조종(Start, Navigate, Eval, Stop)합니다.
* **자연어 명령어 라우팅 (`NaturalCommandValidationPolicy.cs`)**
  * 사용자의 일상적인 자연어 입력을 분석하여 백엔드의 시스템 명령어(`/web`, `/think`, `/refactor` 등)로 자동 변환하고 실행하는 NLP 분류기.
  * LLM이 변환한 자연어 명령어 매핑 결과의 신뢰도(Confidence)가 `0.72` 미만이거나, 필수 제어 키워드가 포함되어 있지 않으면 오작동으로 간주하고 명령 실행을 차단하는 안전망입니다.
* **텔레그램 자연어 NLP 파서 (`TelegramNaturalCommandPolicy.cs`)**
  * "단일 제공자 groq로 바꿔", "코드 리팩터 적용해줘" 같은 일상적인 자연어 입력을 백엔드 내부의 정규화된 CLI 명령어로 자동 치환하는 정교한 텍스트 파서입니다.

## 12. 고급 코드 조작 및 리팩토링 (Advanced Refactoring)
* **Safe Refactor 워크플로우**
  * 파일을 읽어오고(`refactor_read`), 변경 사항을 미리 시뮬레이션한 뒤(`refactor_preview`), 사용자가 확인하면 최종 적용(`refactor_apply`)하는 안전한 리팩토링 기능.
* **AST 및 LSP 기반 코드 변환**
  * 단순 문자열 치환이 아닌, 추상 구문 트리(AST) 수준의 정밀한 코드 교체(`ast_replace`) 및 언어 서버 프로토콜(LSP) 기반의 심볼 이름 변경(`lsp_rename`) 기능.
* **리팩터링 도구 가용성 탐색기 (`RefactorToolAvailability.cs`)**
  * `ast-grep`, `clangd`, `gopls`, `pyright` 등 시스템에 설치된 언어별 AST 및 LSP 도구 바이너리를 동적으로 스캔하고, 없으면 `npm exec`로 폴백 실행 경로를 자체 계산합니다.
* **리팩터링 미리보기 및 롤백 저장소 (`FileRefactorPreviewStore.cs`)**
  * 에이전트가 코드를 수정할 때 바로 덮어쓰지 않고, TTL이 지정된 미리보기(Preview) 파일과 롤백 스냅샷을 생성합니다. 사용자가 승인하기 전까지 코드를 임시로 안전하게 격리합니다.

## 13. 지능형 제어 및 오케스트레이션 (AI Orchestration)
* **오케스트레이션 모드**
  * 단순한 1:1 채팅이나 코드 생성을 넘어 여러 에이전트/로직이 협력하여 태스크를 수행하는 모드.
* **LLM 라우팅 제어 (`LlmRouter.cs`)**
  * 시스템에 들어오는 프롬프트의 의도(OS Control, Query System, Dynamic Code)를 휴리스틱/LLM으로 분류하여, 어떤 백엔드 엔진(Gemini, Cerebras, Codex)을 태울지 동적으로 라우팅하는 오케스트레이션 코어. 토큰 사용량과 API Rate Limit까지 메모리에서 추적합니다.

## 14. 에이전트 플래닝 및 태스크 그래프 (Planning & Tasks)
* **에이전트 플래닝 체인**
  * AI 에이전트가 복잡한 작업을 스스로 계획, 리뷰, 승인 대기 후 실행하며, 다른 에이전트에게 제어권을 넘기는 시스템.
* **태스크 그래프 제어 (`TaskSlashCommandHandler.cs`)**
  * 병렬/순차 작업 노드들을 그래프 형태로 연결하고, 실행 중 실패 시 재시도, 중단 및 재개 기능. `/task status`, `/task run`, `/task output` 등의 명령어로 백그라운드 워크플로우의 노드별 상태를 조회하고 제어합니다.

## 15. 백그라운드 자동화 및 도구 (Background & Tools)
* **스케줄러 (`RoutineSchedulePolicy.cs`)**
  * 사용자가 지정한 타임존을 기준으로 일별, 주별(요일 지정), 월별 스케줄을 처리합니다. 결과의 해시를 비교(`ComputeOutputFingerprint`)하여 이전 실행과 차이가 있을 때만 알림을 보내는 정책을 자체 연산합니다.
* **닥터 자동 수정 (`DoctorSlashCommandHandler.cs`)**
  * `/doctor` 슬래시 커맨드를 통해 백엔드 미들웨어의 상태, API 키 유효성, 외부 의존성(Node.js, Playwright 등)의 설치 여부를 스스로 진단하여 리포트를 뽑아내고, 수정안을 제시하고 즉시 고치는 자가 치유 기능.

## 16. 데이터 동기화 및 유지 관리 (Sync & Maintenance)
* **클라우드 동기화 (`GistSyncApplicationService.cs`)**
  * 프로젝트 전체를 Zip으로 압축한 뒤 Base64 포맷(`omnux-portable-package.b64`)으로 인코딩하여 GitHub Gist에 비공개로 자동 업로드합니다. Gist ID로 전체 환경을 원클릭 롤백/다운로드할 수 있습니다.
* **메모리 인덱스 재구축**
  * 대화 기록 검색용 인덱스 엔진을 통째로 갈아엎고 새로 구축하는 툴.

## 17. 심층 보안 및 프롬프트 인젝션 방어 (Deep Security Guards)
* **웹 컨텐츠 프롬프트 인젝션 방어 (`ExternalContentGuard.cs`)**
  * 웹 검색/크롤링 결과물을 LLM에 전달할 때 악의적인 해킹 명령(Prompt Injection)이 섞여 있을 것에 대비하여, 매번 무작위 생성되는 헥스 마커(Marker) ID로 안전 경계를 치는 보안 장치. 공격자가 악의적으로 삽입한 마커를 탐지하여 무력화(`ReplaceBoundaryMarkers`)하며, 난수화된 마커 ID와 `SECURITY NOTICE` 래퍼로 외부 데이터를 샌드박싱합니다.
* **운영체제 프로세스 킬 가드 (`KillTargetGuardPolicy.cs`)**
  * 에이전트가 임의의 시스템 프로세스를 함부로 종료하는 것을 막기 위한 가드 모듈. 명령어 실행 전 현재 프로세스와 타겟 프로세스의 UID를 강제 대조하고, 사전에 승인된 허용 목록(Allowlist)과 이름이 일치할 때만 `kill` 명령을 허용합니다.
* **API Key 네이티브 키체인 연동 (`SecretLoader.cs`)**
  * macOS에서는 `/usr/bin/security` 기반의 네이티브 키체인(Keychain)에 직접 접근해 API 키를 저장/조회합니다. 로컬 파일 캐시를 쓸 때도 파일의 유닉스 권한이 `0600`보다 느슨하면 로드를 강제로 거부하여 타 계정에서의 무단 접근을 원천 차단합니다.

## 18. ACP 기반 이기종 에이전트 바인딩 (Agent Context Protocol)
* **`AcpSessionBindingAdapter.cs` 모듈**
  * 미들웨어에서 생성된 세션을 타사 CLI나 어댑터 스크립트(예: `acp-adapter-codex-exec.js`)에 파이프로 연결하여, 우선순위(Command Priority)나 워크스페이스 맥락 정보를 다른 에이전트 시스템에 전달하는 브릿지 프로토콜(ACP)이 내장되어 있습니다.

## 19. LLM 스트리밍 무한 이어쓰기 (Infinite Streaming Continuity)
* **`ChatStreamingContinuation.cs` 모듈**
  * 생성 모델이 문맥(max_tokens) 한계에 부딪히거나 지연으로 답변이 잘렸을 때, 백엔드가 이를 감지하고 "이미 작성된 내용은 반복하지 말고, 바로 다음 문장부터 이어서 작성하라"는 꼬리 프롬프트를 자동으로 주입하여, 사용자가 잘림 현상을 전혀 느끼지 못하고 끝까지 결과물을 받게 해줍니다.

## 20. LLM 출력물 실시간 정제 클리너 (Output Sanitizer Policy)
* **`ChatOutputSanitizerPolicy.cs` 모듈**
  * AI가 뱉어내는 깨진 마크다운 표, 짝이 안 맞는 굵게 처리(`**`), 불필요한 추론 과정 찌꺼기(`$` 태그 등), `fetch_copilot_cli_documentation` 같은 메타 텍스트를 정규식 엔진으로 실시간 필터링하여 프론트엔드로 내보내기 직전에 매끄럽게 교정합니다.

## 21. 예외 복구 및 결정론적 코드 자동 수리 (Deterministic Auto-Repair)
* **`CodingApplicationService.CodingDeterministicRepairs.cs` 모듈**
  * LLM이 작성한 코드가 문법 에러나 런타임 예외를 발생시켰을 때, 백그라운드에서 이를 즉시 감지하고 결정론적 복구 템플릿을 기반으로 코드를 자동 롤백 및 수정하여 자체 복구하는 셀프 힐링(Self-healing) 기능이 탑재되어 있습니다. `CodingDeterministicStructuredRepairPolicy`, `CodingDeterministicOutputRepairPolicy`, `CodingDeterministicScaffoldPolicy` 등 세분화된 복구 정책이 동작합니다.

## 22. 백엔드 가비지 컬렉터 및 자동 클리너 (Automatic Project Cleanup)
* **`CleanupService.cs` 모듈**
  * 미들웨어 시스템이나 에이전트들이 뱉어낸 무수한 임시 파일이나 `bin`, `obj`, `.runtime`, `.DS_Store` 같은 찌꺼기 산출물들을 실시간으로 추적하여 프로젝트 용량이 비대해지는 것을 방지하고 디스크를 청소하는 내장 가비지 컬렉터입니다.

## 23. 코드 품질 게이트 및 다국어 자동 검증 엔진 (Coding Quality Gate & Auto-Verification)
* **`CodingApplicationService.CodingQuality.cs` & `CodingApplicationService.CodingVerification.cs` 모듈**
  * 에이전트가 코드를 짰다고 무조건 통과시키는 게 아니라, 백엔드가 직접 코드를 스캔하여 "더미/TODO 코드가 남아있는지", "CLI 입력 처리가 되어 있는지", "의미 없는 print 시뮬레이션인지"를 점수(Score)화하여 **품질 게이트(Quality Gate)**를 매깁니다.
  * React/Vite, C++, Java, Go, Rust, Swift 등 수십 개의 언어별로 빌드 명령을 동적으로 구성하여 런타임에서 강제로 빌드 및 실행 검증을 거친 후, 콘솔 출력물(Expected Output)과 비교하는 검증 파이프라인이 구비되어 있습니다.

## 24. 코드 실행 안전 가드 (Execution Safety Guard)
* **`CodingExecutionSafetyPolicy.cs` 모듈**
  * AI가 생성한 셸 스크립트에 `sudo`, `rm -rf`, `chmod -R`, `curl | bash` 등 시스템에 치명적인 파괴적 명령어가 들어있는지 정규식(`DangerousGeneratedRunCommandRegex`)으로 분석하여 백엔드 레벨에서 미리 차단하는 샌드박싱 방어 기제입니다.

## 25. 컨텍스트 관성 타파 및 답변 재시도 가드 (Context Inertia Breaker)
* **`ChatRetryGuardPolicy.cs` 모듈**
  * LLM이 이전 대화의 맥락에 갇혀(관성) 사용자의 새로운 질문에 동문서답을 하거나 엉뚱한 설명을 늘어놓을 경우, 백엔드가 이를 실시간으로 감지(`ShouldRetryWithoutHistory`)하여 출력물을 강제 폐기합니다.
  * 그런 다음 "이전 대화의 형식을 관성으로 따라가지 말고 새 요청에만 답변하라"는 시스템 프롬프트를 주입해 에이전트 스스로 답변을 재시도하게 만드는 자가 치유(Self-retry) 장치입니다.

## 26. 텔레그램 기반 2FA OTP 인증 (Telegram OTP Auth)
* **`AuthSessionGateway.cs` 모듈**
  * 사용자가 웹사이트나 리모트 대시보드 환경에서 백엔드 미들웨어로 WebSocket을 연결하려 할 때, 백엔드가 사용자의 텔레그램 봇으로 1회용 비밀번호(OTP)를 전송합니다.
  * 이 OTP를 입력해야만 세션 인증(Auth)이 통과되도록 설계된 2FA(이중 인증) 보안 시스템이 백엔드 단에 구현되어 있습니다.

## 27. 자율 주행 브라우저 및 데스크톱 제어 에이전트 (Computer Use Agent)
* **`RoutineApplicationService.RoutineExecution.cs` 내 브라우저 에이전트 모듈**
  * 백그라운드 루틴(`browser_agent` 모드)이 실행될 때 플레이라이트(`playwright_only`)로 웹 브라우저를 직접 띄우고 조작합니다.
  * macOS 환경의 경우 **데스크톱 제어(`desktop_control`)** 권한을 부여받아, 화면을 캡처하고 마우스 커서를 직접 움직여 네이티브 앱을 통제하는 자율 주행 Computer Use 에이전트 로직이 루틴 스케줄러 안에 내장되어 있습니다.

## 28. 텔레그램 스킬 단축키 시스템 (Telegram Skill Alias)
* **`CommandService.Telegram.SkillAliases.cs` 모듈**
  * 긴 스킬 이름을 일일이 치기 귀찮을 때, 사용자가 텔레그램에서 `/skill quick <별명> <스킬이름>` 명령어로 단축키를 지정해 둘 수 있습니다.

## 29. NVIDIA NIM 롱폴링 제어 (Long-Polling Async Model)
* **`NvidiaStatusPollingAdapter.cs` 모듈**
  * 초거대 AI 모델(NVIDIA NIM 서버)에 무거운 작업을 던져놓고 202 Accepted 응답을 받은 뒤, 작업이 완료될 때까지 `requestId` 기반으로 백엔드에서 롱폴링(Long-polling) 상태 추적을 수행하며 끊기지 않게 결과를 받아오는 비동기 폴링 어댑터가 내장되어 있습니다.

## 30. 백엔드 보안 가드 경보 웹훅 및 로그 수집기 (Guard Alert Dispatcher)
* **`WebSocketGateway.cs` 내 Guard Alert Dispatch 모듈**
  * 검색이나 코드 생성 중에 AI 응답이 보안 정책에 의해 차단(Fail-closed)되었을 때, 즉시 외부 시스템으로 `omnux.guard_alert.summary` 이벤트 규격의 JSON 페이로드 웹훅을 발송합니다.
  * 환경 변수를 통해 웹훅 엔드포인트(`GuardAlertWebhookUrl`)나 로그 수집기(`GuardAlertLogCollectorUrl`)가 등록되어 있으면 최대 3번까지 재시도하며 타겟 서버에 비동기로 경보를 발송하는 모니터링 시스템입니다.

## 31. 코딩 프리뷰 라이브 서버 및 IFrame 샌드박스 (Coding Preview Live Server)
* **`GatewayApiEndpoint.cs` 내 `/api/coding-preview/` 라우팅 로직**
  * 코딩 에이전트가 로컬에서 HTML, JS, CSS 등을 작성했을 때, 사용자가 브라우저에서 안전하게 IFrame으로 미리보기 할 수 있도록 내장 HTTP 서버 라우팅을 제공합니다.
  * `X-Frame-Options: SAMEORIGIN` 헤더와 결합하여, 백엔드가 직접 코딩 결과물을 렌더링 가능한 웹 서버 역할을 수행하는 동시에 메인 컨텍스트와 격리된 라이브 뷰어를 제공합니다.

## 32. 단발성 UI/게임 생성 가속기 (One-Shot UI Clone Mode)
* **`CodingApplicationService.CodingProfiles.cs` 내 `ShouldUseOneShotMode` 로직**
  * 프론트엔드 UI(React-Vite, HTML, CSS 등)를 짜거나 간단한 브라우저 아케이드 게임을 만들어 달라는 요청을 감지하면, 불필요한 루프를 생략하고 한 번에 코드를 쏟아붓는 `OneShotUiClone` 모드를 발동시킵니다.
  * 토큰 한도(`CodingMaxOutputTokens`)를 순간적으로 최대치로 끌어올려 코딩 에이전트가 단발성으로 강력하게 화면을 찍어내도록 가속합니다.

## 33. 다중 모델 코딩 페르소나 프로파일러 (LLM Coding Persona Profiles)
* **`CodingApplicationService.CodingProfiles.cs` 모듈**
  * 백엔드에 꽂히는 모델(Groq, Codex, Copilot, Gemini, Cerebras 등)의 특성에 맞춰 에이전트의 구동 방식을 런타임에 완전히 갈아끼웁니다. 추론 속도가 빠른 Groq은 타임아웃을 35초로 줄이고, Codex/Copilot은 해킹 래퍼를 거치게 하며, Flash 계열은 `UseCompactLoopPrompt`를 켜는 식의 스위칭 시스템입니다.

## 34. 텔레그램 메시지 오프라인 재전송 아웃박스 (Telegram Offline Outbox Queue)
* **`FileTelegramReplyOutboxStore.cs` 모듈**
  * 네트워크 단절이나 텔레그램 서버 장애로 봇 응답이 실패할 경우, 메시지를 증발시키지 않고 오프라인 아웃박스 큐에 저장한 뒤 점진적으로 재전송을 시도하는 강건한 메시징 아키텍처입니다.

## 35. AI 안전성 재시도 타임라인 추적기 (Guard Retry Timeline Store)
* **`GuardRetryTimelineStore.cs` 모듈**
  * 유해성 필터, 프롬프트 인젝션 방어, 출력 오류 등으로 인해 LLM이 멈추거나 백그라운드에서 재시도한 모든 이력을 분 단위 시간 버킷(Time bucket)으로 추적합니다. 대시보드나 활동 로그에 "최근 60분 내 오류 복구 지표" 등을 시각화할 수 있도록 원격 JSON 컨텍스트를 메모리에 쌓는 감시자입니다.

## 36. 로컬 프로젝트 워크스페이스 관리기 (Project Workspace Manager)
* **`WsProjectCommandDispatcher.cs` 모듈**
  * 프론트엔드가 요구하는 `project_create/touch/delete` 웹소켓 이벤트를 처리하며, 클라우드 DB가 아닌 사용자의 로컬 물리 디렉토리를 프로젝트(Workspace)로 매핑하고 마지막 접속 시각(Touch)을 갱신하는 상태 관리 허브입니다. HTTP REST가 아닌 WebSocket Event-driven 방식으로 UI 반응성을 극대화했습니다.

## 37. 모바일 응답 렌더링 포맷터 (Telegram Mobile Response Formatter)
* **`TelegramResponseFormatterPolicy.cs` 모듈**
  * 1,600자가 넘거나 28줄이 넘는 무거운 코드 diff, 로그 출력 등을 감지하면 모바일 환경(텔레그램)이 다운되지 않도록 가운데를 자르고 `...(telegram_heavy_output_handoff)` 마커를 삽입하여 데스크톱 앱으로 인수인계(Handoff)를 유도하는 지능형 포맷터입니다. 깨진 마크다운 표, 중첩된 리스트, 무의미한 들여쓰기 등을 모바일 가독성에 맞춰 실시간으로 재배열합니다.

## 38. 대화 맥락 추적 및 보정 엔진 (Context-Aware Follow-up Engine)
* **`TelegramConversationContextPolicy.cs` 모듈**
  * 사용자가 대화 중 "그건?", "왜?", "다시 찾아봐" 같이 주어가 생략된 약한 후속 질문(Weak Followup)을 던졌을 때, 이전 턴(Turn)의 Assistant 응답을 추적해 `[직전 주제]` 컨텍스트로 프롬프트에 주입하여 LLM이 맥락을 잃지 않도록 보조합니다. 사용자가 "아니라", "정정" 같은 단어를 쓰면 오답 교정용 특수 프롬프트를 주입합니다.

## 39. POSIX 자원 제한 샌드박스 (Python Sandbox with Resource Limits)
* **`apps/omnux-sandbox/executor.py`**
  * AI가 작성한 파이썬 코드를 실행할 때 호스트 시스템과 격리된 샌드박스를 통해 실행하며, 무한 루프나 메모리 누수 방지를 위해 POSIX `resource` 모듈로 메모리(200MB)와 CPU(10초) 하드 리미트를 강제합니다. 환경변수도 최소 세트만 전달하여 격리합니다.

## 40. 실시간 양방향 통합 웹소켓 게이트웨이 (WebSocket Integration Gateway)
* **`WebSocketGateway.cs` 모듈**
  * 백엔드 최전선 관문입니다. 인증, 세션 수명 주기, Rate Limit(DDoS 방어), 14개가 넘는 서브 디스패처(`WsTool`, `WsRoutine`, `WsRefactor` 등) 관리, `answer-guard blocked` 같은 LLM 실패 로그까지 가로채어 텔레그램이나 UI로 경고를 뿌리는 메시지 버스입니다.
