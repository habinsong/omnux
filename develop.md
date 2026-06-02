# OMNUX 개발 현황 및 마스터 플랜

최종 업데이트: 2026-06-02
**프로젝트 방향성**: 웹 대시보드와 텔레그램 봇이 단일 미들웨어(CommandService)를 통과하며, 코딩/루틴/로직 산출물은 `workspace/`에, 영속 상태는 `~/.omnux`에 격리하는 완벽한 **로컬 우선(Local-first) AI 워크벤치** 구축.

---

## 0. 빠른 보기

이 문서는 내용을 줄이지 않고, 최신 의사결정과 긴 상세 로그를 함께 보존한다. 빠르게 판단할 때는 이 섹션과 `3.5 개발 판단 원칙`만 먼저 보면 된다.

### 지금 상태판
| 항목 | 현재 상태 |
|---|---|
| 전체 방향 | 치명적 결함 12선을 먼저 완전 해결한 뒤 Phase 2~5 제품 연결을 재개 |
| 활성 런타임 | `.NET 9` 미들웨어, 정적 대시보드 JS, Tauri React/TypeScript+Rust 셸, Python 샌드박스, Node.js 계약 검사 |
| 완전 해결 | 6번 롤백 안전벨트, 8번 C11 코어 데몬 제거, 9번 멀티 에이전트 폭주 방지(JSON 큐 최종 확정), 12번 스택 파편화 잔재 아카이브 이관 |
| 1차 보강 완료 | 1~5번, 7번, 10~11번 (3번 의존성 샌드박싱·4번 God Object·10번 로컬 고립 포함) |
| 1차 착수 | 없음 |
| 12번 스택 파편화 | 완전 해결 100% (프로토타입 잔재 제거 및 npm test 통과) |
| 10번 로컬 고립 한계 | 1차 보강 완료 (Gist 브릿지 원격 QA 스크립트 작성 및 물리적 격리 검증 완료) |
| 9번 멀티 에이전트 폭주 | 완전 해결 100% (JSON Queue + Lease Lock 최종 아키텍처 채택 확정) |
| 6번 롤백 안전벨트 | 완전 해결 100% (백엔드 snapshot/restore/차단 로직, WS refactor_restore 계약, Build 화면 복원 UI, 테스트 11개 통과) |
| 4번 God Object 분해 | 1차 보강 완료, M4·M5 진행 중 (CommandDispatch 라우터 도입 및 WebSocketGateway AOT 직렬화 분리 완료. 슬래시 핸들러 strangler-fig 이관 중이며 레거시 텍스트 라우팅 제거·미사용 필드 정리 잔여) |
| 최근 검증 | portable package 교차 루트/경로 누출 방지 포함 백업 테스트 9개, 텔레그램 live QA 스크립트 문법/계약/자격증명 부재 safe-fail, 텔레그램 다운로드/UX 정책 타깃 테스트 14개, 문서 연결 포함 `check-chat-telegram-contract`, 루틴 생성 split/single 실행 경계, 자연어 normalized dispatch 경계, 통합 슬래시 channel/memory/doctor/domain/LLM boundary, Telegram memory command partial, Telegram LLM report/model selection partial, Telegram LLM command boundary, Telegram LLM channel mutation helper와 `TelegramLlmMutationApplicationService` 분리, 공통 `LlmSettingsApplicationService` 분리, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임 후 `dotnet build`, LLM settings application service 테스트 5개, unified slash/도움말/자연어/텔레그램 pseudo 타깃 테스트 127개, 도메인 관련 타깃 테스트 86개, `check-security-boundaries` 1053 assertions, `check-tech-stack-contract` 108 assertions, 미들웨어 테스트 1114개, `npm test`, `git diff --check` 통과 |
| 남은 회차 | 치명 결함 12선 모두 1차 보강 이상(Phase 재개 가능). 완전 해결은 4건(6·8·9·12번)이고 4번 God Object 등 완전 해결은 후속 회차. Phase 5 전체 마이그레이션은 별도 4~6회 이상 |

### 제품 로드맵 한눈에 보기
| 묶음 | 상태 | 상단 우선순위 반영 |
|---|---|---|
| Phase 2. Conversation + Memory | 대기 | 치명 결함 완전 해결 후 최우선 제품 기능 연결 |
| Phase 3. Web / Browser / Sessions | 대기 | Phase 2 완료 직후 연결 |
| Phase 4. Doctor / Cleanup / Task | 대기 | 운영/복구 UX 연결 |
| Phase 5. Tauri 마이그레이션 | 대기 | 결함 경계가 닫힌 뒤 화면별 React/TS 이식과 WS 전환 |
| 추가/잔여 새 기능 | 대기 | Phase 2~5 재개 시 함께 연결 |
| Phase 6 이후 신규 기획 | 후순위 후보 | Phase 2~5 안정 후 선별 착수 |

### 다음 우선순위
| 순서 | 할 일 | 이유 |
|---|---|---|
| 1 | Phase 2 Conversation + Memory + Backup WS 연결 마무리 | 치명 결함이 닫힌 뒤 Ask/Settings의 실제 데이터 연결을 재개 |
| 2 | Phase 3 Web / Browser / Sessions 연결 | 대화/메모리 다음으로 검색, URL fetch, 세션 이력을 확장 |
| 3 | Phase 4 Doctor / Cleanup / Task / Plans 잔여 연결 | 운영 점검, 자동 수정, 정리, 태스크 재시도 UX 완성 |
| 4 | Phase 5 Tauri 화면별 React/TS 이식과 WS 전환 | 결함 경계가 닫힌 뒤 데스크톱 앱 전환 본작업 진행 |
| 5 | 남은 치명 결함의 완전 해결 여부 재검증 | 1차 보강과 완전 해결을 혼동하지 않도록 마지막 검증이 필요함 |
| 6 | 9번 SQLite/DB 큐는 Phase 5 상태 DB 마이그레이션 범위로 유지 | AOT 미들웨어에 즉시 SQLite 패키지를 붙이지 않고 장기 DB 전환과 묶음 |
| 7 | 고도화된 AI 코어 지능 및 워크플로우 도입 (LangGraph, RAG 등) | 프롬프트 엔지니어링 퀄리티 향상, 컨텍스트 윈도우 최적화, 정교한 RAG 검색, LangGraph 에이전틱 워크플로우 등 지능적 고도화 |
| 8 | 추가/잔여 UI 기능과 Phase 6 이후 신규 기획은 후순위 후보로 유지 | HeroCommandInput, Activity, Command Palette, 권한 모달, Resource Usage, i18n 및 Phase 6 기획은 Phase 2~5 안정 후 선별 |

### 최종 수동 QA 대기
| 항목 | 실행 주체 | 완료 기준 |
|---|---|---|
| 11번 텔레그램 모바일 live QA | 사용자 | 최종 테스트 때 실제 Telegram token/chat id로 `scripts/telegram-mobile-live-qa.mjs`를 실행하고 `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk`가 모두 `true`인지 확인한다. 개발 잔여작업이 아니라 최종 실사용 확인 항목으로 분리한다. |

### 문서 읽는 순서
1. `0. 빠른 보기`: 현재 퍼센트, 완료/미완료, 다음 우선순위.
2. `3.5 개발 판단 원칙`: 치명 결함 처리율과 회차 산정.
3. `치명 결함별 남은사항`과 `다음 개발 작업 큐`: Phase 재개 전 먼저 끝낼 작업 후보.
4. `5. UI 전환 및 마이그레이션 진척도`: 치명 결함 이후 진행할 Phase 2~5, 추가/잔여 UI 기능, Phase 6 이후 후보.
5. `누적 검증 결과`: 어떤 검증이 통과했는지 확인.
6. `부록 A. 상세 변경사항 로그`: 파일별 변경 근거와 보존용 긴 기록.

---

## 1. 시스템 상태 및 검증 기준

### 현재 아키텍처 상태
- `apps/omnux-middleware`: .NET 9 서버. 주요 비즈니스 로직(WS 라우팅, LLM, 코딩, 루틴, 로직 등), core runtime metrics, guarded kill을 담당한다. (가장 핵심적인 척추 역할)
- `apps/omnux-middleware/src/CoreRuntimeClient.cs`: `.NET` 기본 core runtime. `get_metrics` 호환 metrics 출력과 guarded `/kill` 실행을 담당한다.
- `apps/omnux-middleware/src/AgentSpawnBudgetPolicy.cs`: `sessions_spawn` 고비용 조합 판정과 runtime/mode별 timeout/task 상한을 담당한다. (9번 1차 착수)
- `apps/omnux-middleware/src/AgentSpawnAdmissionLimiter.cs`: `sessions_spawn` 전역 토큰 버킷과 동시성 예약 상한을 담당한다. (9번 1차 착수)
- `apps/omnux-middleware/src/AgentSpawnRunBreaker.cs`: `agent_spawn_breaker.json` 상태 파일로 신규 `sessions_spawn`과 영속 큐 flush를 운영자 개입 전까지 차단하는 1차 브레이커를 담당한다. (9번 1차 보강)
- `apps/omnux-dashboard`: 정적 HTML/JS 대시보드. (Phase 5에서 Tauri + React로 전면 마이그레이션 예정)
- `apps/omnux-sandbox`: Python 기반 실행 제한기. (※ 향후 완전한 OS 레벨 격리 샌드박스로 고도화 필요)
- `workspace/`: 에이전트 작업 산출물 및 코딩 결과물 저장소.
- `~/.omnux/`: 대화 이력, 세션 로그, 플랫폼 영속 상태(State) 위치.

### 검증 스크립트 파이프라인
```bash
dotnet build apps/omnux-middleware/Omnux.Middleware.csproj
dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj
node scripts/check-security-boundaries.mjs
node scripts/check-core-daemon-boundary-contract.mjs
node scripts/check-desktop-shell-boundary-contract.mjs
node scripts/check-tech-stack-contract.mjs
node scripts/check-coding-python-game-contract.mjs
node scripts/check-chat-telegram-contract.mjs
node scripts/check-gateway-runtime-contract.mjs
npm test
git diff --check
```

---

## 2. UI/UX 품질 검증 및 수동 QA 체계

현재 백엔드(미들웨어) 계약 테스트는 존재하나, 프론트엔드 대시보드 및 향후 Tauri 앱에 대한 '시각적/기능적 퀄리티 게이트'가 전무합니다. E2E 자동화 도구(Playwright 등)의 잦은 버그와 과도한 유지보수 비용을 피하고, **'사람이 직접 꼼꼼히 확인하는 수동 검증(Manual QA)'**을 시스템적으로 돕기 위해 다음 3가지 방안을 아키텍처에 반영합니다.

1. **도메인별 수동 회귀 테스트(Manual Regression) 체크리스트 정례화**
   - **문제**: UI 테스트 자동화 봇은 작은 DOM 변경에도 쉽게 깨지며 유지보수에 불필요한 시간이 낭비됩니다.
   - **대응**: 시각적인 렌더링(메시지 순서, CSS 깨짐 등)은 사람이 직접 눈으로 확인하는 것이 가장 빠르고 정확합니다. `docs/OMNUX_실환경_수동_최종회귀_체크리스트.md` 문서를 고도화하여, 마이그레이션 단계마다 필수 체크 항목을 사람이 직접 통과(Pass) 시키는 강력한 매뉴얼 프로세스를 구축합니다.

2. **React Error Boundaries 및 Local Fallback 렌더링**
   - **문제**: Phase 5 (Tauri+React) 전환 시, 렌더링 에러가 발생하면 전체 앱이 '화이트 스크린(White Screen of Death)'으로 뻗어버릴 위험이 높습니다.
   - **대응**: 각 도메인(Chat, Coding, Routine, Settings) 단위로 `Error Boundary`를 엄격하게 감싸서, 한 모듈이 죽더라도 다른 모듈은 살려둡니다. 죽은 영역에는 즉각적인 "스택 트레이스와 복구 버튼(Retry)"을 띄워 수동 테스터가 즉각 직관적으로 오류를 인지하고 디버깅을 시작할 수 있게 설계합니다.

3. **로컬 프론트엔드 관측성(Observability) 및 블랙박스 로깅**
   - **문제**: 사람이 직접 앱을 조작하다가 상태 꼬임 버그를 발견했을 때, 그때그때 JS 콘솔을 보지 않으면 재현이 불가능합니다.
   - **대응**: UI의 주요 상태 변화(Zustand State)와 런타임 에러를 Tauri SQLite의 `ui_logs` 테이블에 백그라운드로 자동 적재하는 로컬 텔레메트리를 도입합니다. 설정 탭에 "디버그 로그 내보내기" 버튼을 두어 버그 발견 즉시 미들웨어 로그와 UI 에러 로그를 한 덩어리(Zip)로 묶어내어 완벽한 단서를 확보합니다.

---

## 3. 최근 완료된 주요 마일스톤

- **보안 경계 및 샌드박스 안정화**: 원격 제한 모드(remote limited) 정책 적용, WebSocket Origin 정책 분리 완료.
- **아키텍처 개선 (미들웨어 도메인 분리)**: `CommandService`, `LlmRouter`의 과대화 해소를 위해 정책, 파서, 프로토콜, 어댑터 단위로 책임 분리 전면 완료 (Search, Telegram, Coding, Provider HTTP 등).
- **상태 저장소 안정화**: JSON 상태 파일 `.bak` 백업 및 복구 로직 전면 적용 완료.
- **테스트 커버리지**: WebSocket 런타임 통합 테스트, 미들웨어 단위 테스트(1053개), 보안/계약 검증 스크립트 대폭 보강 완료.
- **문서화**: 문서 불일치 정리 및 마스터 플랜(`develop.md`) 갱신.
- **코딩 검증 게이트 강화**: 프로젝트성 코드 변경에 대해 테스트 파일 또는 테스트 실행 명령 증거가 없으면 `quality_failed`로 막는 TDD/test evidence 게이트를 1차 도입했다. `CodingTestEvidencePolicy`, `CommandService.CodingQuality`, `CodingQualityBriefPolicy`, `CodingTestEvidencePolicyTests`를 추가했다.
- **멀티 에이전트 비용 및 429 폭주 상한 보강**: `sessions_spawn` 경로에 `AgentSpawnDailyCostLedger`와 `FileAgentSpawnQueueStore`를 추가해 영속 일일 비용 캡, 일시적 거부 큐잉, 큐 기반 재시도, 최대 재시도 후 dead-letter 제거를 1차로 걸었다. Groq 429 응답의 `Retry-After` 기반 cooldown도 `llm_usage.json`에 영속 저장해 재시작 후에도 같은 모델 재호출을 초입에서 막도록 잠갔다.
- **멀티 에이전트 workspace rollback 정책 보강**: ACP command-mode `sessions_spawn`은 실행 전 workspace 텍스트 baseline을 잡고, 실행 후 변경/생성/삭제된 파일이 있으면 기존 Safe Refactor rollback store에 `rollbackId`를 저장한다. 브레이커 transcript와 active run 상태에는 `workspaceRollbackId`와 `restore_workspace_rollback_snapshot` 회복 액션을 남겨 운영자가 `/refactor restore <rollbackId>`로 복원 판단을 할 수 있게 했다. `node_modules` 등 제외 디렉터리는 내려가기 전에 건너뛰어 snapshot 비용이 workspace 크기에 무제한으로 끌려가지 않게 했다.
- **로컬 이식성 패키지 1차 착수**: 기존 백업 ZIP을 단순 덤프가 아니라 `omnux-package.json` manifest가 포함된 portable package로 식별하도록 바꿨고, 대화/루틴/라우팅 정책/메모리/계획/task/노트북/스킬/명령 템플릿 포함과 API 키·Telegram 토큰·auth session·runtime 로그 제외를 테스트로 고정했다. Settings 화면에서도 portable package 설명과 export/preview/apply 상태를 노출했고, 이번 회차에는 manifest의 파일별 `SHA-256` 검증으로 preview/apply 단계의 변조 패키지를 차단했다.
- **텔레그램 모바일 UX 분리 1차 보강 완료**: 텔레그램 도움말에서 텔레그램은 알림/트리거이고 무거운 작업은 데스크톱으로 handoff해야 한다는 경계를 명시했다. 자연어 “데스크톱에서 이어서 작업” 요청도 `/handoff`로 매핑하도록 고정했고, 긴 응답, diff/로그, 대형 코딩 결과, 파일 프리뷰, Safe Refactor diff, task output, doctor JSON 같은 무거운 명령 출력은 모바일 요약+handoff로 먼저 좁힌다. `/handoff` 텔레그램 응답은 데스크톱 Notebooks/Handoff 화면과 로컬 handoff 문서 경로를 함께 안내한다. 이번 회차에는 `/coding download` 변경 파일 목록 기반 선택, 번호/상대 경로 선택, 목록 밖 경로 거부, sibling prefix 오인 방지, 안전 파일명 fallback, 8MB 첨부 상한, fake HTTP `sendDocument` multipart 요청을 정책과 테스트로 고정했다. `docs/텔레그램_봇_가이드.md`, `docs/NOTEBOOKS_AND_HANDOFF.md`, `docs/README.md`에는 모바일 handoff 운영 기준, 실제 모바일 QA 체크리스트, deep link 미도입 최종 판단을 연결하고 `check-chat-telegram-contract`로 고정했다.
- **기술 스택 파편화 1차 보강**: `docs/기술스택_정리.md`에 언어별 책임 경계와 원본 위치 경계를 추가하고, `scripts/check-tech-stack-contract.mjs`로 Rust/Python/Node.js의 제한 역할과 .NET 9 미들웨어 중심 원칙을 고정했다. 이번 회차에는 C11 코어 데몬과 루트 Electron/Codex 번들 잔재, 미들웨어 루트의 Python/Node.js/C 코딩 산출물 묶음을 제거해 활성 기술 스택을 더 좁혔고, Phase 5 스택 유입 차단 게이트와 루트 `omnux/` 프로토타입 파일 목록 동결도 계약 검사에 추가했다.
- **샌드박스 실행 환경 축소**: `apps/omnux-sandbox/executor.py`가 자식 프로세스에 최소 환경변수만 전달하고 임시 작업 디렉터리에서 실행하도록 좁혔다. `SandboxExecutorPolicyTests`와 보안 계약 검사도 함께 추가했다.
- **의존성 격리 보강**: 코딩 자동 설치 경로에서 Homebrew/apt-get 기반 호스트 패키지 설치, `npm install -g`, `pip --user` 같은 로컬 환경 오염 경로를 제거하고, Python 패키지는 workspace `.venv`가 있을 때만 설치하도록 잠갔다. 검증 경로도 `.venv` 필수화로 맞췄다.
- **미들웨어 God Object 1차 분해**: `CommandService`의 입력 첨부 정규화와 오디오 판별 로직을 `InputAttachmentPolicy`로 분리했고, `InputAttachmentPolicyTests`로 고정했다. `Execution`, `InputPreparation`, `Telegram`, `Telegram.Coding`에서 해당 경로를 새 정책으로 통일했다.
- **명령 도움말 본문 정책 분리**: `BuildUnifiedLlmHelpText`와 `BuildMemoryCommandHelpText`를 `CommandHelpTextPolicy`로 옮겼고, `CommandHelpTextPolicyTests`로 텔레그램/웹 LLM 도움말과 메모리 도움말 출력을 고정했다. `CommandService.Telegram`과 `CommandService.NaturalCommands`는 이제 해당 정책에 위임한다.
- **자연어 결정적 fast-path 분리**: `TryResolveCompoundOffToggle`와 `TryResolveDeterministicNaturalCommand`를 `NaturalCommandDeterministicPolicy`로 옮겼고, `NaturalCommandDeterministicPolicyTests`로 복합 off 토글, 스킬 별명 추가/삭제, 대화 이력, 웹/추론 토글 출력을 고정했다. `CommandService.NaturalCommands`는 이제 결정적 fast-path를 이 정책에 위임한다.
- **자연어 해석/검증 정책 분리**: `NaturalCommandInterpretationPolicy`는 LLM 자연어 해석 결과의 JSON 파싱, 코드펜스 추출, 값 정규화를 전담하고, `NaturalCommandValidationPolicy`는 자연어 명령 판정, 키 정규화, kill 의도 감지, `ShouldAttemptNaturalCommandInterpretation`, 각종 `ContainsExplicit*` 판정, 검증 결과 생성을 전담하도록 분리했다. `NaturalCommandInterpretationPolicyTests`와 `NaturalCommandValidationPolicyTests`로 파싱·판정·검증 경계를 고정했다.
- **통합 슬래시/LLM 디스패치 정책 분리**: `/talk`, `/profile`, `/mode`, `/provider`, `/model`, `/status`, `/memory`, `/doctor`, `/plan`, `/task`, `/notebook`, `/handoff`, `/llm`의 토큰 판정과 route 선택을 `UnifiedSlashCommandPolicy`로 분리하고, `UnifiedSlashCommandExecution` partial은 실제 실행만 담당하도록 정리했다. `UnifiedSlashCommandPolicyTests`로 기존 usage 메시지와 route 인자를 고정했다.
- **채널 LLM 설정 helper 분리**: `CommandService.NaturalCommands`에 남아 있던 프로필 적용, provider/model 설정, 상태 출력, provider 표시 포맷, 웹 기본값 적용 helper를 `CommandService.LlmSettings`와 `CommandService.LlmSettingsRouting` partial로 옮겼다. `CommandService.NaturalCommands`는 자연어 해석/해석 후보 생성 중심으로 축소했다.
- **자연어 실행 경계 분리**: 자연어 compound/deterministic/resolved 실행과 로깅을 `CommandService.NaturalCommandExecution` partial로 옮겼고, 이번 회차에는 `ReenterNaturalCommandAsync` 기반 public `ExecuteAsync` 재호출을 제거했다. 자연어 결과 명령은 `NaturalCommandExecutionRequest`를 통해 `ExecuteNaturalCommandDispatchAsync`로 들어가고, 이미 정규화된 명령 라우팅 경계인 `ExecuteNormalizedCommandRoutingAsync`를 직접 호출한다.
- **통합 슬래시 실행 switch 분해**: `UnifiedSlashCommandExecution`의 실제 실행 switch를 core/channel/memory/doctor/domain/LLM control partial로 나눴다. `UnifiedSlashCommandExecution.cs`는 parse 후 실행 진입만 담당하고, `UnifiedSlashCommandExecution.Core.cs`는 static 메시지와 실행 위임만, `UnifiedSlashCommandExecution.Channel.cs`는 profile/mode/provider/model/status 실행을, `UnifiedSlashCommandExecution.MemoryBoundary.cs`는 `/memory clear|create|help` bridge를, `UnifiedSlashCommandExecution.DoctorBoundary.cs`는 `/doctor` report bridge를, `UnifiedSlashCommandExecution.DomainBoundary.cs`는 `/plan`, `/task`, `/notebook`, `/handoff` 도메인 command bridge를, `UnifiedSlashCommandExecution.LlmBoundary.cs`는 `/llm help|usage|models|set ...` bridge를, `.Memory.cs`, `.Doctor.cs`, `.Domain.cs`, `.Llm.cs`는 각 실행 묶음의 guard와 위임을 전담한다.
- **ExecuteCoreAsync 라우팅 분리**: `CommandService.Execution`의 메인 라우팅을 Telegram direct command, unified slash, 비슬래시 자연어, routine/system, telegram chat fallback, intent fallback helper로 나눴다. 이번 회차에는 전처리 이후 공통 명령 라우팅을 `CommandService.Execution.Dispatch.cs`의 `ExecuteNormalizedCommandRoutingAsync`로 분리해 `ExecuteCoreAsync`는 입력 정규화, 텔레그램 context, 길이/빈 입력 guard 이후 명시적 dispatch 경계로 넘긴다.
- **텔레그램 LLM 제어 helper 분리**: `CommandService.Telegram`에 남아 있던 LLM 제어, 모델 리포트, 사용량 리포트, 메모리 명령, pseudo command 핸들러를 `CommandService.Telegram.LlmControl` partial로 옮겼다. 텔레그램 파일은 여전히 크지만, LLM/상태성 블록은 별도 경계로 분리했다.
- **텔레그램 메모리 명령 helper 분리**: `CommandService.Telegram.LlmControl`에 섞여 있던 `/memory clear|create|help` 실행을 `CommandService.Telegram.MemoryCommand` partial로 옮겨 LLM control 파일의 직접 메모리 상태 의존을 줄였다.
- **텔레그램 LLM report/model selection helper 분리**: `CommandService.Telegram.LlmControl`에 남아 있던 `/model` quick selection, Groq/Copilot 모델 설정, LLM 상태/모델/사용량 리포트 본문을 `CommandService.Telegram.LlmModelSelection`과 `CommandService.Telegram.LlmReports` partial로 옮겼다. LLM control 파일은 이제 명령 파싱, 자연어/pseudo command 라우팅, handler map 조립 중심으로 더 좁아졌다.
- **텔레그램 LLM command boundary 분리**: `/llm` control command 실행 switch와 provider/model mutation bridge를 `CommandService.Telegram.LlmCommandBoundary`로 옮겼다. `CommandService.Telegram.LlmControl`은 parsed command를 명시적 request로 boundary에 넘기고, 자연어 provider/model 변경도 `CommandService.Telegram.LlmModelSelection` 경유로 실행한다.
- **텔레그램 LLM channel mutation helper 분리**: `CommandService.Telegram.LlmCommandBoundary`와 `CommandService.Telegram.LlmModelSelection`에 남아 있던 `SetChannelProvider`, `SetChannelModel`, multi-channel lock bridge를 `CommandService.Telegram.LlmChannelMutation` partial로 옮겼다. 이번 추가 회차에는 `/model` quick selection, Groq selected model, Copilot selected model 쓰기도 명시적 mutation request helper로 낮췄고, 이어서 `TelegramLlmMutationApplicationService`를 추가해 `CommandService.Telegram.LlmChannelMutation.cs`가 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter`, `_copilotWrapper`, `SetChannelProvider`, `SetChannelModel`를 직접 만지지 않고 application service에 위임하도록 축소했다.
- **공통 LLM 설정 application service 분리**: `CommandService.LlmSettings.cs`에 남아 있던 웹/텔레그램 프로필 적용, 모드 변경, provider/model 변경, 상태 출력 snapshot 생성을 `LlmSettingsApplicationService`로 옮겼다. `CommandService.LlmSettings.cs`는 이제 request record를 만들어 application service에 위임하고, 다른 partial에서 재사용하는 표시 helper만 남긴다. 텔레그램 provider/model 변경은 새 service가 `TelegramLlmMutationApplicationService`를 호출해 중복 상태 쓰기를 피한다. 이번 추가 회차에는 텔레그램 `/talk`·`/code` 프로필 명령의 직접 `_telegramLlmPreferences` mutation도 `TelegramLlmProfileCommandMutationRequest` 기반으로 같은 application service에 위임했다.
- **루틴 명령 순수 정책 분리**: 루틴 도움말, 결과 포맷, 실행 모드 라벨, 브라우저 루틴 파서, 자연어 루틴 판정을 `RoutineCommandPolicy`로 옮겼고, `RoutineCommandPolicyTests`로 동작을 고정했다.
- **텔레그램 대화 helper 분리**: `/history` `/log` 조회, 마지막 답변 기반 notebook/plan 생성, 연동 대화 확보, followup 입력 보정, anchor turn 탐색 helper를 `CommandService.Telegram.Conversation` partial로 옮겼다.
- **텔레그램 스킬 별명 helper 분리**: 스킬 별명 상태 파일 로드/저장, `/skill quick` 등록/목록/삭제, 슬래시 별명 rewrite를 `CommandService.Telegram.SkillAliases` partial로 옮겼다.

*(파일별 상세 변경 내역은 아래 `부록 A. 상세 변경사항 로그 - 내용 보존`에 유지한다.)*

---

## 3.5 개발 판단 원칙

- 결론: **치명적 결함 12선의 완전 해결을 Phase 2~5보다 먼저 끝낸다.**
- 현재는 **남은 치명 결함의 완전 해결과 재검증을 우선 진행**한다.
- 이유: Phase 2~5 기능 연결을 먼저 밀면 비용 폭주, 모바일 UX 붕괴, 로컬 고립, 스택 파편화 같은 구조 문제가 제품 흐름 위에 다시 쌓인다.
- 단, 기존 기능의 회귀 방지와 검증 파이프라인 유지는 계속한다. 새 Phase 기능 확장은 치명 결함 완전 해결 후 재개한다.
- 현재 진행 상황(기록 보존용 상세): 1번과 2번은 1차 보강을 마쳤고, 3번은 로컬 의존성 격리 쪽을 1차로 잠갔으며, 4번은 `CommandService` 초입 입력 처리, 도움말 본문, 결정적 자연어 fast-path, 자연어 해석/검증 정책 분리, 자연어 해석 후보 선택/프롬프트 정책 분리, 자연어 해석 루프 정책 분리, 자연어 dispatch 판정 정책 분리, 통합 슬래시/LLM route 판정 정책 분리, 채널 LLM 설정 helper 분리와 공통 `LlmSettingsApplicationService` 분리, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임, 자연어 실행 경계 분리와 public `ExecuteAsync` 재진입 제거, 통합 슬래시 실행 switch의 core/channel/memory/doctor/domain/LLM control partial 분리, `ExecuteCoreAsync` 라우팅 helper 분리와 normalized dispatch 경계 추가, 텔레그램 LLM 제어 helper 분리, 루틴 명령 정책 분리, 텔레그램 대화 helper 분리, 텔레그램 스킬 별명 helper 분리, 텔레그램 스킬 본문/런타임 helper 분리, 텔레그램 Think+ 토글 초입 분리, 텔레그램 refactor helper 분리, 텔레그램 coding 설정 helper 분리, 텔레그램 URL fast-path 분리, 텔레그램 응답 종료 공통 helper 분리, 루틴 명령 디스패치 helper 분리, 루틴 스케줄러 루프 분리, 루틴 프롬프트 초기화 분리, 루틴 실행 보조/요약 helper 분리, 루틴 생성 본문 파일명 정리, 루틴 코드 보정/검증/스크립트 저장 helper 분리, 루틴 모델 선택 전략 분리, 루틴 생성 프롬프트/스크립트 문자열 helper 분리, 루틴 생성 split/single 실행 helper 분리까지 진행했다. 5번은 루트 셸 상태 조립을 `app-shell-*` 모듈로 분리했고, `Ask`, `Settings`, `Build`, Command Palette, Activity, Automate 상태를 page-level store로 이동했으며, 정적 대시보드 부트 fallback과 root Error Boundary까지 추가해 1차 보강을 닫았다. 6번은 rollback snapshot 저장/복원 경로와 WS restore 계약, 텔레그램 restore 명령, 복원 차단 테스트, Build 화면의 rollback 복원 진입점과 상태 표시, apply 생성 rollback ID 기반 복원 성공/차단 테스트, WebSocket dispatcher 입력 경로, 실제 미들웨어 live E2E 확인까지 끝내 1차 보강을 닫았다. 7번은 Tauri Rust 백엔드를 앱 셸로 제한하고 .NET 미들웨어가 비즈니스 로직을 전담한다는 계약을 문서와 검사 스크립트로 1차 착수했으며, 이번 회차에 `apps/desktop` scaffold를 실제로 생성한 뒤 `shell-store`, `ShellErrorBoundary`, `middleware-contract`, 런타임 부트 계약 카드와 재연결 예약 상태를 더해 1차 보강 단계로 진입했다. 이번 회차에는 loopback cross-port Origin 허용, healthz/readyz 자동 probe, ping/pong 재연결 경계, 실제 Rust 셸의 `.NET` dev bootstrap, 마지막 probe/오류 상태 노출까지 넣어 실제 연결 전 계약을 더 좁혔다. 8번은 C11 코어 데몬 잔재 완전 삭제까지 끝내 완전 해결로 전환했다. 12번은 기술 스택 책임 경계 문서화, 계약 검사, 루트/미들웨어 생성 산출물 삭제에 더해 새 언어/런타임 승인 기준과 브랜드/호환 alias 경계까지 문서와 계약 검사에 추가했다.
- 실행 기준은 다음과 같다.
  1. 치명 결함 12선을 완전 해결 기준으로 먼저 닫는다.
  2. 큰 변경은 반드시 기존 검증 파이프라인으로 잠근다.
  3. Phase 2~5 확장은 12선 완전 해결 이후 진행한다.

### [치명적 결함 12선 처리 현황]
- 완료: 4건 (6번, 8번, 9번, 12번)
- 1차 보강 완료: 8건 (1번~5번, 7번, 10번~11번)
- 1차 착수: 0건
- 미착수: 0건
- 처리율(착수 이상): 100% (12/12)
- 1차 보강 이상 완료율: 100% (12/12)
- 완전 해결률: 33% (4/12)
- 미완료률(완전 해결 기준): 67% (8/12)
- 8번 내부 진행률: 100% 완료 (C11 코어 데몬 잔재 완전 삭제. `apps/omnux-core`, 루트 alias, `CoreProcessBootstrapper`, `CoreAuthToken`, `UdsCoreClient` 제거 완료)
- 남은 회차: 치명적 결함 12선 기준 최소 1~2회가 더 필요하다 (완전 해결 잔여분 마감용). Phase 5 전체 마이그레이션은 별도 4~6회 이상 필요하다.
- 상태 해석: 8번 C11 코어 데몬 제거를 포함해 6·9·12번까지 4건만 완전 해결이고, 나머지 8건(1~5번, 7번, 10~11번)은 1차 보강 단계다. 특히 4번 God Object 분해는 완전 해소가 아니라 대형 책임 덩어리를 잘라낸 1차 안정화 상태이며 M4·M5(슬래시 핸들러 strangler-fig 이관 완결, 레거시 텍스트 라우팅 제거, 미사용 private 필드 정리)가 남아 있다. 3번 의존성 샌드박싱과 10번 로컬 고립도 1차 보강 단계다. 9번은 SQLite/DB 큐 전환 최종 판단 완료 상태로, 실제 DB 큐 이식은 Phase 5 상태 DB 마이그레이션과 묶는다. 12번은 원본 위치 경계, 새 언어/런타임 승인 기준, Phase 5 스택 유입 차단 게이트, 브랜드와 호환 alias 경계, 루트 `omnux/` 프로토타입 파일 목록 동결을 계약 검사로 고정했다.
- 상세 처리 현황과 히스토리는 [docs/archive/fatal_flaws_12_history.md](docs/archive/fatal_flaws_12_history.md) 문서를 참고하세요.

## 3.6. 전략적 방향성 및 전술적 한계 (팩트폭행 리뷰)

현재 기준의 전략은 '치명 결함 선해결'과 'Tauri 백엔드 억제(순수 App Shell화)'입니다. 기존의 기능 개발 병행 접근은 전술적으로 위험하므로, 다음 4가지를 먼저 궤도 수정해야 합니다.

1. **"God Object를 쪼갰다"는 착각 (가짜 리팩터링)**
   - `CommandService`를 Partial 클래스와 Policy로 나눈 것은 코드를 물리적으로 분산시켰을 뿐, 아키텍처의 논리적 결합도는 낮추지 못했습니다.
   - **올바른 방향:** CQRS나 `MediatR` 같은 이벤트 버스(Message Bus) 패턴을 도입해, 라우터가 이벤트를 던지기만 하고(Publish-and-Forget) 각 도메인이 독립적으로 처리하도록 완전히 분리해야 합니다.

2. **"수동 QA(사람)로 다 하겠다"는 오만**
   - Playwright E2E 테스트가 무겁고 깨지기 쉽다고 해서 모든 검증을 '수동 Regression 체크리스트'에 의존하는 것은 위험합니다. 인간은 배포 때마다 30개 화면을 완벽히 검증하지 못합니다.
   - **올바른 방향:** E2E 테스트를 버렸다면, 최소한 Vitest와 React Testing Library(RTL)를 활용한 **컴포넌트 단위 통합 테스트** 방어선은 반드시 구축해야 합니다.

3. **"메모리 큐"로 멀티 에이전트 폭주를 막을 수 있다는 순진함**
   - 토큰 버킷과 메모리 기반 큐잉은 서버 재시작 시 작업이 허공으로 증발하며, 달러($) 기반의 API 코스트를 원천 통제하지 못합니다.
   - **올바른 방향:** SQLite/Redis 등 영속성(Persistent) 기반 작업 큐를 도입하고, '현재 누적 소진 코스트'를 모니터링하여 임계치 초과 시 에이전트 스폰을 강제 차단(Hard Cost Cap)하는 하드웨어적 브레이커가 필수입니다.

4. **상태 저장소가 여전히 `.bak` JSON 파일이라는 기괴함**
   - 멀티 에이전트 환경에서 여러 에이전트가 동시에 `~/.omnux/`의 단일 JSON 파일에 접근하면 File Lock과 Race Condition으로 데이터가 박살납니다.
   - **올바른 방향:** Phase 5 진행 전, 대화/상태 영속성 관리를 파일 기반에서 로컬 **SQLite** (혹은 EF Core 내장 DB)로 마이그레이션 해야 합니다.

---

## 4. 핵심 리스크 및 당면 과제 (치명적 구조 결함 12선)

이전에 프로젝트 성장을 가로막던 12가지 치명적 구조 결함 리스트 및 분석 내용은 아카이브 되었습니다.
자세한 내용은 [docs/archive/fatal_flaws_12_history.md](docs/archive/fatal_flaws_12_history.md)를 참고하세요.

## 5. UI 전환 및 마이그레이션 진척도 (Phase 1~5)

전체 WS 연결률: 58/93 (62%). Phase 1~4 완료 시 93/93 (100%).

| 단계 (Phase) | 상태 | 목표 및 내용 |
|---|---|---|
| **Phase 1. Routine CRUD** | ✅ 완료 | Automate 화면 루틴 연결 완료 (`create`, `run`, `delete` 등) |
| **Phase 2. Conversation + Memory** | 🟡 진행 중 | 대화 관리(6개) + 메모리 CRUD(8개) + 백업(3개) WS 연결 |
| **Phase 3. Web/Browser/Sessions** | 🔴 대기 | 웹 검색(4개) + 세션(4개) WS 연결 |
| **Phase 4. Doctor/Cleanup/Task** | 🔴 대기 | Doctor 수정(2개) + Cleanup(2개) + Task(3개) + 기타 설정 WS 연결 |
| **Phase 5. Tauri 마이그레이션** | 🟡 진행 중 | React+Vite+Tauri 기반 데스크톱 앱으로 전면 전환 |

### 🛠 Phase 2~5 세부 수행 작업

**Phase 2 — Conversation 관리 + Memory CRUD**
1. `ws-conversations.js`, `ws-memory.js`, `ws-backup.js` 작성.
2. `ask.js` 수정 (대화 목록 사이드바, 새 대화 생성 등).
3. `settings.js` 수정 (Memory 탭 CRUD, 백업/복원 UI 구성, portable package 표시 및 import/apply 상태 반영).

**현재 진행 메모**
- `Ask`와 `Settings` 화면은 실제 WS payload 구조와 맞추는 방향으로 연결을 진행 중이며, `conversation_detail` / `memory_notes` / `backup_*` 흐름의 정합성을 계속 맞춰야 합니다.
- `Ask` 화면은 초기 대화/메모리 목록 조회 의존성을 `ctx` 전체가 아니라 필요한 함수 참조로 분리해 재실행 범위를 줄였다.
- `Settings` 화면의 Memory 탭도 `send`/`toast` 참조를 분리하고, 메모리 내용 갱신 시 선택 항목이 stale 상태에 묶이지 않도록 정리했다.
- 실제 브라우저 검증에서 `Settings` -> `Memory & backup` 진입과 메모리 검색/백업 버튼 렌더를 확인했다.
- `Settings` Memory 탭에 메모리 노트 CRUD를 연결했다: 선택 노트 `이름 변경`(rename_memory_note)·`삭제`(delete_memory_notes)와 범위 `메모리 비우기`(clear_memory). 백엔드가 mutation 후 `memory_notes`를 재브로드캐스트하므로 리스트는 자동 갱신되고, 파괴적 작업은 confirm으로 가드했다. 브라우저 프리뷰에서 렌더·선택 시 액션 노출·delete/rename end-to-end(전송+낙관적 UI)·리스트 갱신 경로(`omnux:memory_notes`)를 콘솔 에러 없이 확인했다.
- Phase 2 잔여: 대화 `create_conversation`·`delete_conversation`·`update_conversation_meta`·`conversation_search`와 `create_memory_note`(대화 기반)를 `Ask` 화면 사이드바에 연결. 백엔드는 모두 지원(`WsConversationMemoryDispatcher`), 프론트 와이어링만 남음. 백업 3종은 연결 완료.

**Phase 3 — Web 검색 / Browser / Sessions**
1. `ws-web.js`, `ws-sessions.js` 작성.
2. 검색 결과 패널, URL fetch 결과 표시, 세션 이력 탭 연동.

**Phase 4 — Doctor 자동수정 / Cleanup / Task 잔여 처리**
1. `ws-doctor.js`, `ws-cleanup.js`, `ws-tasks.js`, `ws-plans.js` 확장 작성.
2. 문제 자동 수정(미리보기/적용), 시스템 클린업, 태스크 재시도 기능 연동.

**Phase 5 — Tauri 데스크톱 앱 마이그레이션**
0. 사전 조건: `node scripts/check-desktop-shell-boundary-contract.mjs`가 통과하는 상태에서 진행한다.
1. `apps/desktop/`에 새 Tauri v2 프로젝트(Vite/React/TS/Tailwind) 생성.
2. vanilla JS 화면을 JSX/TSX 컴포넌트로 전면 변환 및 Zustand 상태 관리 도입.
3. 미들웨어(.NET) 통신 모듈을 점진적으로 전환.
4. 셸 상태 경계, 렌더 실패 fallback, UI 로그 경계를 실제 코드와 검사로 잠근다.

**Desktop Shell Boundary (7번 1차 계약)**
- Tauri Rust 백엔드는 앱 셸(Window 관리)만 담당한다.
- 허용 범위: window 생성/닫기, deep link, open external, .NET 미들웨어 sidecar bootstrap, 앱 lifecycle 이벤트 전달.
- 비즈니스 로직은 .NET 미들웨어가 전담한다.
- Rust 쪽 금지: LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책, notebook/plan/task 실행, `~/.omnux` 영속 상태 직접 접근, `workspace/` 산출물 직접 변경, provider/API 직접 호출, 별도 도메인 DB 소유.
- 검사 기준: `node scripts/check-desktop-shell-boundary-contract.mjs`와 `npm test`가 이 경계를 확인한다.

### 🆕 추가/잔여 새 기능 (치명 결함 이후 UI 연결)
- **HeroCommandInput**: 실제 intent 라우팅 완벽 구현.
- **Activity 화면**: 실제 Run 데이터 연결.
- **Command Palette**: ⌘K 액션 실행 완벽 연동.
- **권한 모달**: 보안 승인/거부 처리 로직 연결.
- **Resource Usage**: 시스템 메트릭 카드 연동.
- **i18n**: 완전 다국어 지원.

---

## 6. 향후 확장 마일스톤 (Phase 6 이후 신규 기획 9선)

로컬 우선(Local-first) 워크벤치의 강점을 극대화하기 위해 Phase 5 이후 순차적으로 도입할 파괴적 아키텍처 확장 계획입니다.

### 1. 터미널 자율 디버깅 에이전트 (Terminal Integration)
- 샌드박스가 아닌 호스트 터미널 세션(pty)을 제어하여 빌드, 실행, 에러 분석(stderr), 코드 자동 수정 루프를 자율적으로 수행하는 `Terminal Node` 도입.

### 2. 완전 오프라인 프라이버시 모드 (Local LLM 연동)
- 외부 인터넷 통신을 100% 차단하고 Ollama, LM Studio 등 OpenAI-compatible 로컬 엔드포인트를 연결하여 완벽한 오프라인 보안 코딩 환경 구축.

### 3. Vector DB 기반 장기 메모리 (RAG)
- Tauri SQLite에 Vector Search 확장(`sqlite-vec`)을 결합하여, 과거 대화 및 코딩 이력을 임베딩하고 자연어(Semantic Search)로 즉시 복원.

### 4. Git 단위의 타임머신 기능 (작업 롤백 자동화)
- AI의 광범위한 코드 수정 이벤트를 백그라운드 `git commit`으로 자동 스냅샷화하여, 대시보드에서 원클릭 롤백(Undo) 지원.

### 5. 다중 모달(Vision) 클립보드 직결
- 바탕화면의 이점을 살려 클립보드 이미지(UI 스크린샷 등)를 직접 읽어들여 클론 코딩 스캐폴딩을 즉시 수행하는 Vision 파이프라인.

### 6. MCP(Model Context Protocol) 전면 도입 및 생태계 확장
- omnux를 표준 MCP 클라이언트로 격상시켜 수많은 서드파티 오픈소스 툴(Notion, GitHub, Slack 등)을 코드 추가 없이 플러그인 형태로 연결.

### 7. 사용자의 습관을 자율 학습하는 'Adaptive Skills' (자가 진화)
- 사용자의 코드 피드백과 교정(Correction) 패턴을 백그라운드 AI가 분석하여, `USER_PREFERENCE_SKILL.md`를 스스로 갱신하는 학습 루프 구축.

### 8. 멀티 에이전트(Multi-Agent) 토론 및 오케스트레이션 UI 시각화
- 기획자, 코더, 리뷰어 등 에이전트 간의 리뷰/반박(Critique) 과정을 단순 로그가 아닌 슬랙 스레드(Thread)나 실시간 애니메이션 UI로 시각화하여 사용자의 개입(Human-in-the-loop)을 극대화.

### 9. 고도화된 AI 코어 지능 및 워크플로우 전면 도입
- **현재 구조의 팩트폭행 진단**: 다중 에이전트 오케스트레이션과 가드레일 프롬프트 수준은 최상위권이나, 컨텍스트 윈도우 최적화 방식이 원시적인 문자열 자르기(`TrimForOutput` 2200자)에 불과해 JSON/코드 문법 파괴 위험이 큼. 또한, 메모리 탐색 시스템이 진정한 의미의 RAG(Vector 임베딩)가 아니라 원시적인 하드코딩 정규식(Regex)/단어 매칭 수준에 머물러 있음.
- **개선 목표**: 의미론적 청킹(Semantic Chunking) 및 AST 기반 컨텍스트 최적화 적용, Vector DB를 활용한 완벽한 RAG 검색 고도화, LangGraph 등 최신 에이전틱 워크플로우 전면 도입을 통해 AI 코어 지능을 극대화.
