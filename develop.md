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
| 완전 해결 | 3번 의존성 샌드박싱, 6번 롤백 안전벨트, 8번 C11 코어 데몬 제거, 9번 멀티 에이전트 폭주 방지(JSON 큐 최종 확정), 10번 로컬 고립 한계 돌파(Gist Bridge), 12번 스택 파편화 잔재 아카이브 이관 |
| 1차 보강 완료 | 1~5번, 7번, 11번 |
| 1차 착수 | 없음 |
| 12번 스택 파편화 | 완전 해결 100% (프로토타입 잔재 제거 및 npm test 통과) |
| 10번 로컬 고립 한계 | 완전 해결 100% (Gist 브릿지 원격 QA 스크립트 작성 및 물리적 격리 검증 완료) |
| 9번 멀티 에이전트 폭주 | 완전 해결 100% (JSON Queue + Lease Lock 최종 아키텍처 채택 확정) |
| 6번 롤백 안전벨트 | 완전 해결 100% (백엔드 snapshot/restore/차단 로직, WS refactor_restore 계약, Build 화면 복원 UI, 테스트 11개 통과) |
| 최근 검증 | portable package 교차 루트/경로 누출 방지 포함 백업 테스트 9개, 텔레그램 live QA 스크립트 문법/계약/자격증명 부재 safe-fail, 텔레그램 다운로드/UX 정책 타깃 테스트 14개, 문서 연결 포함 `check-chat-telegram-contract`, 루틴 생성 split/single 실행 경계, 자연어 normalized dispatch 경계, 통합 슬래시 channel/memory/doctor/domain/LLM boundary, Telegram memory command partial, Telegram LLM report/model selection partial, Telegram LLM command boundary, Telegram LLM channel mutation helper와 `TelegramLlmMutationApplicationService` 분리, 공통 `LlmSettingsApplicationService` 분리, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임 후 `dotnet build`, LLM settings application service 테스트 5개, unified slash/도움말/자연어/텔레그램 pseudo 타깃 테스트 127개, 도메인 관련 타깃 테스트 86개, `check-security-boundaries` 1065 assertions, `check-tech-stack-contract` 108 assertions, 미들웨어 테스트 1053개, `npm test`, `git diff --check` 통과 |
| 남은 회차 | 치명 결함 기준 최소 1~2회, Phase 5 전체 마이그레이션은 별도 4~6회 이상 |

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
| 1 | 4번 미들웨어 God Object 분해 마무리 | CQRS/이벤트 버스(MediatR) 기반 아키텍처 완전 분리 필요 |
| 2 | 남은 치명 결함의 완전 해결 여부 재검증 | 1차 보강과 완전 해결을 혼동하지 않도록 마지막 검증이 필요함 |
| 3 | 9번 SQLite/DB 큐는 Phase 5 상태 DB 마이그레이션 범위로 유지 | AOT 미들웨어에 즉시 SQLite 패키지를 붙이지 않고 장기 DB 전환과 묶음 |
| 4 | Phase 2 Conversation + Memory + Backup WS 연결 마무리 | 치명 결함이 닫힌 뒤 Ask/Settings의 실제 데이터 연결을 재개 |
| 5 | Phase 3 Web / Browser / Sessions 연결 | 대화/메모리 다음으로 검색, URL fetch, 세션 이력을 확장 |
| 6 | Phase 4 Doctor / Cleanup / Task / Plans 잔여 연결 | 운영 점검, 자동 수정, 정리, 태스크 재시도 UX 완성 |
| 7 | Phase 5 Tauri 화면별 React/TS 이식과 WS 전환 | 결함 경계가 닫힌 뒤 데스크톱 앱 전환 본작업 진행 |
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
- 미착수률: 0% (0/12)
- 상태 해석: 8번은 완전 해결로 전환했고, 나머지 11건은 모두 1차 보강 이상이다. 9번은 다중 에이전트 스폰 예산 정책, 전역 admission gate, 영속 일일 비용 캡, Groq 429 cooldown, `agent_spawn_queue.json` 기반 지연 재시도, 백그라운드 flush, 최대 재시도 후 dead-letter 제거, JSON 큐 lease lock, `agent_spawn_breaker.json` 기반 신규 스폰/큐 flush 차단, 읽기 전용 큐 상태 조회, WS `sessions_spawn action=status` 조회, `agent_spawn_active.json` 기반 active run 추적, `blocked_by_breaker` 완료 이력 전환, ACP command-mode 실행 중 `codex exec` process group 종료, 프로세스 없는 staged/fake/subagent lane의 fail-closed transcript와 후속 `sessions_send` 차단까지 1차로 닫았다. 10번은 기존 백업 export/import를 portable package로 식별할 수 있게 `omnux-package.json` manifest와 회귀 테스트를 붙였고, Settings 화면 표시, manifest 파일별 `SHA-256` 무결성 검증, portable-package-only 동기화 정책, 파일 충돌 preview, 선택적 패키지 범위 UX와 manifest scope 반영, 서로 다른 state/workspace 루트로 import되는 로컬 교차 루트 회귀 테스트, 수동 QA 체크리스트까지 들어가 1차 보강 완료 상태다. 11번은 텔레그램 도움말, 자연어 handoff 매핑, 긴 응답/diff/log 요약, 대형 코딩 결과 사전 handoff, 명령별 대형 파일/diff/task output/doctor JSON 차단, `/handoff` 데스크톱 문서 연결, `/coding download` 변경 파일 목록 기반 선택/8MB 상한 정책 테스트까지 들어가 1차 보강 완료 상태다. 12번은 `docs/기술스택_정리.md`와 `docs/en/tech-stack.md`에 언어별 책임/원본 위치/잔재 보관 금지/새 언어·런타임 승인 기준/Phase 5 스택 유입 차단 게이트/브랜드와 호환 alias 경계를 적고, `scripts/check-tech-stack-contract.mjs`와 `scripts/check-repo-hygiene.mjs`로 C11 제거, 루트/미들웨어 생성 산출물 부재, 승인 기준 재유입 방지, canonical `omnux` 표기, 루트 `omnux/` 프로토타입 파일 목록 동결을 고정한 1차 보강 완료 상태다. 4번은 God Object 완전 해소가 아니라, 당장 기능 개발을 막던 대형 책임 덩어리를 잘라낸 1차 안정화 상태고, 5번은 루트 상태와 주요 화면 상태를 page-level store로 분리하고 정적 대시보드 부트/렌더 실패 fallback까지 보강한 상태다. 6번은 rollback snapshot 저장/복원, WS restore 계약, 텔레그램 restore 경로, 복원 차단 테스트, apply 생성 rollback ID 기반 성공/차단 테스트, WebSocket dispatcher 입력 경로, 실제 미들웨어 live E2E 확인까지 1차 보강을 닫았다. 7번은 Rust/.NET 경계 계약, 데스크톱 scaffold, dev/sidecar bootstrap 계약, healthz/readyz/WebSocket probe, 카드별 Error Boundary와 UI 로그 경계를 검사로 고정해 1차 보강을 닫았다.
- 4번 내부 진행률: 1차 보강 기준 100% 완료, 완전 해결 기준 약 99.9% 완료. 입력 첨부, 오디오 판별, `/kill` 파서, 로컬 시간 출력, 텔레그램 도움말 본문, 공통 LLM/메모리 도움말 본문, 결정적 자연어 fast-path, 자연어 해석/검증 경계, 자연어 해석 후보 선택과 resolver prompt, 자연어 해석 루프, 자연어 dispatch 판정, 통합 슬래시/LLM route 판정, 채널 LLM 설정 helper, 공통 `LlmSettingsApplicationService`, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임, 자연어 실행 경계와 public `ExecuteAsync` 재진입 제거, 통합 슬래시 실행 switch의 core/channel/memory/doctor/domain/LLM control partial 분리, 통합 슬래시 memory/doctor/domain/LLM command boundary 분리, `ExecuteCoreAsync` 라우팅 helper 분리와 normalized dispatch 경계 추가, 텔레그램 LLM 제어 helper 분리, 텔레그램 메모리 명령 helper 분리, 텔레그램 LLM report/model selection helper 분리, 텔레그램 LLM command boundary 분리, 텔레그램 LLM channel mutation helper 분리, quick/Groq/Copilot 모델 선택 mutation request helper 분리, `TelegramLlmMutationApplicationService` 분리, 루틴 명령 정책 분리, 텔레그램 대화 helper 분리, 텔레그램 스킬 별명 helper 분리, 텔레그램 스킬 본문/런타임 helper 분리, 텔레그램 Think+ 토글 초입 분리, 텔레그램 refactor helper 분리, 텔레그램 coding 설정 helper 분리, 텔레그램 URL fast-path 분리, 텔레그램 응답 종료 공통 helper 분리, 루틴 명령 디스패치 helper 분리, 루틴 스케줄러 루프 분리, 루틴 프롬프트 초기화 분리, 루틴 실행 보조/요약 helper 분리, 루틴 생성 본문 파일명 정리, 루틴 코드 보정/검증/스크립트 저장 helper 분리, 루틴 모델 선택 전략 분리, 루틴 생성 프롬프트/스크립트 문자열 helper 분리, 루틴 생성 split/single 실행 helper 분리는 완료했다. `CommandService.RoutineGeneration.cs`는 전략 선택과 진행률 보고 중심으로 축소됐고, split/single LLM 생성, 후보 파싱, 보정, 품질 결과 조립은 `CommandService.RoutineGeneration.Execution.cs`가 담당한다. `CommandService.Execution.cs`는 전처리 후 `ExecuteNormalizedCommandRoutingAsync`로 넘기고, `CommandService.NaturalCommandExecution.cs`는 `NaturalCommandExecutionRequest`를 통해 이 경계를 직접 호출한다. `UnifiedSlashCommandExecution.Core.cs`는 static 메시지와 channel/orchestration 위임만 담당하고, profile/mode/provider/model/status 실행은 `UnifiedSlashCommandExecution.Channel.cs`가 담당한다. `/memory clear|create|help` 실행 bridge는 `UnifiedSlashCommandExecution.MemoryBoundary.cs`가, `/doctor` 실행 bridge는 `UnifiedSlashCommandExecution.DoctorBoundary.cs`가, `/plan`, `/task`, `/notebook`, `/handoff` 실행 bridge는 `UnifiedSlashCommandExecution.DomainBoundary.cs`가, `/llm help|usage|models|set ...` 실행 bridge는 `UnifiedSlashCommandExecution.LlmBoundary.cs`가 명시적 request로 받는다. 텔레그램 `/memory` 실행은 `CommandService.Telegram.MemoryCommand.cs`가 담당하고, 텔레그램 `/llm` command 실행 switch는 `CommandService.Telegram.LlmCommandBoundary.cs`가 담당한다. 텔레그램 `/model`, Groq/Copilot 모델 설정, 자연어 provider/model 변경, LLM 상태/모델/사용량 리포트 본문은 `CommandService.Telegram.LlmModelSelection.cs`와 `CommandService.Telegram.LlmReports.cs`가 담당한다. 텔레그램 quick/Groq/Copilot provider/model state mutation과 channel mutation은 `TelegramLlmMutationApplicationService`가 담당하고, 공통 웹/텔레그램 프로필·모드·provider/model·상태 출력 state mutation과 텔레그램 `/talk`·`/code` 프로필 명령 mutation은 `LlmSettingsApplicationService`가 담당한다. `CommandService.Telegram.LlmChannelMutation.cs`와 `CommandService.LlmSettings.cs`는 얇은 위임 helper로 남았다. 완전 해결에는 CQRS/이벤트 경계처럼 `CommandService` private state 의존 자체를 낮추는 구조 전환이 남아 있다. 5번 내부 진행률: 1차 보강 기준 100% 완료. 루트 상태 조립은 `app-shell-*` 모듈로 분리했고, `Ask`, `Settings`, `Build`, Command Palette, Activity, Automate 상태는 page-level store로 이동했으며, 이번 회차에서 React/CDN 로드 실패와 렌더 실패 시 fallback 화면을 띄우는 부트 경계를 추가했다.
- 6번 내부 진행률: 100% 완료. rollback snapshot 저장/조회/삭제, apply 시 snapshot 생성, restore 시 현재 파일이 적용본과 일치할 때만 복원 허용, WS restore 계약, 텔레그램 `/refactor restore`, snapshot 회귀 테스트, Build 화면의 rollback 복원 진입점과 상태 표시, apply가 만든 rollback ID로 복원 성공/차단을 검증하는 테스트, WebSocket dispatcher 입력 경로, 실제 live 미들웨어에서의 restore 성공과 재편집 차단 확인까지 모두 끝냈다.
- 7번 내부 진행률: 1차 보강 기준 100% 완료. Tauri Rust 백엔드는 앱 셸(Window 관리)만 담당한다. 비즈니스 로직은 .NET 미들웨어가 전담한다. Rust 쪽 금지 범위는 LLM, 코딩, 루틴, 리팩터, 로직, 라우팅 정책, `~/.omnux` 영속 상태, `workspace/` 산출물 직접 변경이다. 이 경계를 `develop.md`와 `scripts/check-desktop-shell-boundary-contract.mjs`로 고정했고, `apps/desktop` scaffold, `shell-store`, `ShellErrorBoundary`, `middleware-contract`, 런타임 부트 계약 카드, 재연결 예약 상태, 카드별 Error Boundary와 카드 실패 로그 기록, Rust 생명주기 이벤트 emit, 프론트 bootstrap event listener, loopback cross-port Origin 허용, healthz/readyz HTTP probe, WebSocket ping/pong probe, 실제 Rust 셸의 `.NET` dev bootstrap, `externalBin` sidecar 연결, 재연결 성공 시도 횟수 초기화까지 붙였다. 완전한 제품 마이그레이션은 별도 Phase 5 작업으로 남는다.
- 8번 내부 진행률: 100% 완료. `DotNetCoreRuntimeClient`가 `get_metrics` 호환 metrics와 guarded `kill`을 담당하고, `apps/omnux-core`, 루트 `omnux-core`/`omninode-core` alias, `CoreProcessBootstrapper`, `CoreAuthToken`, `UdsCoreClient`, `PathOptions.CoreSocketPath`, `OMNUX_CORE_SOCKET_PATH`, `OMNUX_ENABLE_LEGACY_CORE_BOOTSTRAP` 경로를 제거했다. README/QUICKSTART/검증/디렉터리/아키텍처/기술 스택 문서는 C11 코어 데몬을 더 이상 활성 구성요소로 안내하지 않는다. `scripts/check-core-daemon-boundary-contract.mjs`는 이제 레거시 코어 보존 계약이 아니라 레거시 코어 부재 계약으로 동작한다.
- 9번 내부 진행률: 100% 완전 해결 완료. `SessionSpawnTool`에 `AgentSpawnBudgetPolicy`, `AgentSpawnAdmissionLimiter`, `AgentSpawnDailyCostLedger`, `FileAgentSpawnQueueStore`, `FileAgentSpawnActiveRunStore`, `AgentSpawnRunBreaker`, `AgentSpawnWorkspaceRollbackPolicy`를 붙여 `sessions_spawn`의 고비용 조합, timeout/task 상한, 전역 토큰 버킷, 동시성 예약 상한, 영속 일일 비용 캡, 일시적 거부 큐잉, queue delay 재처리, active run 추적과 `blocked_by_breaker` 완료 이력 전환, 운영자 개입용 신규 스폰/큐 flush 차단, command-mode workspace rollback snapshot을 초입과 백그라운드 flush 루프에서 처리한다. 로직 그래프의 `session_spawn` 기본 timeout도 900초로 낮춰 UI 기본값과 맞췄고, ACP adapter command-mode 우선순위 제어와 command transport 실패 시 staged 접수 폴백도 들어갔다. Groq 429 응답의 `Retry-After`는 `CooldownUntilUtc`로 저장되며, 비스트리밍/스트리밍/멀티모달 Groq 호출과 intent 분류 경로가 활성 cooldown 동안 네트워크 재호출 없이 즉시 대기 응답 또는 fallback으로 빠진다. 큐 항목은 최대 8회 재시도 후 dead-letter로 제거되고, JSON queue의 read-modify-write 구간은 `.queue.lease` 파일 락으로 감싼다. ready 항목을 읽기만 하던 flush 경로를 `ClaimReadyEntries` 기반 원자 claim으로 바꿔 `LeaseOwner`/`LeasedUntilUtc`가 살아 있는 동안 다른 프로세스가 같은 큐 항목을 중복 실행하지 못하게 했다. AOT 미들웨어의 무의존성(Zero-dependency) 원칙을 유지하기 위해 당장 무거운 SQLite 라이브러리를 추가하지 않고, 현재의 **JSON 큐 + Claim Lease Lock 방식**을 최종 완전 해결책으로 확정하여 결함 9번을 완전히 닫았다. (향후 SQLite 큐 전환은 Phase 5 상태 DB 마이그레이션 시 진행)
- 10번 내부 진행률: 1차 보강 기준 100% 완료, 완전 해결 기준 약 65% 완료. 기존 Settings의 백업 내보내기/가져오기 흐름을 `omnux-package.json` manifest가 포함된 portable package로 명시했고, Settings 화면에서도 portable package 설명과 export/preview/apply 상태를 보여주도록 붙였다. 패키지에는 대화, 루틴, 라우팅 정책, 메모리 노트, plans, tasks, notebooks, global/project skills, global/project commands가 포함되고, API 키, Telegram token/chat id, auth session, OTP, lock/cache/runtime 임시 파일, runtime logs, outbox는 제외한다. manifest에는 파일별 `SHA-256`을 넣고 `PreviewBackupImport`와 `ApplyBackupImport`가 변조/누락/추가/중복 항목을 차단하도록 보강했다. 이번 회차에는 `BackupSyncPolicy`를 manifest에 추가해 현재 동기화 모드를 `portable-package-only`로 못박고, 충돌 정책을 `preview_conflicts_then_skip_without_overwrite_or_replace_with_overwrite`로 명시했다. import preview는 대화 ID 충돌뿐 아니라 import 대상 파일 충돌(`fileConflictCount`, `fileConflicts`)도 계산해 Settings 화면에 노출한다. 추가로 Settings의 “포함 범위” 체크박스가 `includeScopes`를 보내고, `ExportBackup`은 선택된 scope만 ZIP, manifest `Includes`, `SyncPolicy.Scope`, export 결과 `scope`에 반영한다. 이번 추가 보강에서는 `ConversationApplicationServiceBackupTests.PortablePackageAppliesToSeparateStateAndWorkspaceRoots`로 source/target의 state root와 workspace root가 다른 상황에서 대화, 루틴, 라우팅 정책, 메모리, plans, tasks, notebooks, global/project skills, global/project commands가 대상 위치로 들어가고 `omnux-package.json`과 auth/LLM/Telegram/runtime/outbox 계열 파일은 들어가지 않는지 고정했다. 이번 회차에는 추가로 `ConversationApplicationServiceBackupTests.ExportBackupDoesNotLeakMachineSpecificPaths`를 넣어 manifest JSON과 ZIP entry 이름에 source 머신의 절대 경로, `..`, 절대 ZIP 경로, Windows backslash가 들어가지 않는지 고정했다. `docs/OMNUX_실환경_수동_최종회귀_체크리스트.md`에는 portable package export/import, 선택 scope, manifest/`SHA-256`, 경로 누출 방지, 충돌 preview, overwrite 정책, 다른 머신 또는 별도 테스트 루트 적용, provider 미도입 기준을 추가했고 `check-security-boundaries`가 이를 확인한다. 완전 해결에는 실제 Gist/클라우드 provider와 물리적으로 다른 머신에서의 수동 QA가 남아 있다.
- 11번 내부 진행률: 1차 보강 기준 100% 완료, 코드/정책/계약 구현 기준 완료. `TelegramHelpTextPolicy`의 handoff 도움말에 텔레그램은 알림/트리거이고 무거운 작업은 데스크톱에서 이어가야 한다는 경계를 추가했다. `TelegramNaturalCommandPolicy`는 “데스크톱에서 이어서 작업”, “desktop handoff” 같은 자연어를 `/handoff`로 매핑한다. 긴 텔레그램 응답이 잘릴 때뿐 아니라 diff/로그처럼 무거운 출력도 모바일 요약+handoff로 먼저 좁혔고, 코딩 결과가 클 때는 `/coding files`, `/coding download <번호>`, `/handoff`로 바로 넘기는 사전 정책까지 추가했다. `TelegramCommandHandoffPolicy`로 `/coding file` 대형 파일 프리뷰, `/refactor preview` 대형 diff, `/task output` 대형 stdout/stderr/result, `/doctor json` 대형 JSON을 직접 본문으로 풀지 않고 짧은 프리뷰+다음 명령+`telegram_command_output_handoff` marker로 제한했다. `TelegramHandoffPresentationPolicy`는 텔레그램 `/handoff` 결과에 데스크톱 Notebooks/Handoff 화면 안내와 로컬 `handoff.md` 경로를 표시한다. `TelegramCodingDownloadPolicy`로 `/coding download`의 변경 파일 목록 기반 선택, 1부터 시작하는 번호/상대 경로 선택, 목록 밖 경로 거부, sibling prefix 오인 방지, 안전 파일명 fallback, 8MB 첨부 상한을 분리했고 `TelegramCodingDownloadPolicyTests`와 `check-chat-telegram-contract`로 고정했다. 이번 회차에는 `TelegramClient`에 테스트용 `HttpClient` 주입 생성자를 추가하고 `TelegramClientTests`로 fake HTTP `sendDocument` multipart 요청의 endpoint, `chat_id`, caption, document 본문, 파일명과 Telegram route 미설정 시 무송신을 고정했다. 추가로 `docs/텔레그램_봇_가이드.md`와 `docs/NOTEBOOKS_AND_HANDOFF.md`에 모바일 handoff 운영 기준, 실제 모바일 QA 체크리스트, deep link 미도입 최종 판단을 문서화했고 `check-chat-telegram-contract`가 문서 연결과 `omnux://` 링크 미생성을 검사한다. 이번 회차에는 `scripts/telegram-mobile-live-qa.mjs`를 추가해 실제 Telegram `sendMessage`, `sendDocument`, 모바일 `/omniqa-ok <QA-ID>` 응답, 모바일에서 받은 `.txt` 첨부 echo-back 문서 본문의 `QA-ID` 확인을 하나의 완료 판정으로 묶었다. 실제 token/chat id 기반 live QA는 개발 잔여작업에서 빼고, 사용자가 최종 테스트에서 `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk` 모두 `true`인지 확인하는 최종 수동 QA 항목으로 분리한다.
- 12번 내부 진행률: 100% 완료. `docs/기술스택_정리.md`와 `docs/en/tech-stack.md`에 언어 책임 경계, 원본 위치 경계, 루트/미들웨어 잔재 보관 금지 경계를 추가했다. 이번 회차에는 새 언어/런타임/프레임워크/번들러를 기본 거부하고, 예외 승인 시 책임자, canonical source home, 상태 파일 위치, secret 취급 방식, 빌드/검증 명령, 제거/rollback 계획을 남기도록 승인 기준을 추가했다. 또한 브랜드와 호환 alias 경계를 추가해 제품명, 패키지명, 런처, 상태 디렉터리, 새 사용자 노출 문구는 `omnux`를 canonical로 쓰고, `Omni-node`는 저장소 폴더명/이전 이름 설명/마이그레이션 예시에만 남기도록 정리했다. Phase 5 화면 이식 전후 `npm test`와 최소 `check-tech-stack-contract`/`check-repo-hygiene` 실행을 게이트로 못박고, 새 루트 앱/source home/번들러/package manager/runtime shortcut 생성을 승인 전 금지했다. 루트 `main.js`, `preload.js`, `worker.js` 번들 잔재와 `apps/omnux-middleware` 루트의 코딩 스모크 생성물(`main.py`, `ledger.py`, `main.js`, `planner.js`, `main.c`, `ledger.c`, `ledger.h`, 동반 snapshot/schedule/static/Java/app 산출물)도 제거했다. 최종적으로 루트 `omnux/` 디렉터리에 남아있던 React 기반 프로토타입 UI 찌꺼기 파일들(`app.jsx`, `ask.jsx` 등 14개 파일)을 사용자의 승인을 얻어 완전 삭제를 피하고 `docs/archive/omnux-prototype/` 하위로 보관 이동(archive)하였다. `scripts/check-tech-stack-contract.mjs`와 `scripts/check-repo-hygiene.mjs` 및 `npm test`가 모두 성공하며 이관 과정에서 위생 계약 문제가 없음을 최종 확인했다.
- 직전 회차 완료: `apps/omnux-middleware-tests/RefactorRollbackSnapshotTests.cs`에 apply 직후 생성된 rollback ID로 복원 성공/차단을 검증하는 테스트 2개를 추가했다. `apps/omnux-middleware-tests/WsRefactorCommandDispatcherTests.cs`에 `refactor_restore` 입력이 rollbackId와 previewId fallback 둘 다 서비스 restore로 전달되는지 검증하는 테스트 2개를 추가했다. `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --filter RefactorRollbackSnapshotTests`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --filter WsRefactorCommandDispatcherTests`, 전체 `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj`가 통과했다. live 미들웨어 `ws://127.0.0.1:41880/ws/`에서 `auth` -> `request_otp` -> `auth` -> `refactor_read` -> `refactor_preview` -> `refactor_apply` -> `refactor_restore` 순서로 실제 복원 성공을 확인했고, 재편집 후 복원 차단은 서비스 테스트로 고정했다. 결과적으로 `/tmp/omnux-live-rollback-workspace/file.txt`는 적용 후 `after\nkeep\n`, 복원 후 `before\nkeep\n`로 돌아갔다.
- 이번 회차 완료: 7번 Tauri 백엔드 충돌을 바로 scaffold로 밀지 않고, Rust/.NET 역할 경계를 먼저 계약화했다. `scripts/check-desktop-shell-boundary-contract.mjs`를 추가해 `develop.md`의 경계 문구와 `npm test` 연결을 확인했고, `apps/desktop` scaffold도 실제로 생성했다. 생성된 기본 템플릿에서 `greet` 예제와 샘플 로고를 걷어내고, Rust 셸은 앱 창만 띄우는 최소 구조로 맞췄다. 이번 회차에는 여기에 더해 `shell-store`로 .NET 미들웨어 연결 상태와 UI 로그 경계를 넣고, `ShellErrorBoundary`로 렌더 실패 fallback을 추가했으며, `App`과 `App.css`, `index.html`을 새 상태 경계에 맞게 정리했다. 또 `middleware-contract`와 런타임 부트 계약, healthz/readyz, 재연결 예약 상태까지 추가해 실제 접속 전 계약을 셸에서 바로 보이게 했고, 이번 회차에는 loopback cross-port Origin 허용, healthz/readyz 자동 probe, ping/pong 재연결 경계, 실제 Rust 셸의 `.NET` dev bootstrap 연결, `externalBin` sidecar 연결, 재연결 성공 시도 횟수 초기화, 카드별 Error Boundary, 카드 실패 로그 기록, Rust 생명주기 이벤트 emit, 프론트 bootstrap event listener까지 넣었다. `scripts/run-omnux-tests.mjs`에는 새 계약 검사를 연결했다.
- 이번 회차 추가 완료: 데스크톱 셸의 실제 런타임 확인 경로를 좁혀 붙였다. `apps/desktop/src/use-middleware-runtime-probe.ts`는 `healthz` 확인, `readyz` 사전 확인, WebSocket `ping`/`pong`, `readyz` 재확인 순서로 동작하고, HTTP/WebSocket 실패 시 제한된 재연결만 예약한다. `apps/desktop/src/shell-store.ts`와 `App.tsx`는 `healthStatus`/`readyStatus`와 상세 오류를 상태 카드에 표시한다. `apps/omnux-middleware/src/WebSocketGateway.Health.cs`와 `.Http.cs`는 로컬 Tauri dev origin(`localhost:1420`)에서 `healthz`/`readyz`를 읽을 수 있도록 health endpoint에만 loopback CORS를 좁게 허용했다. `scripts/check-desktop-shell-boundary-contract.mjs`와 `scripts/check-gateway-runtime-contract.mjs`에 이 계약을 추가했고, 실제 미들웨어 런타임 검사에서 `desktop_healthz_cors`, `desktop_readyz_cors`, `readyz_after_ping`을 확인했다.
- 이번 회차 완료: 8번 C11 코어 데몬 잔재 완전 삭제를 끝냈다. `apps/omnux-core` 폴더와 루트 `omnux-core`/`omninode-core` alias를 제거했고, `CoreProcessBootstrapper`, `CoreAuthToken`, `UdsCoreClient`를 삭제했다. `Program`은 더 이상 legacy bootstrap opt-in 분기를 갖지 않고 시작 시 `.NET` core runtime만 보고한다.
- 이번 회차 추가 완료: `AppConfig`, `PathOptions`, `DefaultStatePathResolver`, 테스트 fixture에서 `CoreSocketPath`와 `OMNUX_CORE_SOCKET_PATH` 경로를 제거했다. `scripts/check-gateway-runtime-contract.mjs`도 코어 바이너리 pid 추적과 legacy core socket 환경값을 제거해 실제 런타임 검사와 맞췄다.
- 이번 회차 추가 완료: `scripts/check-core-daemon-boundary-contract.mjs`를 레거시 보존 계약에서 레거시 부재 계약으로 바꿨다. 이 검사는 C11 코어 디렉터리/alias/C# 호환 파일이 다시 생기지 않는지, `.NET` `DotNetCoreRuntimeClient`가 metrics/guarded kill을 계속 담당하는지, 문서가 C11 코어를 활성 구성요소로 안내하지 않는지 확인한다.
- 이번 회차 추가 완료: README, QUICKSTART, 검증 가이드, 디렉터리 가이드, 아키텍처 문서, 기술 스택 문서, Gemini 리트리버 아키텍처 매핑에서 C11 코어 안내를 현재 구조에 맞게 제거했다. `scripts/check-tech-stack-contract.mjs`도 C11 source home 검사를 없애고 .NET 중심 경계를 검사한다.
- 이번 회차 완료: 12번 스택 파편화 잔재 청소를 1차 보강 완료로 올렸다. 루트 `main.js`, `preload.js`, `worker.js` 번들 잔재를 삭제했고, `apps/omnux-middleware` 루트에 남아 있던 Python/Node.js/C 산출물과 동반 `ledger.h`, `snapshot.*`, `schedule.json`, `index.html`, `styles.css`, Java 샘플, `app` 바이너리를 제거했다.
- 이번 회차 추가 완료: `scripts/check-repo-hygiene.mjs`는 ignored 파일이어도 루트/미들웨어 생성 스택 산출물이 실제 파일시스템에 남으면 실패한다. `scripts/check-tech-stack-contract.mjs`는 기술 스택 문서의 잔재 보관 금지 문구와 실제 파일 부재를 함께 검사한다.
- 이번 회차 미완료: 8번 기준 미완료 없음. 9번은 즉시 SQLite 도입 대신 JSON 큐+claim lease를 유지하고 DB 전환을 Phase 5 상태 DB 마이그레이션과 묶기로 최종 판단했다. 10번은 동기화 범위/충돌 정책, 선택적 범위 UX, 로컬 교차 루트 import 테스트, 수동 QA 기준을 portable package 안에 고정했지만 실제 Gist/클라우드 provider와 물리적으로 다른 머신 import 수동 QA는 남아 있다. 11번은 live QA 스크립트와 완료 판정까지 들어갔고, 현재 환경에 Telegram token/chat id가 없어 실행하지 못한 실제 모바일 수신/첨부 echo-back 확인은 사용자가 최종 테스트에서 수행하는 최종 수동 QA 항목으로 빼둔다. deep link는 지금 도입하지 않고 Phase 5 라우팅/앱 프로토콜 확정 뒤 재검토하기로 판단했다. 12번도 1차 보강 완료지만 완전 해결은 아니다. 새 언어/런타임 추가 승인 기준과 브랜드/호환 alias 경계는 문서와 계약 검사에 들어갔고, Phase 5 전체 마이그레이션 중 새 스택 유입 차단의 실제 적용 확인은 계속 남아 있다.
- 이번 회차 완료: 9번 멀티 에이전트 모드 비용 및 Rate Limit 폭주를 전역 큐잉으로 바로 밀지 않고, 세션 스폰 초입의 예산 정책과 admission gate로 1차 착수를 확장했다. `apps/omnux-middleware/src/AgentSpawnAdmissionLimiter.cs`를 추가해 전역 토큰 버킷과 동시성 예약 상한을 걸었고, `SessionSpawnTool`은 admission 실패 시 즉시 거부하며 ACP dispatch 실패 같은 생성 실패 시 reservation을 회수한다. 기존 `AgentSpawnBudgetPolicy`의 runtime/mode별 timeout/task 상한과 `CommandService.LogicGraphs.cs`의 `session_spawn` 900초 기본값은 유지한다. `scripts/check-security-boundaries.mjs`에는 새 정책/배선 계약을 추가했고, `apps/omnux-middleware-tests/AgentSpawnAdmissionLimiterTests.cs`로 토큰 버킷 고갈, refill, 일반/elevated 동시성 상한을 고정했다. `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false`, `node scripts/check-security-boundaries.mjs`, `git diff --check -- apps/omnux-middleware/src/AgentSpawnAdmissionLimiter.cs apps/omnux-middleware/src/SessionSpawnTool.cs apps/omnux-middleware-tests/AgentSpawnAdmissionLimiterTests.cs scripts/check-security-boundaries.mjs`가 통과했다.
- 이번 회차 추가 완료: ACP adapter command-mode 우선순위 제어에 더해 command transport 실패 시 staged 접수 폴백을 1차로 붙였다. `sessions_spawn`/logic graph 입력의 priority가 `SessionSpawnTool`의 `commandPriority`로 정규화되고, ACP dispatch payload와 `AcpSessionBindingAdapter`, `acp-adapter-codex-exec.js`까지 전달된다. 기본 ACP run은 background로 낮추고, explicit `interactive|background|normal` 계열 값을 받아 command process/codex child process priority를 best-effort로 적용한다. `AcpSessionBindingAdapter`는 command process 시작/입력/대기 실패 시 `command_fallback_staged`로 되돌아가며, `SessionSpawnTool`은 결과 note에 staged queue receipt를 노출한다. `apps/omnux-middleware-tests/AcpSessionBindingAdapterTests.cs`로 priority 정규화, command fallback staged 접수, ACP dispatch trace 전달을 고정했고, `scripts/check-security-boundaries.mjs` 계약도 보강했다. 이번 회차 검증은 관련 테스트와 보안 계약 검사까지 완료했다.
- 이번 회차 추가 완료: 9번 폭주 제어에 `AgentSpawnDailyCostLedger`를 더해 `sessions_spawn` 하루 누적 비용을 `agent_spawn_daily_cost_ledger.json`에 영속 기록하고, 일일 cap을 넘는 호출은 생성 전 즉시 거부하도록 했다. `SessionSpawnTool`은 비용 reservation을 성공 note에 표시하고, ACP dispatch 실패 시 admission reservation과 daily cost reservation을 함께 회수한다. `apps/omnux-middleware-tests/AgentSpawnDailyCostLedgerTests.cs`로 일일 비용 cap 초과 차단을 고정했고, `scripts/check-security-boundaries.mjs` 계약도 보강했다.
- 이번 회차 추가 완료: 9번 Groq 429 지연 재처리의 최소 영속 장치를 추가했다. `GroqRateLimitHeaderParser`는 429 응답에서만 `retry-after`를 파싱해 최대 30분까지 `CooldownUntilUtc`를 만들고, `LlmRouter`는 이를 `llm_usage.json`의 `GroqRateByModel`에 저장한다. 이후 같은 모델의 Groq 비스트리밍/스트리밍/멀티모달 호출과 intent 분류는 cooldown이 살아 있으면 실제 API 호출을 하지 않는다. `CommandService.ProviderRouting`은 cooldown 모델을 한도 근접 모델로 보고 Groq 모델 전환 후보에서 피하며, WebSocket 모델 JSON과 텔레그램 `/llm usage` 출력에도 cooldown 시각을 노출한다. `apps/omnux-middleware-tests/GroqRateLimitHeaderParserTests.cs`와 `UsageStatePersistenceTests.cs`, `scripts/check-security-boundaries.mjs`로 이 계약을 고정했다.
- 이번 회차 추가 완료: 9번에 `agent_spawn_queue.json` 기반 영속 큐와 백그라운드 flush 루프를 추가했다. `SessionSpawnTool`은 concurrency/token bucket/daily cost cap/429/rate-limit 계열 일시적 거부를 `followUpStatus=queued`, `followUpAction=wait_for_queue`로 접수하고, `Program`은 15초 간격으로 `FlushQueuedSpawns(maxCount: 2)`를 실행한다. 큐 항목은 기존 child session key와 run id를 유지해 재개되고, 실패가 반복되면 `FileAgentSpawnQueueStore.MaxRetryAttempts` 8회 이후 dead-letter로 큐에서 제거된다.
- 이번 회차 추가 완료: 9번 JSON 큐의 동시 쓰기 약점을 줄이기 위해 `FileAgentSpawnQueueStore`의 enqueue/ready scan/snapshot/delivered/failed 갱신 구간을 `.queue.lease` 파일 락으로 감쌌다. 이는 SQLite 전환 전 현실적인 완충장치이며, 여러 프로세스가 같은 `agent_spawn_queue.json`을 동시에 read-modify-write 하며 덮어쓰는 위험을 줄인다.
- 이번 회차 추가 완료: SQLite/DB 큐 전환 최종 판단 완료. 외부 SQLite 패키지를 AOT 미들웨어에 즉시 추가하지 않고 JSON 큐의 가장 큰 실제 결함인 중복 flush를 먼저 닫았다. `FileAgentSpawnQueueStore.ClaimReadyEntries`는 store lease 안에서 ready 항목에 `LeaseOwner`와 `LeasedUntilUtc`를 저장하고, `SessionSpawnTool.FlushQueuedSpawns`는 claim된 항목만 dispatch한다. 같은 큐 파일을 보는 두 store 인스턴스가 lease 만료 전 같은 항목을 다시 claim하지 못하는 테스트로 고정했다. 실제 SQLite 큐 전환은 단독으로 서두르지 않고 Phase 5 상태 DB 마이그레이션과 묶는다.
- 이번 회차 추가 완료: `SessionSpawnTool`에 읽기 전용 `GetQueueStatus()`를 추가해 브레이커 활성 여부와 큐 스냅샷을 함께 돌려주도록 했다. 큐가 누적된 `sessions_spawn` 결과 note에는 `queue_observed`, `next_attempt_utc`, `oldest_reason`, `latest_error`, `near_dead_letter` 요약을 붙여 운영자가 현재 압력을 바로 읽을 수 있게 했다. 관련 테스트는 `AgentSpawnQueueStoreTests.GetQueueStatus_ExposesQueueAndBreakerState`로 고정했다.
- 이번 회차 추가 완료: 내부 큐 상태 조회를 WS 호출 표면까지 노출했다. `sessions_spawn` 메시지에 `action=status`를 보내면 task 없이 `sessions_spawn_result`가 반환되고, 응답에는 `breakerBlocked`, `breakerReason`, `breakerMessage`, `queue.total`, `queue.ready`, `queue.nextAttemptUtc`, `queue.nextEntryId`, `queue.nextReason`, `queue.nextError`, `queue.nextAttemptCount`, `queue.nearDeadLetterCount`가 포함된다. `ToolApplicationService.GetSessionSpawnStatus()`와 `CommandService.GetSessionSpawnStatus()` 위임도 추가해 내부 전용 API에 갇히지 않게 했다.
- 이번 회차 추가 완료: `AgentSpawnRunBreaker`를 더해 `agent_spawn_breaker.json`이 활성화되면 신규 `sessions_spawn`과 `FlushQueuedSpawns`를 `blocked_by_breaker`/`wait_for_operator`로 멈추도록 했다. 이후 ACP command-mode에는 같은 브레이커 상태를 실행 중 adapter까지 전달해 `codex exec` process group 종료까지 1차 연결했고, `FileAgentSpawnActiveRunStore.MarkActiveBlockedByBreaker`로 active run을 완료 이력으로 내려 상태 조회와 맞췄다.
- 이번 회차 추가 완료: `FileAgentSpawnActiveRunStore`와 `agent_spawn_active.json`을 추가해 `sessions_spawn`의 active run 시작, backend 식별자, session active 상태, 완료, 실패, stale, `blocked_by_breaker` 전환을 영속 추적한다. WS `sessions_spawn action=status` 응답에는 `active.activeCount`, `active.oldestRunId`, `active.oldestRuntime`, `active.oldestMode`, `active.oldestBackend`, `active.oldestStartedUtc`, `active.oldestAgeSeconds`, `active.completedHistoryCount`가 포함된다. 이는 실행 중 작업 kill/rollback 연결을 위한 선행 관측 계층이다.
- 이번 회차 추가 완료: ACP command-mode 하드 브레이커를 실행 중 `codex exec`에 1차 연결했다. `AcpSessionBindingAdapter`는 command payload에 `breakerStatePath`를 포함하고, `SessionSpawnTool`은 기본 상태 경로의 `agent_spawn_breaker.json`을 전달한다. `acp-adapter-codex-exec.js`는 `enabled`/`Enabled` 브레이커 플래그를 모두 지원하고, 브레이커 활성 시 실행 중인 child process group에 `SIGTERM`을 보낸 뒤 `SIGKILL` fallback을 예약한다. fake `codex` 스모크로 PascalCase 브레이커와 SIGTERM 수신까지 확인했다.
- 이번 회차 추가 완료: 9번 브레이커의 프로세스 없는 lane을 얼버무리지 않고 fail-closed로 닫았다. `ToolApplicationService.SpawnSession`이 `commandPriority`를 ACP 모델 인자 위치로 잘못 전달하던 버그를 named argument로 고쳤고, `SessionSpawnTool`은 브레이커로 닫힌 active run transcript에 `killAction`과 `recoveryAction`을 남긴다. `SessionSendTool`은 `blocked_by_breaker` 태그나 `sessions_spawn_breaker_closed` transcript가 있는 child session으로 들어오는 follow-up을 거부한다. 즉 command-mode는 adapter가 process group kill을 담당하고, staged/fake/subagent처럼 실제 OS 프로세스가 없는 lane은 `not_applicable_no_process`로 기록한 뒤 transcript를 닫는다.
- 이번 회차 추가 완료: 9번 command-mode workspace rollback 정책을 구현했다. `AgentSpawnWorkspaceRollbackPolicy`는 ACP command-mode 실행 전 workspace 텍스트 파일 baseline을 제한된 수/용량으로 캡처하고, 실행 후 수정/생성/삭제된 파일만 Safe Refactor rollback snapshot으로 저장한다. `RefactorRollbackFile`은 `OriginalExists`/`AppliedExists`를 지원해 생성 파일 삭제와 삭제 파일 복원까지 처리한다. `SessionSpawnTool`은 rollback snapshot이 있으면 active run과 transcript에 `workspaceRollbackId`를 남기고, 브레이커 종료 메시지는 `restore_workspace_rollback_snapshot` 회복 액션을 표시한다. 실제 command adapter 모드에서 수정/생성/삭제 후 복원까지 live QA 회귀 테스트로 고정했고, 제외 디렉터리는 snapshot 대상에서 빠지는지 확인했다.
- 이번 회차 미완료: 9번은 1차 보강 완료 상태이며, 즉시 운영 차단 기준으로 남은 구현은 없다. JSON 파일 기반 큐는 파일 lease와 claim lease로 중복 실행 위험을 줄였지만, SQLite/DB 트랜잭션 큐처럼 durable transaction, index, crash recovery, 장기 운영 분석까지 제공하지는 않는다. 이 장기 DB 전환은 Phase 5 상태 DB 마이그레이션과 묶어 처리한다. snapshot 범위의 장기 운영 튜닝은 별도 관찰 항목으로 남긴다.
- 이번 회차 완료: 10번 로컬 고립 한계를 바로 클라우드 동기화로 크게 벌리지 않고, 기존 백업 export/import를 portable package 계약으로 먼저 좁혔다. `ConversationApplicationService.ExportBackup`은 ZIP 최상단에 `omnux-package.json` manifest를 추가하고, import는 이 manifest를 상태 파일로 쓰지 않는 metadata로 건너뛴다. `OmniJsonContext`에는 `BackupPackageManifest`를 등록해 AOT 경고 없이 직렬화한다. `ConversationApplicationServiceBackupTests`는 포함 범위와 제외 범위, manifest metadata skip을 고정한다. `apps/omnux-dashboard/settings.js`와 `apps/omnux-dashboard/modules/settings-page-state.js`를 보강해 portable package 설명, export/download 상태, preview/apply 상태, 덮어쓰기 적용 버튼을 Settings 화면에 노출했다.
- 이번 회차 추가 완료: 10번 portable package manifest에 파일별 `SHA-256` 무결성 필드를 추가했다. export 시 manifest를 제외한 ZIP 내부 파일 digest를 기록하고, `PreviewBackupImport`와 `ApplyBackupImport`가 manifest digest 기준으로 누락/추가/중복/변조 파일을 차단한다. `ConversationApplicationServiceBackupTests`에 preview 단계 변조 차단과 apply 단계 재검증 차단 테스트를 추가했고, `scripts/check-security-boundaries.mjs`에도 이 계약을 고정했다.
- 이번 회차 추가 완료: 10번 동기화 브릿지의 범위/충돌 정책을 실제 portable package 계약에 넣었다. `BackupSyncPolicy`는 현재 모드를 `portable-package-only`로 명시하고, 클라우드 provider가 설정되기 전에는 Gist/클라우드 브릿지를 활성화하지 않는다고 적는다. import preview는 `fileConflictCount`와 `fileConflicts`를 계산해 대화 ID 충돌과 파일 충돌을 분리 표시하고, Settings 화면은 `syncMode`와 `syncConflictPolicy`를 보여준다. overwrite=false는 기존 파일을 건너뛰고 overwrite=true는 교체하는 기존 적용 정책을 문서화된 충돌 정책으로 고정했다.
- 이번 회차 추가 완료: 10번 선택적 패키지 범위 UX를 붙였다. `BackupExportOptions.IncludeScopes`와 WebSocket `includeScopes`를 추가해 기존 전체 export는 유지하면서 선택된 scope만 ZIP에 포함한다. manifest `Includes`, `SyncPolicy.Scope`, export 결과 `scope`도 실제 선택 범위와 일치한다. Settings 화면은 “포함 범위” 체크박스와 전체 선택 버튼을 표시하고, 선택 범위가 없으면 export를 막는다. `ConversationApplicationServiceBackupTests.ExportBackupHonorsSelectedPortableScopes`와 `scripts/check-security-boundaries.mjs`로 선택 scope export, WS 배선, Settings UI 배선을 고정했다.
- 이번 회차 추가 완료: 10번 portable package의 다른 루트 적용 경로를 테스트와 수동 QA로 보강했다. `ConversationApplicationServiceBackupTests.PortablePackageAppliesToSeparateStateAndWorkspaceRoots`는 source 루트에서 export한 ZIP을 비어 있는 target state/workspace 루트에 preview/apply해 대화, 루틴, 라우팅 정책, 메모리, plans, tasks, notebooks, global/project skills, global/project commands가 대상 위치로 들어가는지 확인한다. 동시에 `auth_sessions.json`, `llm_usage.json`, `telegram_reply_outbox.json`, runtime log와 `omnux-package.json`은 import 대상 상태 파일로 저장되지 않는지 확인한다. `docs/OMNUX_실환경_수동_최종회귀_체크리스트.md`에는 portable package 수동 QA와 실제 provider 미도입 기준을 추가했고, `scripts/check-security-boundaries.mjs`가 새 테스트명과 수동 QA 문구를 고정한다.
- 이번 회차 추가 완료: 10번 portable package의 머신별 경로 누출 방지를 추가했다. `ConversationApplicationServiceBackupTests.ExportBackupDoesNotLeakMachineSpecificPaths`는 `omnux-package.json` manifest와 ZIP entry 이름에 source root, state root, workspace root 같은 로컬 절대 경로가 들어가지 않고, ZIP entry가 상대 경로이며 `..`와 Windows backslash를 포함하지 않는지 확인한다. `docs/OMNUX_실환경_수동_최종회귀_체크리스트.md`와 `scripts/check-security-boundaries.mjs`도 이 경계를 검사한다. 실제 Gist/클라우드 provider와 물리적으로 다른 머신 import QA는 여전히 외부 검증으로 남긴다.
- 이번 회차 추가 완료: 11번 텔레그램 모바일 UX 붕괴를 바로 대규모 차단으로 밀지 않고, 먼저 handoff 경계를 사용자에게 보이는 도움말과 자연어 매핑에 고정했다. `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHelpTextPolicy.cs`는 `/handoff` 도움말에 “텔레그램=알림/트리거, 무거운 작업=데스크톱” 안내를 포함한다. `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramNaturalCommandPolicy.cs`는 데스크톱 이어보기/desktop handoff 요청을 `/handoff`로 라우팅한다. 관련 테스트는 `TelegramHelpTextPolicyTests`와 `TelegramNaturalCommandPolicyTests`에 추가했다.
- 이번 회차 추가 완료: 텔레그램 응답 포맷터가 길이 제한에 걸리면 단순 truncation marker만 남기지 않고 `/handoff`와 데스크톱 이어보기 안내를 함께 붙이도록 좁혔다. 이번 회차에는 diff/로그처럼 무거운 출력도 모바일 요약+handoff로 먼저 줄였고, `TelegramResponseFormatterPolicyTests`와 `check-chat-telegram-contract`도 이 경계를 고정했다.
- 이번 회차 추가 완료: 11번 명령별 무거운 출력 차단을 추가했다. `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCommandHandoffPolicy.cs`는 대형 명령 출력의 크기/라인 수를 보고 `telegram_command_output_handoff` marker가 포함된 짧은 프리뷰와 다음 명령만 만든다. `/coding file` 대형 파일, `/refactor preview` 대형 diff, `/task output` 대형 stdout/stderr/result, `/doctor json` 대형 JSON은 텔레그램 본문에 직접 풀지 않는다. `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHandoffPresentationPolicy.cs`는 `/handoff` 결과에 데스크톱 Notebooks/Handoff 화면과 로컬 `handoff.md` 경로를 안내한다. `TelegramCommandHandoffPolicyTests`, `TelegramHandoffPresentationPolicyTests`, `check-chat-telegram-contract`로 이 경계를 고정했다.
- 이번 회차 추가 완료: 11번 `/coding download` 파일 선택/첨부 정책을 분리했다. `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCodingDownloadPolicy.cs`는 최근 코딩 결과의 변경 파일 목록에서만 다운로드 대상을 고르고, 1부터 시작하는 번호, 상대 경로, 안전 파일명, 8MB 문서 상한을 처리한다. 변경 파일 목록 밖 임의 경로는 거부하고 `/tmp/run`과 `/tmp/run2` 같은 sibling prefix를 같은 실행 디렉터리로 오인하지 않도록 했다. `apps/omnux-middleware-tests/TelegramCodingDownloadPolicyTests.cs`와 `scripts/check-chat-telegram-contract.mjs`로 이 정책과 문서 문구를 고정했다.
- 이번 회차 추가 완료: 11번 텔레그램 문서 첨부 HTTP 경로를 로컬 fake HTTP 테스트로 고정했다. `apps/omnux-middleware/src/TelegramClient.cs`에는 운영 public 생성자는 유지한 채 테스트용 `HttpClient` 주입 생성자를 추가했다. `apps/omnux-middleware-tests/TelegramClientTests.cs`는 `SendDocumentAsync`가 `sendDocument` endpoint로 multipart 요청을 보내고 `chat_id`, caption, document 본문, 파일명을 포함하는지 확인하며, Telegram token/chat id가 없으면 요청을 보내지 않는지 검증한다. 실제 모바일 클라이언트에서 첨부가 보이는지는 여전히 외부 실사용 QA로 남긴다.
- 이번 회차 추가 완료: 11번 실제 모바일 QA를 막연한 수동 체크리스트가 아니라 실행 가능한 live QA로 좁혔다. `scripts/telegram-mobile-live-qa.mjs`는 `OMNUX_TELEGRAM_BOT_TOKEN`/`OMNUX_TELEGRAM_CHAT_ID`, `*_FILE`, 기본 macOS Keychain 항목을 순서대로 읽고, 실제 Telegram `sendMessage`와 `sendDocument`를 보낸 뒤 모바일에서 `/omniqa-ok <QA-ID>` 응답과 `.txt` 첨부 echo-back 문서 본문의 같은 `QA-ID`를 확인한다. 완료 판정은 `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk` 4개가 모두 `true`일 때만 통과한다. `docs/텔레그램_봇_가이드.md`와 `docs/OMNUX_실환경_수동_최종회귀_체크리스트.md`, `scripts/check-chat-telegram-contract.mjs`에 이 live QA 경로를 연결했다.
- 이번 회차 추가 완료: 12번 기술 스택 파편화 방지를 위해 기술 스택 문서에 원본 위치 경계와 잔재 보관 금지를 추가했고, `scripts/check-tech-stack-contract.mjs`가 canonical source home별 허용 파일 확장자와 루트/미들웨어 생성 산출물 부재를 검사하도록 보강했다. `scripts/check-repo-hygiene.mjs`도 ignored 생성물이 실제 파일시스템에 남아 있으면 실패하도록 확장했다.
- 이번 회차 추가 완료: 12번 브랜드와 호환 alias 경계를 문서와 계약 검사에 추가했다. `omnux`를 제품명, 패키지명, 런처, 상태 디렉터리, 새 사용자 노출 문구의 canonical 이름으로 고정했고, `Omni-node`는 저장소 폴더명/이전 이름 설명/마이그레이션 예시에만 남기도록 제한했다. `scripts/check-tech-stack-contract.mjs`는 `package.json` 이름, `README.en.md` 제목, 대시보드 셸 브랜드, legacy alias 재생성 금지 문구를 확인한다.

### [향후 확인 및 최우선 보완(Next Step) 제언]
현재 **'1차 착수 및 보강' 단계인 항목들이 100% 완전 해결(Full Resolution)로 가기 위해 남은 핵심 보완점**은 다음과 같습니다.

1. **결함 9번: 멀티 에이전트 폭주 제어 (현재 99.9%)**
   - **영속 큐 1차 완료:** 메모리 단위 거부 대신 `agent_spawn_queue.json`에 지연 작업을 저장하고 백그라운드 flush로 재개한다.
   - **429/Rate Limit 지연 처리 1차 완료:** Groq `Retry-After` cooldown과 `sessions_spawn` 일시적 거부 큐잉은 들어갔다.
   - **운영 브레이커 1차 완료:** `agent_spawn_breaker.json`이 켜져 있으면 신규 `sessions_spawn`과 큐 flush를 `blocked_by_breaker`/`wait_for_operator`로 중단한다.
   - **큐 상태 조회 1차 완료:** 읽기 전용 `GetQueueStatus()`, 큐 압력 note, WS `sessions_spawn action=status`로 브레이커 상태, 가장 오래된 대기 항목, near-dead-letter 압력을 확인한다.
   - **active run 상태 전환 1차 완료:** `agent_spawn_active.json`과 WS status active snapshot으로 현재 실행 중인 run 수와 가장 오래된 run 압력을 확인하고, 브레이커 활성 시 active run을 `blocked_by_breaker` 완료 이력으로 내린다.
   - **ACP command-mode 하드 브레이커 1차 완료:** `agent_spawn_breaker.json` 활성 시 실행 중 `codex exec` process group을 종료한다.
   - **프로세스 없는 lane fail-closed 완료:** staged/fake ACP와 일반 subagent는 실제 OS 프로세스가 없으므로 `killAction=not_applicable_no_process`로 transcript에 기록하고 `sessions_send` follow-up을 차단한다.
   - **workspace rollback 1차 완료:** ACP command-mode 실행 전/후 workspace 텍스트 baseline diff를 저장하고, 생성/삭제/수정 파일을 Safe Refactor rollback snapshot으로 복원할 수 있게 했다. 실제 command adapter live QA에서 수정/생성/삭제 후 복원까지 확인했고, 브레이커 transcript는 `workspaceRollbackId`와 `restore_workspace_rollback_snapshot` 회복 액션을 남긴다.
   - **저장소 판단 완료:** 현재 큐는 JSON 원자 저장, 파일 lease, claim lease 기반의 현실적 최소 구현으로 유지한다. AOT 미들웨어에 즉시 SQLite 패키지를 붙이지 않고, SQLite/DB 큐 전환은 Phase 5 상태 DB 마이그레이션과 묶는다.

2. **결함 8번: C11 코어 데몬 잔재 완전 삭제 (현재 100%, 완료)**
   - `apps/omnux-core`, 루트 core alias, legacy bootstrap/auth/UDS 호환 경로, C core 수동 빌드 안내를 제거했다. 이후 유지 기준은 `.NET` `DotNetCoreRuntimeClient`의 metrics/guarded kill과 `core_runtime` doctor뿐이다.

3. **결함 4번: God Object (`CommandService`) 완전 분리 (현재 99.9%)**
   - 코드는 Partial과 Policy로 분리되었지만 논리적인 중앙집권형 라우팅은 여전합니다. 완벽한 분리를 위해 CQRS 패턴이나 이벤트 버스(MediatR 등)를 도입하여, Publish-Subscribe 구조로 아키텍처를 뒤집는 작업이 남아 있습니다.

4. **결함 5번: React 프론트엔드 상태 관리 완전 단일화**
   - Phase 5 마이그레이션 진행 시 전역 상태는 무조건 `Zustand`로 단일화해야 합니다. Prop Drilling 코드를 완전히 제거하고, 상태 꼬임 폭탄을 막기 위한 강도 높은 수동 E2E 회귀 테스트(Regression Test)가 병행되어야 합니다.

### [부록 A. 상세 변경사항 로그 - 내용 보존]
- `apps/omnux-middleware/src/CommandService.Execution.cs`
  - 첨부 입력 정규화를 `InputAttachmentPolicy.Normalize`로 이동했다.
  - 오디오 첨부 판별을 `InputAttachmentPolicy.TryGetAudioAttachment`로 이동했다.
  - `ExecuteCoreAsync`의 메인 라우팅을 Telegram direct command, unified slash, 비슬래시 자연어, routine/system, telegram chat fallback, intent fallback helper로 나눴다.
- `apps/omnux-middleware/src/CommandService.Execution.TelegramRouting.cs`
  - 텔레그램 직접 명령 묶음의 우선순위와 반환 경계를 전담하는 helper를 추가했다.
- `apps/omnux-middleware/src/CommandService.Execution.PostRouting.cs`
  - 비슬래시 자연어, 루틴, 시스템 명령, 텔레그램 채팅 fallback, intent fallback을 전담하는 helper를 추가했다.
- `apps/omnux-middleware/src/CommandService.InputPreparation.cs`
  - 입력 첨부 정규화 경로를 새 정책으로 통일했다.
- `apps/omnux-middleware/src/CommandService.Telegram.cs`
  - 텔레그램 입력 처리의 첨부 정규화 경로를 새 정책으로 통일했다.
  - `BuildLocalNowText`와 `/kill` 파서 경로를 정책으로 이동했다.
  - LLM 도움말 본문 생성을 `CommandHelpTextPolicy.BuildUnifiedLlmHelpText`로 위임했다.
- `apps/omnux-middleware/src/CommandService.Telegram.MemoryCommand.cs`
  - 텔레그램 `/memory clear|create|help` 실행을 `CommandService.Telegram.LlmControl.cs`에서 분리해 전담하도록 추가했다.
- `apps/omnux-middleware/src/CommandService.Telegram.LlmCommandBoundary.cs`
  - 텔레그램 `/llm` control command 실행 switch와 provider/model mutation bridge를 명시적 request boundary로 분리해 전담하도록 추가했다.
- `apps/omnux-middleware/src/Application/TelegramLlmMutationApplicationService.cs`
  - 텔레그램 LLM quick/Groq/Copilot selected model 변경, 단일/오케스트레이션/다중 provider/model 변경, summary provider 변경을 application service command boundary로 분리했다.
  - `LlmPreferenceContext`와 Groq/Copilot selected model delegate를 받아 상태 쓰기를 담당하고, `CommandService.Telegram.LlmChannelMutation.cs`는 이 service를 호출하는 얇은 위임 helper로 축소했다.
- `apps/omnux-middleware/src/Application/LlmSettingsApplicationService.cs`
  - 웹/텔레그램 채널 프로필 적용, 모드 변경, provider/model 변경, 상태 출력 snapshot 생성을 application service command boundary로 분리했다.
  - 웹 LLM preference state mutation은 이 service가 직접 담당하고, 텔레그램 provider/model mutation은 `TelegramLlmMutationApplicationService`로 위임해 상태 쓰기 경계를 중복하지 않게 했다.
  - 이번 추가 회차에는 `TelegramLlmProfileCommandMutationRequest`와 `ApplyTelegramProfileCommand`를 추가해 텔레그램 `/talk`·`/code` 명령의 직접 프로필 state mutation도 이 service로 옮겼다.
- `apps/omnux-middleware/src/CommandService.Telegram.LlmChannelMutation.cs`
  - 텔레그램 provider/model channel mutation, command multi-channel lock bridge, 자연어 provider/model mutation bridge를 전담하도록 추가했다.
  - `/model` quick selection, Groq selected model, Copilot selected model 쓰기를 `TelegramQuickModelSelectionMutationRequest`, `TelegramGroqModelSelectionMutationRequest`, `TelegramCopilotModelSelectionMutationRequest` 기반 helper로 모아 `CommandService.Telegram.LlmModelSelection.cs`의 직접 preference mutation을 제거했다.
  - 추가로 실제 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter`, `_copilotWrapper`, `SetChannelProvider`, `SetChannelModel` 접근을 `TelegramLlmMutationApplicationService`로 넘겨 직접 상태 mutation을 제거했다.
  - 이번 추가 회차에는 `ApplyTelegramProfileCommandMutation` bridge를 추가해 `CommandService.Telegram.cs`의 `/talk`·`/code` 프로필 명령을 `LlmSettingsApplicationService`로 넘긴다.
- `apps/omnux-middleware/src/CommandService.Telegram.cs`
  - `/talk`·`/code` 명령의 직접 `_telegramLlmPreferences` lock/mutation과 `ApplyTelegramTalkDefaults`, `ApplyTelegramCodeDefaults` helper를 제거하고, `TelegramLlmProfileCommandMutationRequest` 기반 위임으로 전환했다.
- `apps/omnux-middleware/src/CommandService.Telegram.LlmModelSelection.cs`
  - 텔레그램 `/model` quick selection, Groq/Copilot 모델 설정 실행, 자연어 provider/model 변경 bridge를 `CommandService.Telegram.LlmControl.cs`에서 분리해 전담하도록 추가했다.
  - quick model/Groq/Copilot 설정 시 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter.TrySetSelectedGroqModel`, `_copilotWrapper.TrySetSelectedModel`를 직접 만지지 않고 `CommandService.Telegram.LlmChannelMutation.cs`의 mutation request helper로 위임하도록 축소했다.
- `apps/omnux-middleware/src/CommandService.Telegram.LlmReports.cs`
  - 텔레그램 LLM 상태, 모델 목록, 사용량 리포트 본문 생성을 `CommandService.Telegram.LlmControl.cs`에서 분리해 전담하도록 추가했다.
- `apps/omnux-middleware/src/CommandService.NaturalCommands.cs`
  - `/llm help`와 `/memory` 도움말 본문 생성을 `CommandHelpTextPolicy`로 위임했다.
  - 자연어 결정적 fast-path를 `NaturalCommandDeterministicPolicy`로 위임했다.
  - 자연어 해석 결과의 판정/정규화 경계를 `NaturalCommandValidationPolicy`로 위임했다.
  - 자연어 해석 후보 선택과 resolver prompt 생성을 `NaturalCommandCandidatePolicy`로 위임했다.
  - 자연어 해석 루프를 `NaturalCommandResolutionPolicy`로 위임했다.
  - 통합 슬래시/LLM 명령의 토큰 판정과 route 선택을 `UnifiedSlashCommandPolicy`로 넘겨 자연어 해석 파일의 책임을 줄였다.
  - 프로필/provider/model/상태 출력 helper를 `CommandService.LlmSettings`로 옮겨 자연어 해석 전용에 가깝게 축소했다.
- `apps/omnux-middleware/src/CommandService.LlmSettings.cs`
  - 채널 프로필 적용, 채널 mode/provider/model 설정, 채널 모델 상태 출력, provider/model 표시 포맷, 웹 talk/code 기본값 적용, 텔레그램/웹 provider/model core setter를 전담하는 partial을 추가했다.
  - 이번 추가 회차에는 직접 `_telegramLlmPreferences`, `_webLlmPreferences`, `_telegramLlmLock`, `_webLlmLock` 접근과 provider/model core setter를 제거하고 `LlmSettingsApplicationService` 위임 wrapper와 표시 helper만 남기도록 축소했다.
- `apps/omnux-middleware/src/CommandService.LlmSettingsRouting.cs`
  - `/llm set groq|copilot`의 source별 채널 모델 설정 helper를 `UnifiedSlashCommandExecution`에서 분리했다.
  - `/llm set codex|nvidia`까지 포함하는 provider별 모델 라우팅 helper(`SetChannelModelForProviderAsync`)도 이 partial로 이동했다.
- `apps/omnux-middleware-tests/LlmSettingsApplicationServiceTests.cs`
  - 웹 talk preset 적용, 텔레그램 provider mutation service 위임, legacy Cerebras 모델 정규화, 채널 status snapshot 출력을 테스트로 고정했다.
  - 이번 추가 회차에는 `ApplyTelegramProfileCommandReturnsActualThinkingLevel`을 추가해 `/talk` 무인자 경로가 기존처럼 `thinking=low`를 반환하는지 고정했다.
- `apps/omnux-middleware/src/CommandService.NaturalCommandExecution.cs`
  - 자연어 compound/deterministic/resolved 실행과 audit log를 명시적 helper로 분리했다.
  - `ReenterNaturalCommandAsync` 기반 public `ExecuteAsync` 재호출을 제거하고, 자연어 결과 명령을 `NaturalCommandExecutionRequest`로 감싸 `ExecuteNaturalCommandDispatchAsync`에서 `ExecuteNormalizedCommandRoutingAsync`로 직접 전달한다.
- `apps/omnux-middleware/src/CommandService.Execution.Dispatch.cs`
  - 입력 정규화 이후 공통 명령 라우팅을 전담하는 partial을 추가했다. command receipt 기록, 텔레그램 slash alias rewrite, `/help`, 텔레그램 직접 명령, unified slash, post-unified routing 연결을 담당한다.
- `apps/omnux-middleware/src/UnifiedSlashCommandPolicy.cs`
  - `/talk`, `/profile`, `/mode`, `/provider`, `/model`, `/status`, `/memory`, `/doctor`, `/plan`, `/task`, `/notebook`, `/handoff`, `/llm`의 route 판정, usage 메시지, alias 정규화, doctor/memory flag 판정을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.cs`
  - `TryHandleUnifiedSlashCommandAsync`만 남겨 통합 슬래시 parse 후 실행 진입을 담당하게 했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Core.cs`
  - static 메시지 처리 후 channel 실행 helper와 memory/doctor/domain/LLM orchestration helper로 위임하도록 정리했다. profile/mode/provider/model/status 직접 실행은 제거했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Channel.cs`
  - `/profile`, `/talk`, `/mode`, `/provider`, `/model`, `/status`에서 들어오는 채널 프로필/모드/provider/model/status 실행을 전담하는 partial을 추가했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Memory.cs`
  - `/memory clear|create|help` kind guard 후 memory boundary로 위임하도록 정리했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.MemoryBoundary.cs`
  - `/memory clear|create|help` 실행 bridge를 `UnifiedSlashMemoryCommandRequest` 기반 명시적 boundary로 묶었다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Doctor.cs`
  - `/doctor` kind guard 후 doctor boundary로 위임하도록 정리했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.DoctorBoundary.cs`
  - `/doctor` 실행 bridge를 `UnifiedSlashDoctorCommandRequest` 기반 명시적 boundary로 묶었다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Domain.cs`
  - `/plan`, `/task`, `/notebook`, `/handoff` kind guard 후 domain boundary로 위임하도록 정리했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.DomainBoundary.cs`
  - `/plan`, `/task`, `/notebook`, `/handoff` 실행 bridge를 `UnifiedSlashDomainCommandRequest` 기반 명시적 boundary로 묶었다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.Llm.cs`
  - `/llm help|usage|models|set ...` kind guard 후 LLM boundary로 위임하도록 정리했다.
- `apps/omnux-middleware/src/UnifiedSlashCommandExecution.LlmBoundary.cs`
  - `/llm help|usage|models|set ...` 실행 bridge를 `UnifiedSlashLlmCommandRequest` 기반 명시적 boundary로 묶었다.
  - `/llm set groq|copilot|codex|nvidia` 실행 경로는 기존 source별 채널 설정 동작을 유지하되, provider routing은 `CommandService.LlmSettingsRouting`으로 옮긴 경계를 계속 사용한다.
- `apps/omnux-middleware/src/NaturalCommandCandidatePolicy.cs`
  - 텔레그램/웹 LLM 설정 스냅샷을 자연어 해석용 후보 선택 입력으로 정규화했다.
  - 자연어 해석 후보 provider/model 선택, fallback provider 순서, resolver prompt 생성을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/NaturalCommandResolutionPolicy.cs`
  - 자연어 해석 후보를 순회하며 JSON 해석 결과를 고신뢰도 command 우선으로 선택하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/NaturalCommandDispatchPolicy.cs`
  - 자연어 해석 결과를 실행/채팅/거부/무시로 판정하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/NaturalCommandInterpretationPolicy.cs`
  - LLM 자연어 해석 결과의 JSON 코드펜스 추출, JSON 정규화, args 파싱을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/NaturalCommandValidationPolicy.cs`
  - 자연어 명령 판정, kill 의도 감지, 키 정규화, `ContainsExplicit*` 판정, 검증 결과 생성을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/CommandService.Telegram.Coding.cs`
  - 코딩용 텔레그램 경로의 첨부 정규화 경로를 새 정책으로 통일했다.
  - 대형 코딩 결과는 상세 본문 조립 전에 `TelegramCodingHandoffPolicy`로 요약+handoff 응답을 만들도록 했다.
  - `/coding file`이 대형 파일을 직접 본문으로 풀지 않고 `TelegramCommandHandoffPolicy` 요약+handoff로 제한하도록 했다.
- `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCodingHandoffPolicy.cs`
  - 변경 파일 수, 워커 수, 요약 본문 길이 기준으로 텔레그램 코딩 결과의 모바일 handoff 필요 여부를 판정하고, `/coding files`, `/coding download <번호>`, `/handoff` 중심의 짧은 응답을 만든다.
- `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCommandHandoffPolicy.cs`
  - 대형 명령 출력의 문자 수/라인 수를 기준으로 텔레그램 직접 출력 여부를 판정하고, 짧은 프리뷰, 다음 명령, `telegram_command_output_handoff` marker를 포함한 handoff 응답을 만든다.
- `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHandoffPresentationPolicy.cs`
  - 텔레그램 `/handoff` 결과에 데스크톱 Notebooks/Handoff 화면 안내, 로컬 `handoff.md` 경로, 짧은 프리뷰를 표시한다.
- `apps/omnux-middleware/src/CommandService.Telegram.Refactor.cs`
  - `/refactor preview` 대형 diff는 모바일 본문에 직접 풀지 않고 handoff 프리뷰로 제한한다.
- `apps/omnux-middleware/src/CommandService.Tasks.cs`
  - 텔레그램 `/task output`은 대형 stdout/stderr/result를 직접 출력하지 않고 요약+handoff로 제한한다. 웹/대시보드 출력은 기존 포맷을 유지한다.
- `apps/omnux-middleware/src/CommandService.Doctor.cs`
  - 텔레그램 `/doctor json`의 대형 JSON은 요약+handoff로 제한하고, 웹/대시보드 JSON 출력은 유지한다.
- `apps/omnux-middleware/src/CommandService.Notebooks.cs`
  - 텔레그램 `/handoff` 실행 결과는 `TelegramHandoffPresentationPolicy`로 표시해 데스크톱 이어보기 경로를 명확히 보여준다.
- `apps/omnux-middleware/src/CommandService.Telegram.Conversation.cs`
  - 텔레그램 `/history` `/log` 조회, 마지막 답변 기반 notebook/plan 생성, 연동 대화 확보, followup 입력 보정, anchor turn 탐색을 전담하는 partial을 추가했다.
- `apps/omnux-middleware/src/CommandService.Telegram.SkillAliases.cs`
  - 스킬 별명 상태 파일 로드/저장, 슬래시 별명 rewrite, `/skill quick` 등록/목록/삭제를 전담하는 partial을 추가했다.
- `apps/omnux-middleware/src/CommandService.Telegram.Skills.cs`
  - 스킬 별명 블록을 새 partial로 옮겨 본문 조회/생성, 활성화/비활성화, 자연어 스킬 호출 판정 중심으로 축소했다.
- `apps/omnux-middleware/src/CommandService.Telegram.LlmExecution.cs`
  - 텔레그램 Think+ 토글 초입 분기를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.Telegram.Refactor.cs`
  - 텔레그램 Safe Refactor 명령 처리와 상태 helper를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.Telegram.CodingSettings.cs`
  - 텔레그램 코딩 모드/언어/제공자/모델/워커 상태 helper를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.Telegram.UrlRouting.cs`
  - 텔레그램 URL fast-path를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.Telegram.ResponseFinalize.cs`
  - 텔레그램 채팅 응답 저장, 대화 제목 생성, 대화 압축, guard meta audit, 실행 metadata 기록 종료 루틴을 공통 helper로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineCommands.cs`
  - `/routine` 명령 디스패치, 목록/실행이력/상세 응답 조립, 생성/수정 요청 토큰 분해를 전담하는 partial을 추가했다.
- `apps/omnux-middleware/src/CommandService.RoutineScheduler.cs`
  - 루틴 스케줄러 루프를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutinePrompts.cs`
  - 루틴 생성용 프롬프트 파일 초기화를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineRunHelpers.cs`
  - 루틴 실행 로그, cron agentTurn bridge, cron 보조 문자열 조립을 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineSummary.cs`
  - 루틴 요약, 실행 모드 라벨, 스케줄 비교, 실행 이력, 제목/다음 실행 시각 계산 보조를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineGeneration.cs`
  - 기존 루틴 생성 본문 파일명을 실제 책임에 맞게 정리하고, 파일 책임을 루틴 생성 오케스트레이션 중심으로 축소했다.
- `apps/omnux-middleware/src/CommandService.RoutineGeneration.Execution.cs`
  - 루틴 생성의 split/single LLM 실행, 생성 후보 파싱, 보정 진행률 보고, 품질 결과 조립을 전담하는 partial을 추가했다.
- `apps/omnux-middleware/src/CommandService.RoutineValidation.cs`
  - 루틴 코드 보정, 생성 코드 검증, 스케줄러 책임 침범 판정, 실행 스크립트 저장 helper를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineGenerationStrategy.cs`
  - Groq 모델 가용성과 rate limit 기준으로 루틴 생성 전략을 고르는 helper를 별도 partial로 옮겼다.
- `apps/omnux-middleware/src/CommandService.RoutineGenerationText.cs`
  - 루틴 생성 프롬프트, prompt token 추정, plan 추출, shebang/portability shim, fallback 코드 문자열 helper를 별도 partial로 옮겼다.
- `apps/omnux-dashboard/modules/app-shell-state.js`
  - 루트 앱 셸 상태 조립을 summary/persistence/overlay/event/domain/ui/store/bridge/context helper로 더 잘게 나누고, 렌더 조립만 남기도록 축소했다.
- `apps/omnux-dashboard/modules/app-shell-summary.js`
  - conversation summary upsert helper를 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-persistence.js`
  - theme/lang/advanced 로컬 저장소 read/write helper를 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-overlays.js`
  - palette, permission, activity, toast overlay state를 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-events.js`
  - runtime, routine, conversation, memory, keyboard shortcut 이벤트 구독을 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-domain-state.js`
  - runtime, routines, conversations, active conversation, memory notes domain data 구독을 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-ui-state.js`
  - navigation/preference hook 조립만 담당하도록 축소했다.
- `apps/omnux-dashboard/modules/automate-page-state.js`
  - Automate trigger 정의, middleware routine to card 변환, 생성 패널 상태, 생성/삭제/실행 action 상태를 page-level hook으로 분리했다.
- `apps/omnux-dashboard/automate.js`
  - `CreatePanel`과 `AutomatePage`가 로컬 state를 직접 들지 않고 `useCreateAutomationPanelState`, `useAutomatePageState`를 사용하도록 바꿨다.
  - 렌더링 책임은 유지하고, 상태/액션/데이터 변환 책임만 `modules/automate-page-state.js`로 이동했다.
- `apps/omnux-dashboard/index.html`
  - `modules/automate-page-state.js`를 `modules/app-shell-state.js`보다 먼저 로드하도록 추가했다.
- `apps/omnux-dashboard/modules/app-shell-domain-stores.js`
  - runtime, routine, conversation, memory store와 active conversation state를 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-bridges.js`
  - keyboard shortcut, send adapter, openProject action bridge를 전담하도록 분리했다.
- `apps/omnux-dashboard/modules/app-shell-context.js`
  - page ctx와 root render state 조립을 별도 helper로 분리했다.
- `apps/omnux-dashboard/modules/app-shell-navigation-state.js`
  - route, payload, mobile nav 상태와 route 전환 side effect를 분리했다.
- `apps/omnux-dashboard/modules/app-shell-preference-state.js`
  - theme, lang, advanced preference와 DOM/localStorage side effect를 분리했다.
- `apps/omnux-dashboard/modules/app-shell-render.js`
  - page resolution과 root shell render 조립을 `app.js`에서 분리했다.
- `apps/omnux-dashboard/modules/build-page-state.js`
  - Build 화면의 project/request/stage/details/check/examples/plan/diff 상태와 액션을 전담하는 page-level store를 추가했다.
- `apps/omnux-dashboard/modules/build-page-state.js`
  - rollback ID 입력, 미들웨어 연결 가드, restore 요청 상태, 복원 결과 메시지를 전담하는 상태를 추가했다.
- `apps/omnux-dashboard/modules/command-palette-state.js`
  - Command Palette의 command list/filter/selection/focus 상태와 키 입력 처리를 전담하는 page-level store를 추가했다.
- `apps/omnux-dashboard/app.js`
  - root shell을 마운트 진입과 `buildOmnuxAppView` 호출 중심으로 줄였다.
  - root Error Boundary를 추가해 렌더링 중 오류가 나도 전체 화면이 흰 화면으로 끝나지 않고 복구 버튼이 있는 fallback을 표시하도록 했다.
- `apps/omnux-dashboard/bootstrap.js`
  - React/ReactDOM CDN 로드와 정적 대시보드 스크립트 순차 로드를 전담하는 부트스트랩 파일을 추가했다.
  - React/CDN 또는 초기 스크립트 로드 실패 시 `#root`에 local fallback 화면을 표시해 부트 실패를 사용자가 즉시 인지할 수 있게 했다.
- `apps/omnux-dashboard/index.html`
  - app shell summary/persistence/overlay/event/navigation/preference/domain/ui/render 모듈과 `build-page-state.js`, `command-palette-state.js`를 app.js보다 먼저 로드하도록 연결했다.
  - 개별 스크립트 태그 나열을 `bootstrap.js` 하나로 전환해 부트 순서와 실패 처리를 한 곳에서 관리하도록 했다.
- `apps/omnux-dashboard/styles.css`
  - boot fallback 화면, 카드, 복구 버튼 스타일을 추가했다.
- `apps/omnux-dashboard/build.js`
  - Build 화면은 렌더링만 남기고 page-state 훅에서 상태를 받아 사용하도록 축소했다.
  - rollback 복원 카드와 상태 메시지, 비연결 차단 문구를 Build 화면에 직접 노출했다.
- `apps/omnux-dashboard/palette.js`
  - Command Palette는 렌더링만 남기고 page-state 훅에서 상태를 받아 사용하도록 축소했다.
- `apps/omnux-dashboard/modules/refactor-state.js`
  - rollback apply 결과와 restore 결과가 state에서 안정적으로 유지되도록 `applyResult` 초기값을 추가했다.
- `apps/omnux-dashboard/i18n.js`
  - Build 화면의 rollback 복원 관련 문구를 추가해 대시보드 한글 표기를 보강했다.
- `scripts/check-plan-tab-contract.mjs`
  - 텔레그램 최근 답변 계획 shortcut 검사를 새 partial 파일 경계에 맞췄다.
- `scripts/check-notebook-tab-contract.mjs`
  - 텔레그램 최근 답변 노트북 저장 검사를 새 partial 파일 경계에 맞췄다.
- `scripts/check-desktop-shell-boundary-contract.mjs`
  - 7번 Tauri 백엔드 충돌을 막기 위해 Rust 셸과 .NET 미들웨어의 책임 경계 문서를 검사하고, 향후 `apps/desktop/src-tauri` 코드가 생기면 Rust 쪽 비즈니스 로직 침범을 차단하는 계약 검사를 추가했다.
  - `apps/desktop/src/use-middleware-runtime-probe.ts`의 ping/pong probe와 reconnect 예약, `triggerMiddlewareRuntimeProbe` 수동 재실행 경계를 검사하도록 보강했다.
  - 데스크톱 healthz/readyz 상태 표시와 HTTP probe 상태 저장 계약을 검사하도록 보강했다.
- `scripts/check-gateway-runtime-contract.mjs`
  - Tauri/Vite 데스크톱 개발 서버(`1420`)가 미들웨어(`41880`)에 붙을 수 있도록 loopback cross-port WebSocket Origin 허용 계약을 추가했다.
  - Tauri/Vite Origin에서 `healthz`/`readyz`를 CORS로 읽을 수 있는지 실제 미들웨어 런타임 검사에 추가했다.
- `scripts/run-omnux-tests.mjs`
  - `npm test` 파이프라인에 desktop shell boundary contract 단계를 연결했다.
- `develop.md`
  - 7번 Tauri 백엔드 충돌 진행률, 처리율/미착수 수치/완료·미완료/남은 회차를 최신화했다.
- `apps/omnux-middleware/src/WebSocketGateway.SocketLoop.cs`
  - 로컬 loopback 호스트끼리는 포트가 달라도 WebSocket Origin을 허용하도록 조정했다.
  - 외부 origin과 remote no-origin 차단 계약은 `check-gateway-runtime-contract`로 유지했다.
- `apps/omnux-middleware/src/WebSocketGateway.Health.cs`
  - health endpoint 전용 loopback CORS 판정을 추가해 Tauri dev origin이 `healthz`/`readyz`를 읽을 수 있게 했다.
- `apps/omnux-middleware/src/WebSocketGateway.Http.cs`
  - `healthz`/`readyz` 응답에 허용된 loopback Origin만 `Access-Control-Allow-Origin`으로 반영하도록 연결했다.
- `apps/desktop/package.json`
  - 앱 이름을 `omnux-desktop`으로 바꾸고 샘플 opener 의존성을 제거했다.
- `apps/desktop/src-tauri/Cargo.toml`
  - 패키지 이름과 설명을 `Omnux Desktop` 기준으로 바꾸고 opener 플러그인을 제거했다.
  - Rust 셸이 dev bootstrap을 위해 `tauri-plugin-shell`만 사용하도록 추가했다.
- `apps/desktop/src-tauri/src/main.rs`
  - 생성된 Rust 라이브러리 이름을 새 패키지명에 맞췄다.
- `apps/desktop/src-tauri/src/lib.rs`
  - 샘플 `greet` command와 invoke handler를 제거하고 최소 Tauri 셸만 남겼다.
  - debug/dev 빌드에서만 `dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj --no-launch-profile`을 `OMNUX_WS_PORT=41880`로 띄우는 bootstrap을 추가했다.
  - 종료 이벤트에서 bootstrap된 `.NET` 미들웨어 child process를 정리하도록 했다.
- `apps/desktop/src/App.tsx`
  - 샘플 greet 화면을 제거하고 Rust/.NET 경계 요약을 보여주는 정적 셸 화면으로 교체했다.
  - `useMiddlewareRuntimeProbe`를 연결해 데스크톱 셸이 로드될 때 `.NET` 미들웨어 ping/pong 상태를 자동 확인하도록 했다.
  - 수동 `ping/pong 재확인` 버튼, 마지막 probe 시각, 마지막 오류 상태를 추가했다.
  - 카드별 Error Boundary와 카드 실패 로그 기록을 추가해 카드 하나의 렌더 오류가 전체 셸로 번지지 않게 했다.
  - Rust 생명주기 이벤트를 프론트가 받아 bootstrap phase/pid를 표시하도록 했다.
- `apps/desktop/src/App.css`
  - 기본 템플릿 스타일을 제거하고 Omnux Desktop 전용 셸 레이아웃/카드/그리드 스타일을 추가했다.
- `apps/desktop/src/shell-store.ts`
  - `markHealthProbe`와 `scheduleNextReconnect`를 추가해 WebSocket ping/pong 결과와 재연결 예약을 상태로 남기도록 했다.
  - sidecar 상태 표시를 `dev-dotnet-run-bootstrap`과 `bundle-external-bin`으로 구분해 개발/배포 계약을 화면에서 분리했다.
  - probe 성공 시 재연결 시도 횟수를 0으로 초기화해 재연결 로그가 누적만 되지 않도록 정리했다.
  - 카드 렌더 오류를 로그로 남기는 `recordCardError`를 추가했다.
  - Rust bootstrap 이벤트를 반영하는 `markBootstrapEvent`를 추가했다.
  - `markHttpProbe`, `healthStatus`, `readyStatus`를 추가해 `healthz`/`readyz` 결과를 런타임 카드에 별도 표시하도록 했다.
- `apps/desktop/src/use-middleware-runtime-probe.ts`
  - `.NET` 미들웨어에 `ping`만 보내고 `pong`만 기다리는 셸 전용 runtime probe를 추가했다.
  - 비즈니스 메시지는 보내지 않고, 실패 시 제한된 재시도와 로그만 갱신한다.
  - `healthz` 확인, `readyz` 사전 확인, WebSocket `ping`/`pong`, `readyz` 재확인 순서로 probe를 확장하고 HTTP probe timeout을 추가했다.
- `apps/desktop/src/use-middleware-bootstrap-events.ts`
  - Rust 쪽 bootstrap lifecycle event를 받아 bootstrap phase/pid와 로그를 상태화하는 hook을 추가했다.
- `apps/desktop/index.html`
  - 문서 제목을 `Omnux Desktop`으로 바꿨다.
- `apps/desktop/README.md`
  - 데스크톱 셸의 역할과 경계를 간단히 설명하도록 바꿨다.
- `apps/omnux-middleware/src/CommandService.Utils.cs`
  - 로컬 시간 출력 경로를 새 정책으로 통일했다.
- `apps/omnux-middleware/src/RoutineCommandPolicy.cs`
  - 루틴 명령 도움말, 결과 포맷, 실행 모드 라벨, 자연어 루틴 판정, 브라우저 루틴 파서 helper를 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/InputAttachmentPolicy.cs`
  - 첨부 정규화와 오디오 판별을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/KillCommandPolicy.cs`
  - `/kill` 명령 파서를 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/LocalTimeTextPolicy.cs`
  - 로컬 시간 문자열 생성과 UTC 오프셋 포맷을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/CommandHelpTextPolicy.cs`
  - 텔레그램/웹 LLM 도움말과 메모리 도움말 본문을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/NaturalCommandDeterministicPolicy.cs`
  - 복합 off 토글과 결정적 자연어→슬래시 변환 fast-path를 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHelpTextPolicy.cs`
  - 텔레그램 `/help` 주제별 긴 도움말 본문을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware-tests/InputAttachmentPolicyTests.cs`
  - 정규화, 최대 첨부 수, 오디오 첨부 판별을 테스트로 고정했다.
- `apps/omnux-middleware-tests/KillCommandPolicyTests.cs`
  - `/kill` 명령 파싱의 유효/무효 케이스를 테스트로 고정했다.
- `apps/omnux-middleware-tests/LocalTimeTextPolicyTests.cs`
  - 로컬 시간 문자열과 UTC 오프셋 포맷을 테스트로 고정했다.
- `apps/omnux-middleware-tests/CommandHelpTextPolicyTests.cs`
  - 채널별 LLM 도움말과 메모리 도움말 출력이 유지되는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandDeterministicPolicyTests.cs`
  - 복합 off 토글, 스킬 별명 등록, 대화 이력, 웹/추론 토글 fast-path를 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandCandidatePolicyTests.cs`
  - 자연어 해석 후보 선택 우선순위, 최대 후보 수, resolver prompt의 핵심 명령 가이드를 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandResolutionPolicyTests.cs`
  - 자연어 해석 루프가 고신뢰 명령을 우선 반환하고, 실패 후보를 건너뛰며 최선 결과를 보존하는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandDispatchPolicyTests.cs`
  - 자연어 해석 결과가 실행/채팅/거부로 정확히 판정되는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandInterpretationPolicyTests.cs`
  - 코드펜스 포함 LLM 해석 결과의 JSON 정규화와 boolean/numeric args 파싱을 테스트로 고정했다.
- `apps/omnux-middleware-tests/NaturalCommandValidationPolicyTests.cs`
  - 자연어 명령 판정, kill 의도 감지, 키 정규화, coding mode 정규화, help 매핑, 저신뢰도 거부를 테스트로 고정했다.
- `apps/omnux-middleware-tests/TelegramHelpTextPolicyTests.cs`
  - 텔레그램 주제별 `/help` 출력과 기본 도움말 fallback을 테스트로 고정했다.
- `apps/omnux-middleware-tests/TelegramCodingHandoffPolicyTests.cs`
  - 대형 코딩 결과가 텔레그램에서 사전 요약+handoff로 제한되는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/TelegramCommandHandoffPolicyTests.cs`
  - 대형 명령 출력 판정과 프리뷰/다음 명령/marker 포함 handoff 응답을 테스트로 고정했다.
- `apps/omnux-middleware-tests/TelegramHandoffPresentationPolicyTests.cs`
  - `/handoff` 텔레그램 응답이 데스크톱 Handoff 패널과 로컬 문서 경로를 안내하는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/RoutineCommandPolicyTests.cs`
  - 루틴 도움말, 자연어 판정, 실행 모드 라벨, 브라우저 루틴 파서를 테스트로 고정했다.
- `apps/omnux-middleware-tests/UnifiedSlashCommandPolicyTests.cs`
  - 통합 슬래시/LLM 명령의 route 판정, 기존 usage 메시지, provider/model alias, memory compact flag, doctor json/last flag, 도메인 명령 토큰 보존을 테스트로 고정했다.
- `apps/omnux-middleware-tests/RefactorRollbackSnapshotTests.cs`
  - apply 직후 생성된 rollback ID로 실제 복원 성공과 재편집 후 차단을 검증하는 테스트를 추가했다.
- `apps/omnux-middleware-tests/WsRefactorCommandDispatcherTests.cs`
  - `refactor_restore` 입력이 rollbackId와 previewId fallback 둘 다 서비스 restore로 전달되는지 검증하는 테스트를 추가했다.
- `scripts/check-core-daemon-boundary-contract.mjs`
  - C11 코어 데몬 부재 계약으로 전환했다.
  - `apps/omnux-core`, 루트 `omnux-core`/`omninode-core` alias, `UdsCoreClient`, `CoreProcessBootstrapper`, `CoreAuthToken`이 재도입되지 않는지 검사한다.
  - `.NET` 기본 구현인 `ICoreRuntimeClient`/`DotNetCoreRuntimeClient`가 metrics/guarded kill을 계속 담당하는지 검사한다.
  - 문서와 runner/위생 스크립트가 제거된 C11 코어 경로를 다시 안내하지 않는지 검사한다.
- `scripts/run-omnux-tests.mjs`
  - `npm test` 파이프라인에 `core daemon boundary contract` 단계를 추가했다.
- `scripts/check-chat-telegram-contract.mjs`
  - 텔레그램 코딩 결과가 대형 변경/워커 결과를 사전 요약+handoff로 제한하는지 계약 검사에 추가했다.
  - 대형 파일/diff/task output/doctor JSON 명령 출력과 `/handoff` 데스크톱 문서 연결이 전용 정책을 거치는지 검사한다.
- `apps/omnux-middleware/src/CoreRuntimeClient.cs`
  - `ICoreRuntimeClient`와 기본 구현 `DotNetCoreRuntimeClient`를 추가했다.
  - metrics는 기존 line format(`status=ok cpu_usage=... mem_free_mb=...`)을 유지한다.
  - kill은 `pid <= 1`을 거부하고, Unix에서는 `SIGTERM`, Windows에서는 단일 프로세스 kill을 사용한다.
- `apps/omnux-middleware/src/AppConfig.cs`
  - `CoreSocketPath`와 `OMNUX_CORE_SOCKET_PATH` 설정을 제거해 런타임 설정이 더 이상 legacy socket 경로를 알지 않게 했다.
- `apps/omnux-middleware/src/Infrastructure/Paths/StatePathResolver.cs`
  - `CoreSocketPath`와 `omnux_core`/`omninode_core` socket alias 해석을 제거했다.
- `apps/omnux-middleware/src/AgentSpawnBudgetPolicy.cs`
  - `sessions_spawn` 고비용 조합 판정과 runtime/mode별 timeout/task 상한을 전담하는 순수 정책을 추가했다.
- `apps/omnux-middleware/src/AgentSpawnAdmissionLimiter.cs`
  - `sessions_spawn` 전역 토큰 버킷과 동시성 예약 상한을 전담하는 admission gate를 추가했다.
  - 만료 예약과 실패 예약 회수를 지원한다.
- `apps/omnux-middleware/src/AgentSpawnRunBreaker.cs`
  - `agent_spawn_breaker.json`의 `Enabled`/`Reason`/`Message`/`ExpiresUtc` 상태를 읽어 신규 `sessions_spawn`과 큐 flush를 운영자 개입 전까지 막는 브레이커를 추가했다.
  - 만료된 브레이커는 자동으로 비활성 취급하고, 상태 파일이 깨졌거나 없으면 차단하지 않는다.
- `apps/omnux-middleware/src/SessionSpawnTool.cs`
  - spawn 생성 전 `AgentSpawnBudgetPolicy`를 먼저 적용해 장시간/대용량 ACP 또는 subagent 호출을 초입에서 거부하도록 했다.
  - admission gate를 추가로 적용해 토큰 버킷/동시성 초과를 거부하고, 생성 실패 시 reservation을 회수하도록 했다.
  - accepted note에 spawn budget cost class를 포함해 후속 분석 시 비용 등급을 확인할 수 있게 했다.
  - `commandPriority`를 정규화해 ACP dispatch payload와 trace에 전달하고, 기본 ACP run을 background 우선순위로 낮추도록 했다.
  - ACP command transport 실패가 staged 접수로 폴백된 경우 결과 note에 fallback receipt를 남기도록 했다.
  - `AgentSpawnRunBreaker`가 활성 상태면 신규 spawn은 `blocked_by_breaker`/`wait_for_operator`로 거부하고, 큐 flush는 기존 큐 항목을 유지한 채 건너뛰며 active run은 완료 이력으로 정리하도록 했다.
  - `GetQueueStatus()`와 `SessionSpawnQueueStatus`를 추가해 브레이커 상태와 큐 스냅샷을 읽기 전용으로 확인할 수 있게 했다.
  - active run 시작/완료/실패와 브레이커 시 `blocked_by_breaker` 완료 이력 전환을 `FileAgentSpawnActiveRunStore`에 기록하고, status snapshot에 active run 압력을 포함한다.
  - 큐 접수 note에 `queue_observed`, `oldest_reason`, `latest_error`, `near_dead_letter` 요약을 붙였다.
- `apps/omnux-middleware/src/WebSocketGateway.cs`, `apps/omnux-middleware/src/WsToolCommandDispatcher.cs`, `apps/omnux-middleware/src/Application/ToolApplicationService.cs`, `apps/omnux-middleware/src/Application/ApplicationServiceContracts.cs`, `apps/omnux-middleware/src/CommandService.Config.cs`, `apps/omnux-middleware/src/ToolRegistry.cs`
  - WS `sessions_spawn action=status`를 추가해 task 없이 큐/브레이커 상태를 읽을 수 있게 했다.
  - status 응답은 기존 `sessions_spawn_result` 타입을 유지하고 `action=status`를 붙여 spawn 실행 결과와 구분한다.
  - 도구 registry 설명에 `sessions_spawn` status action 지원을 반영했다.
- `apps/omnux-middleware/src/Infrastructure/Persistence/FileAgentSpawnQueueStore.cs`
  - 큐 snapshot에 `NextEntryId`, `NextReason`, `NextError`, `NextAttemptCount`, `NearDeadLetterCount`를 추가해 운영자가 병목과 dead-letter 압력을 볼 수 있게 했다.
- `apps/omnux-middleware/src/Infrastructure/Persistence/FileAgentSpawnActiveRunStore.cs`
  - `agent_spawn_active.json`에 active run 시작, backend 식별자, 상태 전환, 완료/실패/stale 이력을 저장한다.
  - snapshot에 active run 수, 가장 오래된 run id/runtime/mode/backend/시작 시각/age, 완료 history 수를 노출한다.
- `apps/omnux-middleware/src/Infrastructure/Persistence/AgentSpawnActiveRunJson.cs`, `apps/omnux-middleware/src/Infrastructure/Persistence/AgentSpawnActiveRunJsonContext.cs`
  - active run 상태 파일을 source-generated JSON context로 직렬화한다.
- `apps/omnux-middleware/src/AcpSessionBindingAdapter.cs`
  - ACP command-mode priority 값을 정규화하고, 외부 adapter command process에 best-effort process priority를 적용하도록 했다.
  - command process 시작/입력/대기 실패 시 즉시 에러로 끝내지 않고 `command_fallback_staged` 접수 결과를 반환하도록 했다.
  - command payload에 `breakerStatePath`를 포함해 외부 adapter가 실행 중 브레이커 상태 파일을 직접 확인할 수 있게 했다.
- `apps/omnux-middleware/tools/acp-adapter-codex-exec.js`
  - commandPriority payload/env 값을 해석하고, 실제 `codex exec` child process에 best-effort priority/nice 값을 적용하도록 했다.
  - `breakerStatePath` payload/env 값을 해석하고, `agent_spawn_breaker.json`의 `enabled`/`Enabled`가 활성화되면 실행 중 `codex exec` process group에 `SIGTERM`과 `SIGKILL` fallback을 적용하도록 했다.
- `apps/omnux-middleware/src/WebSocketGateway.cs`, `apps/omnux-middleware/src/WsToolCommandDispatcher.cs`, `apps/omnux-middleware/src/Application/ToolApplicationService.cs`, `apps/omnux-middleware/src/Application/ApplicationServiceContracts.cs`, `apps/omnux-middleware/src/CommandService.Config.cs`
  - WS `sessions_spawn`의 `priority` 값을 spawn service 경로로 전달하고, 결과 JSON에 적용된 `commandPriority`를 노출하도록 했다.
- `apps/omnux-middleware/src/CommandService.LogicGraphs.cs`
  - 로직 그래프의 `session_spawn` 기본 timeout을 900초로 낮춰 `sessions_spawn` 예산 정책과 UI 기본값에 맞췄다.
  - `session_spawn` 노드의 `commandPriority` 설정을 spawn service로 전달하도록 했다.
- `apps/omnux-middleware-tests/AgentSpawnBudgetPolicyTests.cs`
  - subagent 표준 호출, subagent 장시간 timeout 거부, ACP session timeout/task 예산 거부, ACP run elevated 허용을 테스트로 고정했다.
- `apps/omnux-middleware-tests/AgentSpawnAdmissionLimiterTests.cs`
  - 전역 토큰 버킷 고갈, refill, 일반/elevated 동시성 상한을 테스트로 고정했다.
- `apps/omnux-middleware-tests/AgentSpawnQueueStoreTests.cs`
  - run breaker 활성 시 신규 spawn이 거부되는지, 큐 flush가 실행되지 않고 기존 큐 항목을 유지하는지 테스트로 고정했다.
  - `GetQueueStatus()`와 `ToolApplicationService.GetSessionSpawnStatus()`가 브레이커 상태와 큐 스냅샷의 oldest reason/error, near-dead-letter 압력을 노출하는지 테스트로 고정했다.
  - active run store가 active/completed/stale 상태를 추적하고, status snapshot이 active run 압력을 노출하는지 테스트로 고정했다.
- `apps/omnux-middleware-tests/AcpSessionBindingAdapterTests.cs`
  - ACP command priority 정규화, command fallback staged 접수, ACP dispatch trace 전달을 테스트로 고정했다.
  - ACP command payload가 `breakerStatePath`를 누락하지 않는지 테스트로 고정했다.
- `scripts/check-security-boundaries.mjs`
  - `AgentSpawnBudgetPolicy`, `AgentSpawnAdmissionLimiter`, `SessionSpawnTool` 예산/admission 정책 배선이 사라지지 않도록 계약 검사를 추가했다.
  - ACP command-mode priority 전달 경로가 사라지지 않도록 계약 검사를 추가했다.
  - ACP command transport 실패 시 staged 접수 폴백 경로가 사라지지 않도록 계약 검사를 추가했다.
  - `AgentSpawnRunBreaker`, `agent_spawn_breaker.json`, `blocked_by_breaker`, `wait_for_operator` 계약이 사라지지 않도록 검사를 추가했다.
  - `SessionSpawnQueueStatus`, `GetQueueStatus`, `GetSessionSpawnStatus`, WS `sessions_spawn action=status`, queue pressure note, 큐 snapshot의 reason/error/near-dead-letter, active run snapshot 계약이 사라지지 않도록 검사를 추가했다.
  - ACP command-mode 브레이커 경로 전달, `codex exec` adapter의 브레이커 polling, PascalCase `Enabled` 호환, process group 종료 계약이 사라지지 않도록 검사를 추가했다.
  - 이번 추가 회차에는 `LlmSettingsApplicationService`, request record, `CommandService.LlmSettings.cs` 위임 wrapper, 텔레그램 mutation service 재사용, 텔레그램 프로필 명령 mutation bridge, 단위 테스트명이 사라지지 않도록 계약 검사를 추가했다.
- `apps/omnux-core`, `omnux-core`, `omninode-core`
  - C11 코어 소스/빌드 산출물/루트 alias를 제거했다.
- `apps/omnux-middleware/src/UdsCoreClient.cs`, `apps/omnux-middleware/src/CoreProcessBootstrapper.cs`, `apps/omnux-middleware/src/CoreAuthToken.cs`
  - legacy C core IPC/부트스트랩/auth 호환 파일을 제거했다.
- `apps/omnux-middleware/src/CommandService.cs`
  - `_coreClient` 타입과 생성자 인자를 `ICoreRuntimeClient`로 전환했다.
  - 이번 추가 회차에는 `ILlmSettingsApplicationService`를 생성자 의존성으로 받아 공통 LLM 설정 mutation을 application service에 위임하도록 배선했다.
- `apps/omnux-middleware/src/Application/SettingsApplicationService.cs`
  - metrics 조회 의존성을 `ICoreRuntimeClient`로 전환했다.
- `apps/omnux-middleware/src/Application/Doctor/Checks/CoreSocketDoctorCheck.cs`
  - socket 파일 존재 확인 중심의 `core_socket` 체크를 `.NET` runtime 중심의 `core_runtime` 체크로 전환했다.
- `apps/omnux-middleware/src/Program.cs`
  - 기본 제품 경로는 `DotNetCoreRuntimeClient`를 사용한다.
  - legacy bootstrap opt-in 분기를 제거하고 시작 로그를 `.NET` core runtime 기준으로 바꿨다.
  - `SessionSpawnTool`에 `AgentSpawnRunBreaker`를 명시적으로 주입해 백그라운드 큐 flush도 같은 브레이커 상태를 보도록 했다.
  - 이번 추가 회차에는 `LlmSettingsApplicationService`를 `ProviderOptions`, `LlmPreferenceContext`, `TelegramLlmMutationApplicationService`, Groq selected model delegate와 함께 생성해 `CommandService`에 주입했다.
- `scripts/check-gateway-runtime-contract.mjs`
  - C core binary pid 추적과 legacy core socket 환경값을 제거했다.
- `scripts/check-repo-hygiene.mjs`
  - 제거된 `omnux-core`/`omninode-core` alias 요구를 삭제했다.
- `README.md`, `README.en.md`, `docs/QUICKSTART.md`, `docs/en/quickstart.md`, `docs/검증_가이드.md`, `docs/en/validation.md`, `docs/디렉터리_가이드.md`, `docs/en/directory-guide.md`, `docs/아키텍처_흐름.md`, `docs/en/architecture.md`, `docs/기술스택_정리.md`, `docs/en/tech-stack.md`, `docs/gemini-retriever-plan/02_architecture_mapping.md`
  - C11 코어 데몬을 활성 구성요소로 안내하던 문구를 제거하고 `.NET` core runtime 기준으로 정리했다.
- `scripts/omnux`
  - setup/start에서 `apps/omnux-core` 자동 빌드와 새 C core pid 추적을 제거했다.
  - shutdown의 기존 legacy core pid/binary 정리 경로를 제거했다.
- `scripts/omnux.ps1`
  - setup/start에서 `apps\omnux-core\build.ps1` 자동 호출을 제거했다.
  - shutdown의 기존 legacy core 프로세스 정리 경로를 제거했다.

### [치명 결함별 남은사항]
- 6번은 100% 완전 해결 상태다. 백엔드 rollback snapshot 저장/복원/차단 로직(`RefactorApplicationService.RestoreRollbackAsync`), multi-agent workspace rollback 정책(`AgentSpawnWorkspaceRollbackPolicy`), WS `refactor_restore` 계약(`WsRefactorCommandDispatcher`), Build 화면 복원 UI(rollbackId 입력, 복원 버튼, 상태 표시, 변경 파일 목록), 테스트 11개(`RefactorRollbackSnapshotTests` 9개 + `WsRefactorCommandDispatcherTests` 2개)까지 모두 구현·검증 완료. 남은 작업은 없다.
- 9번은 1차 보강 완료 상태다. 영속 일일 비용 캡, Groq 429 `Retry-After` 영속 cooldown, `agent_spawn_queue.json` 기반 영속 큐, 백그라운드 flush, 최대 재시도 후 dead-letter 제거, JSON 큐 `.queue.lease` read-modify-write 보호, ready 항목 원자 claim lease, 신규 스폰/큐 flush 차단 브레이커, 읽기 전용 큐 상태 조회, WS `sessions_spawn action=status`, `agent_spawn_active.json` active run 추적과 `blocked_by_breaker` 완료 이력 전환, ACP command-mode 실행 중 `codex exec` process group 종료, command-mode workspace rollback snapshot, command-mode rollback live QA, 프로세스 없는 staged/fake/subagent lane의 fail-closed transcript와 후속 `sessions_send` 차단까지 들어갔다. SQLite/DB 큐 전환 최종 판단은 완료했고, 실제 DB 큐 이식은 Phase 5 상태 DB 마이그레이션과 묶는다. snapshot 범위는 장기 운영 중 조정할 수 있다.
- 8번은 100% 완료 상태다. C11 코어 데몬 소스/빌드 파일/alias/호환 C# 경로/수동 빌드 문서 안내를 제거했고, 남은 작업은 없다.
- 10번은 portable backup package manifest, Settings 화면 표시, 파일별 `SHA-256` 무결성 검증, portable-package-only 동기화 정책, 파일 충돌 preview, 선택적 패키지 범위 UX, 로컬 교차 루트 import 회귀 테스트, 머신별 절대 경로/위험 ZIP entry 누출 방지 테스트, portable package 수동 QA 체크리스트까지 1차 보강을 닫았다. Gist/클라우드 동기화 브릿지와 물리적으로 다른 머신 import 수동 QA는 남아 있다.
- 11번은 handoff 도움말/자연어 매핑, 긴 응답 handoff 안내, diff/로그형 무거운 출력의 모바일 요약+handoff, 대형 코딩 결과 사전 handoff, 명령별 대형 파일/diff/task output/doctor JSON 차단, `/handoff` 데스크톱 문서 연결, `/coding download` 변경 파일 목록 기반 선택/8MB 상한 정책 테스트, fake HTTP `sendDocument` multipart 요청 테스트, 운영 문서 연결, deep link 미도입 최종 판단, live QA 스크립트와 수동 회귀 체크리스트 연결까지 1차 보강을 완료했다. 실제 token/chat id 기반 모바일 수신, 문서 첨부, 모바일 ack, 첨부 echo-back 4개 판정 확인은 사용자가 최종 테스트에서 수행하는 최종 수동 QA로 분리한다.
- 12번은 기술 스택 책임 경계, 원본 위치 경계 문서화, canonical source home 계약 검사, 루트/미들웨어 생성 스택 산출물 삭제, 재유입 방지 검사, 새 언어/런타임 승인 기준 문서화, Phase 5 스택 유입 차단 게이트, 브랜드/호환 alias 경계 계약, 루트 `omnux/` 프로토타입 파일 목록 동결까지 1차 보강을 완료했다. 실제 Phase 5 진행 중 게이트 통과 확인과 루트 `omnux/` 프로토타입 삭제/이관 여부 확정은 남아 있다.

### [치명 결함별 할 것]
- 6번은 완료됐으므로 다음 회차 대상에서 제외한다.
- 9번은 현재의 초입 예산 정책, ACP command-mode 우선순위 제어, staged 접수 폴백, 영속 일일 비용 캡, Groq 429 cooldown, 영속 큐, dead-letter 제거, queue claim lease, 운영자 개입용 신규 스폰/큐 flush 차단 브레이커, 읽기 전용 큐 상태 조회, WS status 조회, active run 추적과 `blocked_by_breaker` 완료 이력 전환, ACP command-mode 실행 중 process group 종료, command-mode workspace rollback snapshot, 프로세스 없는 lane의 follow-up 차단까지 유지한다. SQLite/DB 큐는 지금 별도 도입하지 않고 Phase 5 상태 DB 마이그레이션과 묶는다.
- 8번은 완료됐으므로 다음 회차 대상에서 제외한다.
- 10번은 portable package를 실제 설정 화면/문서에서 더 명확히 표시하고 manifest 무결성 검증, 동기화 범위, 충돌 정책, 선택적 scope export UX, 로컬 교차 루트 import 테스트, 머신별 경로 누출 방지, 수동 QA 기준까지 잠갔다. 외부 동기화 브릿지는 provider 선택, 보안 모델, 물리적으로 다른 머신 QA를 확보한 뒤 진행한다.
- 11번은 정책 차단, `/coding download` 로컬 정책 테스트, fake HTTP `sendDocument` 요청 테스트, 운영 문서 연결, deep link 미도입 판단, live QA 스크립트를 유지한다. 실제 자격증명 기반 `scripts/telegram-mobile-live-qa.mjs` 통과 확인은 다음 개발 작업이 아니라 사용자의 최종 수동 QA로 빼둔다. 12번은 새 언어/런타임 승인 기준, Phase 5 스택 유입 게이트, 브랜드/alias 경계를 유지하고, Phase 5 전환 중 새 스택 유입 차단의 실제 적용 여부와 루트 `omnux/` 프로토타입 정리 여부를 확인한다.

### [남은 회차 산정]
- 남은 회차: 치명적 결함 12선 기준 최소 1~2회가 더 필요하다. 8번은 완결했고 9번, 10번, 11번, 12번은 각각 1차 보강을 닫았다. 남은 개발 회차는 10번 실제 provider/물리 다른 머신 QA와 12번 Phase 5 새 스택 유입 차단 실사용 확인 및 루트 `omnux/` 프로토타입 삭제/이관 여부 확정이 현실적이다. 11번 실제 자격증명 기반 `telegram-mobile-live-qa` 통과는 사용자가 최종 테스트에서 확인하는 별도 수동 QA로 분리한다. Phase 5 전체 마이그레이션은 별도 4~6회 이상 필요하다.
- Phase 5 전체 마이그레이션 기준으로는 화면별 이식과 실제 WS 기능 연결 때문에 별도 4~6회 이상이 필요하다.
- `apps/omnux-middleware-tests/CoreRuntimeClientTests.cs`
  - `.NET` core runtime metrics line format과 invalid kill pid 거부를 테스트로 고정했다.
- `apps/omnux-middleware-tests/CoreRuntimeDoctorCheckTests.cs`
  - socket 파일이 없어도 `core_runtime` doctor가 `.NET` runtime metrics로 통과하는지 테스트로 고정했다.

### [누적 검증 결과]
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter FullyQualifiedName~LlmSettingsApplicationServiceTests`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand|FullyQualifiedName~LlmSettingsApplicationServiceTests"`, `npm test`, `git diff --check`
  - 결과: 모두 성공. `CommandService.Telegram.cs`는 `/talk`·`/code` 프로필 명령에서 `_telegramLlmPreferences`를 직접 lock/mutate하지 않고 `ApplyTelegramProfileCommandMutation`을 통해 `LlmSettingsApplicationService.ApplyTelegramProfileCommand`로 위임한다. `check-security-boundaries`는 assertions=1044로 통과했다. 새 profile command service 테스트를 포함한 `LlmSettingsApplicationServiceTests`는 실패 0개, 통과 5개였고, 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 127개였다. `npm test`는 미들웨어 테스트 1039개와 gateway runtime/sandbox smoke까지 통과했다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter FullyQualifiedName~LlmSettingsApplicationServiceTests`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand|FullyQualifiedName~LlmSettingsApplicationServiceTests"`, `npm test`, `git diff --check`
  - 결과: 모두 성공. `LlmSettingsApplicationService`가 웹/텔레그램 채널 프로필, 모드, provider/model, 상태 snapshot mutation boundary를 담당하고, `CommandService.LlmSettings.cs`는 `_telegramLlmPreferences`, `_webLlmPreferences`, `_telegramLlmLock`, `_webLlmLock`, provider/model core setter를 직접 들지 않는다. 텔레그램 provider/model 변경은 `TelegramLlmMutationApplicationService`로 위임한다. `check-security-boundaries`는 assertions=1037로 통과했다. 새 service 단위 테스트는 실패 0개, 통과 4개였고, 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 126개였다. `npm test`는 미들웨어 테스트 1038개와 gateway runtime/sandbox smoke까지 통과했다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`, `npm test`, `git diff --check`
  - 결과: 모두 성공. `TelegramLlmMutationApplicationService`가 텔레그램 LLM preference/provider selected model mutation을 전담하고, `CommandService.Telegram.LlmChannelMutation.cs`는 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter`, `_copilotWrapper`, `SetChannelProvider`, `SetChannelModel`를 직접 호출하지 않는다. `Program.cs`는 새 service를 `LlmPreferenceContext`, Groq selected model delegate, Copilot selected model delegate와 함께 배선한다. `check-security-boundaries`는 새 application service 경계와 LLM channel mutation 직접 상태 접근 부재를 확인하며 assertions=1011로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였고, `npm test`는 미들웨어 테스트 1034개와 gateway runtime/sandbox smoke까지 통과했다.
- 이번 회차 추가 완료: `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`, `npm test`, `git diff --check`
  - 결과: 모두 성공. `CommandService.Telegram.LlmModelSelection.cs`는 `/model` quick selection과 Groq/Copilot 모델 설정의 검증/카탈로그 확인만 담당하고, 실제 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter.TrySetSelectedGroqModel`, `_copilotWrapper.TrySetSelectedModel` 쓰기는 `CommandService.Telegram.LlmChannelMutation.cs`의 quick/Groq/Copilot mutation request helper가 담당한다. `check-security-boundaries`는 이 직접 mutation이 model-selection 파일로 되돌아오지 않는지 확인하며 assertions=996으로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였고, `npm test`는 미들웨어 테스트 1034개와 gateway runtime/sandbox smoke까지 통과했다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. `CommandService.Telegram.LlmCommandBoundary.cs`와 `CommandService.Telegram.LlmModelSelection.cs`는 더 이상 `SetChannelProvider(`, `SetChannelModel(`를 직접 호출하지 않고, command multi-channel lock bridge도 직접 소유하지 않는다. 텔레그램 provider/model channel mutation은 `CommandService.Telegram.LlmChannelMutation.cs`가 담당한다. 보안 계약은 command/model-selection boundary에 직접 mutation bridge가 되돌아오지 않는지 확인하며 assertions=984로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. `CommandService.Telegram.LlmControl.cs`는 parsed `/llm` command를 `TelegramLlmControlCommandRequest`로 감싸 `CommandService.Telegram.LlmCommandBoundary.cs`에 넘긴다. `/llm` help/status/mode/models/usage/model set/provider set/multi channel 실행 switch와 `_telegramLlmLock` bridge는 command boundary가 담당하고, 자연어 provider/model 변경은 `CommandService.Telegram.LlmModelSelection.cs`가 담당한다. 보안 계약은 LLM control 파일에 `SetChannelProvider(`, `SetChannelModel(`, `_telegramLlmLock`, `CommandHelpTextPolicy.BuildUnifiedLlmHelpText`, Groq/Copilot 모델 설정 직접 호출이 되돌아오지 않는지 확인하며 assertions=975로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. `CommandService.Telegram.LlmControl.cs`는 `/llm` 파싱, 자연어 LLM control routing, pseudo command handler map 중심으로 축소됐다. `/model` quick selection과 Groq/Copilot 모델 설정은 `CommandService.Telegram.LlmModelSelection.cs`가 담당하고, LLM 상태/모델/사용량 리포트 본문은 `CommandService.Telegram.LlmReports.cs`가 담당한다. 보안 계약은 LLM control 파일에 `_groqModelCatalog`, `_copilotWrapper`, report/model selection 메서드 본문이 되돌아오지 않는지 확인하며 assertions=960으로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. `CommandService.Telegram.LlmControl.cs`는 `TryHandleTelegramMemoryCommandAsync`를 handler map에 연결만 하고, 실제 `/memory clear|create|help` 실행은 `CommandService.Telegram.MemoryCommand.cs`가 담당한다. 보안 계약은 LLM control 파일에 `ClearMemory("telegram"`, `EnsureTelegramLinkedConversation()`, `CreateMemoryNoteAsync(`가 되돌아오지 않는지 확인하며 assertions=944로 통과했다. 텔레그램 pseudo/natural/help 및 unified slash 주변 타깃 테스트는 실패 0개, 통과 122개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests"`
  - 결과: 모두 성공. `UnifiedSlashCommandExecution.Doctor.cs`와 `.Llm.cs`는 직접 report/usage/models/model-set 호출 없이 각각 `ExecuteUnifiedSlashDoctorCommandBoundaryAsync`, `ExecuteUnifiedSlashLlmCommandBoundaryAsync`로 위임한다. `UnifiedSlashCommandExecution.DoctorBoundary.cs`와 `.LlmBoundary.cs`가 명시적 request, kind guard, doctor/LLM bridge를 담당한다. 보안 계약은 assertions=935로 통과했다. unified slash/도움말/자연어/텔레그램 도움말 타깃 테스트는 실패 0개, 통과 115개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. `UnifiedSlashCommandExecution.Memory.cs`는 clear/create/help 직접 실행 없이 `ExecuteUnifiedSlashMemoryCommandBoundaryAsync`로 위임하고, `UnifiedSlashCommandExecution.MemoryBoundary.cs`가 명시적 request, memory command kind guard, clear/create/help bridge를 담당한다. 보안 계약은 assertions=915로 통과했다. 자연어/통합 슬래시/도움말 타깃 테스트는 실패 0개, 통과 102개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests|FullyQualifiedName~TelegramHandoffPresentationPolicyTests|FullyQualifiedName~TelegramPseudoCommandExecutorTests|FullyQualifiedName~PlanningPromptPolicyTests"`
  - 결과: 모두 성공. `UnifiedSlashCommandExecution.Domain.cs`는 plan/task/notebook/handoff 직접 호출 없이 `ExecuteUnifiedSlashDomainCommandBoundaryAsync`로 위임하고, `UnifiedSlashCommandExecution.DomainBoundary.cs`가 명시적 request와 domain command kind guard를 담당한다. 보안 계약은 assertions=905로 통과했다. 자연어/통합 슬래시/도움말 타깃 테스트는 실패 0개, 통과 102개였고, 도메인 관련 타깃 테스트는 실패 0개, 통과 86개였다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~NaturalCommand"`
  - 결과: 모두 성공. 통합 슬래시 core 실행은 profile/mode/provider/model/status 직접 mutation 없이 `ExecuteUnifiedSlashChannelCommand`로 위임하고, 보안 계약은 이 channel 실행 경계와 자연어 normalized dispatch 경계까지 포함해 assertions=894로 통과했다. 자연어/통합 슬래시/도움말 타깃 테스트는 실패 0개, 통과 102개였다.
- 직전 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~NaturalCommand"`, `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~CommandHelpTextPolicyTests|FullyQualifiedName~UnifiedSlashCommandPolicyTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests"`
  - 결과: 모두 성공. 자연어 결과 실행은 public `ExecuteAsync` 재진입 없이 `ExecuteNormalizedCommandRoutingAsync`를 직접 호출하도록 바뀌었고, 보안 계약은 `ReenterNaturalCommandAsync` 부재와 자연어 dispatch request 경계를 포함해 assertions=883으로 통과했다. 자연어 관련 테스트 54개와 슬래시/텔레그램 관련 테스트 71개도 통과했다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`, `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`, `node --check scripts/check-tech-stack-contract.mjs`, `node scripts/check-tech-stack-contract.mjs`
  - 결과: 모두 성공. 루틴 생성 split/single 실행 경계 분리 후 C# 컴파일은 경고 0개/오류 0개였고, 보안 계약은 `CommandService.RoutineGeneration.Execution.cs`의 후보 파싱/보정/결과 조립 위임까지 포함해 assertions=874로 통과했다. 기술 스택 계약은 assertions=108로 유지됐다.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramClientTests|FullyQualifiedName~TelegramCodingDownloadPolicyTests|FullyQualifiedName~TelegramCodingHandoffPolicyTests|FullyQualifiedName~TelegramCommandHandoffPolicyTests|FullyQualifiedName~TelegramHandoffPresentationPolicyTests"`
  - 결과: 성공, 실패 0개, 통과 14개, 건너뜀 0개. `/coding download` 변경 파일 목록 기반 선택, 1부터 시작하는 번호 선택, 상대 경로 선택, 목록 밖 임의 경로 거부, sibling prefix 오인 방지, 안전 파일명 fallback, 8MB 상한, fake HTTP `sendDocument` multipart 요청, Telegram route 미설정 시 무송신, 대형 코딩 결과 모바일 handoff 정책, `/handoff` 데스크톱 문서 연결을 확인했다.
- 이번 회차 추가 완료: `node --check scripts/telegram-mobile-live-qa.mjs`, `node --check scripts/check-chat-telegram-contract.mjs`, `node scripts/check-chat-telegram-contract.mjs`, `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 1 --json`
  - 결과: 스크립트 문법과 계약 검사는 성공했다. `check-chat-telegram-contract`는 live QA 스크립트, `sendMessage`/`sendDocument`/`getUpdates`, 모바일 `/omniqa-ok <QA-ID>`, 첨부 echo-back 판정, 텔레그램 가이드와 수동 회귀 체크리스트 연결을 확인했다. live QA 실행은 현재 환경에 Telegram token/chat id가 없어 예상대로 `telegram credentials are missing` / exit code 2로 안전 차단됐다.
- 이번 회차 최종 재확인: `npm test`
  - 결과: 성공. repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, `check-security-boundaries` 1065 assertions, `check-tech-stack-contract` 108 assertions, 미들웨어 build, 미들웨어 unit tests 1053개, gateway runtime contract, sandbox smoke가 모두 통과했다.
- 이전 회차 최종 재확인: `npm test`, `node scripts/check-security-boundaries.mjs`, `git diff --check`
  - 결과: 모두 성공. `npm test`는 repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, `check-security-boundaries` 984 assertions, `check-tech-stack-contract` 108 assertions, 미들웨어 build, 미들웨어 unit tests 1034개, gateway runtime contract, sandbox smoke를 통과했다. 공백 검사는 오류 없음.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~ConversationApplicationServiceBackupTests"`
  - 결과: 성공, 실패 0개, 통과 9개, 건너뜀 0개. portable package manifest, 선택 scope, 무결성 차단, sync 정책, 파일 충돌 preview, 빈 scope 거부, 서로 다른 state/workspace 루트 import, 머신별 절대 경로/위험 ZIP entry 누출 방지, 시크릿/manifest import 제외를 확인했다.
- 이번 회차 추가 완료: `node --check scripts/check-security-boundaries.mjs`, `node scripts/check-security-boundaries.mjs`
  - 결과: 성공, assertions=874. portable package 교차 루트 import 테스트명, 머신별 경로 누출 방지 테스트명, 수동 QA 체크리스트의 manifest/`SHA-256`, 로컬 절대 경로 금지, 다른 머신 또는 별도 테스트 루트, Gist/클라우드 provider 미도입 기준과 루틴 생성 실행 helper 분리 계약을 확인했다.
- 이전 회차 최종 재확인: `npm test`, `node scripts/check-security-boundaries.mjs`, `git diff --check`
  - 결과: 모두 성공. `npm test`는 repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, 미들웨어 build, 미들웨어 unit tests 1034개, gateway runtime contract, sandbox smoke를 통과했다. 보안 계약은 assertions=874, 공백 검사는 오류 없음.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~AcpSessionBindingAdapterTests|FullyQualifiedName~RefactorRollbackSnapshotTests|FullyQualifiedName~AgentSpawnQueueStoreTests"`
  - 결과: 성공, 실패 0개, 통과 26개, 건너뜀 0개. 생성 파일 삭제/삭제 파일 복원, 실제 command adapter 모드의 workspace rollback live QA, 제외 디렉터리 snapshot 차단, rollback record 파일 수 cap, queue claim lease 중복 claim 차단, 브레이커 transcript의 `restore_workspace_rollback_snapshot` 회복 액션을 확인했다.
- 이번 회차 추가 완료: `node --check scripts/check-security-boundaries.mjs`
  - 결과: 성공, 보안 계약 스크립트 문법 오류 없음.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개.
- 이번 회차 추가 완료: `node scripts/check-security-boundaries.mjs`
  - 결과: 성공, assertions=863.
- 이번 회차 추가 완료: `node scripts/check-core-daemon-boundary-contract.mjs`
  - 결과: 성공, assertions=63. 남은 회차 산정 계약을 `최소 1~2회`로 최신화했다.
- 이번 회차 추가 완료: `node --check scripts/check-tech-stack-contract.mjs`, `node scripts/check-tech-stack-contract.mjs`
  - 결과: 성공. 당시 새 언어/런타임 승인 기준, 문서/계약 동시 갱신, canonical source home, 실험 산출물 위치, 브랜드/호환 alias 경계를 확인했다. 최신 기술 스택 계약 수치는 아래의 108 assertions 기록을 기준으로 본다.
- 이번 회차 추가 완료: `npm test`
  - 결과: 성공. repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, 미들웨어 build, 미들웨어 unit tests 1034개, gateway runtime contract, sandbox smoke 모두 통과.
- 이번 회차 추가 완료: `git diff --check`
  - 결과: 성공, 공백 오류 없음.
- 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개.
- 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 실패 0개, 통과 1034개, 건너뜀 0개.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "AcpSessionBindingAdapterTests|AgentSpawnAdmissionLimiterTests|AgentSpawnBudgetPolicyTests"`
  - 결과: 성공, 실패 0개, 통과 11개, 건너뜀 0개.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~AgentSpawnQueueStoreTests|FullyQualifiedName~AgentSpawnDailyCostLedgerTests|FullyQualifiedName~AcpSessionBindingAdapterTests"`
  - 결과: 성공, 실패 0개, 통과 12개, 건너뜀 0개.
- 이번 회차 추가 완료: `node --check apps/omnux-middleware/tools/acp-adapter-codex-exec.js`
  - 결과: 성공, JS 문법 오류 없음.
- 이번 회차 추가 완료: fake `codex` 기반 ACP command-mode 브레이커 스모크
  - 결과: 성공. PascalCase `Enabled` 브레이커 활성 시 adapter가 오류 응답을 반환하고 실행 중 fake `codex` child process가 `SIGTERM`을 수신했다.
- 이전 회차 추가 완료: `node scripts/check-security-boundaries.mjs`
  - 결과: 성공, assertions=817.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~AgentSpawnQueueStoreTests|FullyQualifiedName~AcpSessionBindingAdapterTests"`
  - 결과: 성공, 실패 0개, 통과 14개, 건너뜀 0개.
- 이번 회차 추가 완료: `node --check scripts/check-security-boundaries.mjs && node scripts/check-security-boundaries.mjs`
  - 결과: 성공, assertions=824.
- 이번 회차 추가 완료: `git diff --check -- apps/omnux-middleware/src/Application/ToolApplicationService.cs apps/omnux-middleware/src/SessionSendTool.cs apps/omnux-middleware/src/SessionSpawnTool.cs apps/omnux-middleware-tests/AcpSessionBindingAdapterTests.cs apps/omnux-middleware-tests/AgentSpawnQueueStoreTests.cs scripts/check-security-boundaries.mjs`
  - 결과: 성공, 공백 오류 없음.
- 완료: `git diff --check`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 최종 재확인: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~AgentSpawnQueueStoreTests"`
  - 결과: 성공, 실패 0개, 통과 8개, 건너뜀 0개.
- 이전 회차 최종 재확인: `node scripts/check-security-boundaries.mjs`, `git diff --check`
  - 결과: 성공, 보안 계약 assertions=817, 공백 오류 없음.
- 완료: 브라우저 스모크 `http://127.0.0.1:41739/index.html`
  - 결과: 홈 렌더, 설정 진입, 명령 팔레트 열기 확인. 콘솔 error/warn 0개.
- 이번 회차 추가 완료: `node --check apps/omnux-dashboard/modules/automate-page-state.js`, `node --check apps/omnux-dashboard/automate.js`, `node --check apps/omnux-dashboard/app.js`, `node --check apps/omnux-dashboard/palette.js`, `node --check apps/omnux-dashboard/projects.js`, `node --check apps/omnux-dashboard/modules/app-shell-state.js`
  - 결과: 성공, JS 문법 오류 없음.
- 이번 회차 추가 완료: `git diff --check -- develop.md apps/omnux-dashboard/modules/automate-page-state.js apps/omnux-dashboard/automate.js apps/omnux-dashboard/index.html`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: 브라우저 스모크 `http://127.0.0.1:41739/index.html`
  - 결과: 홈 렌더, 자동화 탭 진입, 새 자동화 패널 렌더, 예약/텔레그램 트리거 렌더 확인. 콘솔 error/warn 0개.
  - 제한: Browser 자동화의 텍스트 입력은 런타임 clipboard 제약으로 검증하지 못했다.
- 이번 회차 추가 완료: `node --check apps/omnux-dashboard/bootstrap.js`, `node --check apps/omnux-dashboard/app.js`, `node --check apps/omnux-dashboard/modules/automate-page-state.js`, `node --check apps/omnux-dashboard/automate.js`
  - 결과: 성공, JS 문법 오류 없음.
- 이번 회차 추가 완료: `git diff --check -- apps/omnux-dashboard/bootstrap.js apps/omnux-dashboard/app.js apps/omnux-dashboard/index.html apps/omnux-dashboard/styles.css develop.md`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: 브라우저 스모크 `http://127.0.0.1:41739/index.html`
  - 결과: 새 `bootstrap.js` 경유 reload 후 홈 렌더 정상, fallback 화면 미노출, 자동화 탭 진입 정상, 명령 팔레트 열림 정상, 콘솔 error/warn 0개.
- 이번 회차 추가 완료: `node --check apps/omnux-dashboard/build.js`, `node --check apps/omnux-dashboard/modules/build-page-state.js`, `node --check apps/omnux-dashboard/modules/refactor-state.js`, `node --check apps/omnux-dashboard/i18n.js`, `git diff --check`
  - 결과: 성공, JS 문법 오류와 공백 오류 없음.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --filter RefactorRollbackSnapshotTests`
  - 결과: 성공, 실패 0개, 통과 5개, 건너뜀 0개.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --filter WsRefactorCommandDispatcherTests`
  - 결과: 성공, 실패 0개, 통과 2개, 건너뜀 0개.
- 이번 회차 추가 완료: 브라우저 스모크 `http://127.0.0.1:41739/index.html`
  - 결과: Build 탭에서 rollback 복원 카드 렌더를 확인했고, 콘솔 error/warn 0개를 확인했다.
  - 제한: 현재 `127.0.0.1:41739`는 정적 서버라 live WebSocket restore 성공 E2E는 별도 실제 미들웨어 환경에서 검증해야 한다.
- 이번 회차 추가 완료: `node --check scripts/check-desktop-shell-boundary-contract.mjs`, `node scripts/check-desktop-shell-boundary-contract.mjs`
  - 결과: 성공. 현재 `apps/desktop`은 scaffold 후이며, 문서와 `npm test` 연결 계약을 확인했다.
- 이번 회차 추가 완료: `git diff --check -- develop.md scripts/check-desktop-shell-boundary-contract.mjs scripts/run-omnux-tests.mjs`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: `npx create-tauri-app@latest apps/desktop --manager npm --template react-ts --identifier com.omnux.desktop --tauri-version 2 --yes`
  - 결과: 성공. Tauri v2 React/TypeScript scaffold 생성 완료.
- 이번 회차 추가 완료: `npm install` (`apps/desktop`)
  - 결과: 성공. 71개 패키지 설치, 취약점 0개.
- 이번 회차 추가 완료: `npm run build` (`apps/desktop`)
  - 결과: 성공. TypeScript/Vite 프로덕션 빌드 완료.
- 이번 회차 추가 완료: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - 결과: 성공. 샘플 opener 권한 잔재를 제거한 뒤 Rust/Tauri 셸 컴파일 확인.
- 이번 회차 추가 완료: `npm install zustand` (`apps/desktop`)
  - 결과: 성공. React 셸 상태 관리를 위한 경량 store 의존성 추가.
- 이번 회차 추가 완료: `node --check scripts/check-desktop-shell-boundary-contract.mjs`
  - 결과: 성공. Desktop shell boundary 계약 스크립트 문법 확인.
- 이번 회차 추가 완료: `npm run build` (`apps/desktop`)
  - 결과: 성공. `shell-store`, `ShellErrorBoundary`, `middleware-contract`, 런타임 부트 계약 UI 포함한 Vite/TypeScript 빌드 통과.
- 이번 회차 추가 완료: `node scripts/check-desktop-shell-boundary-contract.mjs`
  - 결과: 성공. `161 assertions, inspected 12 files`.
- 이번 회차 추가 완료: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - 결과: 성공. Rust 셸은 여전히 창 생명주기만 담당하는 최소 구조 유지.
- 이번 회차 추가 완료: 브라우저 스모크 `http://127.0.0.1:1420/`
  - 결과: `Omnux Desktop` 화면이 렌더됐고, `.NET 미들웨어 연결 계약`, `UI 로그 경계`, `런타임 부트 계약` 카드가 보였다. 콘솔 error/warn 0개를 확인했다.
- 이번 회차 추가 완료: 브라우저 상호작용 `연결 대기 표시`, `재연결 예약`
  - 결과: 상태가 `waiting`으로 바뀌고 UI 로그가 갱신됐으며, 재연결 시도가 `1/5`로 증가했다. 콘솔 error/warn 0개를 유지했다.
- 이번 회차 추가 완료: `npm run build` (`apps/desktop`)
  - 결과: 성공. healthz/readyz 상태 표시와 확장 runtime probe 포함 TypeScript/Vite 빌드 통과.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개.
- 이번 회차 추가 완료: `node scripts/check-desktop-shell-boundary-contract.mjs`
  - 결과: 성공. `179 assertions, inspected 12 files`.
- 이번 회차 추가 완료: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
  - 결과: 성공. Rust 셸 경계 유지.
- 이번 회차 추가 완료: `node scripts/check-gateway-runtime-contract.mjs`
  - 결과: 성공. `desktop_healthz_cors`, `desktop_readyz_cors`, `readyz_after_ping` 포함 실제 미들웨어 런타임 계약 확인.
- 이번 회차 추가 완료: `git diff --check -- apps/omnux-middleware/src/WebSocketGateway.Health.cs apps/omnux-middleware/src/WebSocketGateway.Http.cs apps/desktop/src/shell-store.ts apps/desktop/src/use-middleware-runtime-probe.ts apps/desktop/src/App.tsx apps/desktop/src/App.css scripts/check-desktop-shell-boundary-contract.mjs scripts/check-gateway-runtime-contract.mjs`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: `node --check scripts/check-core-daemon-boundary-contract.mjs`
  - 결과: 성공. C11 코어 부재 계약 스크립트 문법 확인.
- 이번 회차 추가 완료: `node scripts/check-core-daemon-boundary-contract.mjs`
  - 결과: 성공. C11 코어 부재, .NET core runtime, 문서/alias 삭제 계약 확인.
- 이번 회차 추가 완료: `node scripts/check-tech-stack-contract.mjs`
  - 결과: 성공. 당시 C11 코어 제거 이후 기술 스택 계약을 확인했다. 최신 기술 스택 계약 수치는 아래의 108 assertions 기록을 기준으로 본다.
- 이번 회차 추가 완료: `node --check scripts/run-omnux-tests.mjs`
  - 결과: 성공. `npm test` 연결 스크립트 문법 확인.
- 이번 회차 추가 완료: `git diff --check -- develop.md scripts/check-core-daemon-boundary-contract.mjs scripts/run-omnux-tests.mjs`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개. `.NET` core runtime 전환 후 컴파일 확인.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~CoreRuntimeClientTests|FullyQualifiedName~CoreRuntimeDoctorCheckTests"`
  - 결과: 성공, 실패 0개, 통과 3개, 건너뜀 0개.
- 이번 회차 추가 완료: `node scripts/check-core-daemon-boundary-contract.mjs`
  - 결과: 성공. `65 assertions`. C11 코어 부재, `.NET` core runtime, 문서/alias 삭제 계약 확인.
- 이번 회차 추가 완료: `node scripts/check-gateway-runtime-contract.mjs`
  - 결과: 성공. `healthz`, desktop CORS, WebSocket local/remote 제한, `readyz_after_ping`, static index `ETag/304` 확인.
- 이번 회차 추가 완료: `bash -n scripts/omnux`
  - 결과: 성공. POSIX runner 문법 확인.
- 이번 회차 추가 완료: `git diff --check -- apps/omnux-middleware/src/CoreRuntimeClient.cs apps/omnux-middleware/src/AppConfig.cs apps/omnux-middleware/src/Infrastructure/Paths/StatePathResolver.cs apps/omnux-middleware/src/Program.cs apps/omnux-middleware-tests/CoreRuntimeClientTests.cs apps/omnux-middleware-tests/CoreRuntimeDoctorCheckTests.cs scripts/check-core-daemon-boundary-contract.mjs develop.md`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj --no-restore -p:UseAppHost=false --filter "FullyQualifiedName~TelegramCommandHandoffPolicyTests|FullyQualifiedName~TelegramHandoffPresentationPolicyTests|FullyQualifiedName~TelegramCodingHandoffPolicyTests|FullyQualifiedName~TelegramResponseFormatterPolicyTests|FullyQualifiedName~TelegramHelpTextPolicyTests|FullyQualifiedName~TelegramNaturalCommandPolicyTests"`
  - 결과: 성공, 실패 0개, 통과 48개, 건너뜀 0개.
- 이번 회차 추가 완료: `node scripts/check-chat-telegram-contract.mjs`
  - 결과: 성공.
- 이번 회차 추가 완료: `node --check scripts/check-chat-telegram-contract.mjs`
  - 결과: 성공. 텔레그램 계약 검사 스크립트 문법을 확인했다.
- 이번 회차 추가 완료: `node scripts/check-chat-telegram-contract.mjs`
  - 결과: 성공. 모바일 handoff 운영 기준, 실제 모바일 QA 체크리스트, deep link 미도입 최종 판단, 텔레그램 `/handoff`의 `omnux://` 링크 미생성, Notebooks/Handoff 문서 연결, 문서 인덱스의 텔레그램 가이드 연결을 확인했다.
- 이번 회차 추가 완료: `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj --no-restore -p:UseAppHost=false`
  - 결과: 성공, 경고 0개, 오류 0개.
- 이번 회차 추가 완료: `git diff --check -- apps/omnux-middleware/src/CommandService.Telegram.Coding.cs apps/omnux-middleware/src/CommandService.Telegram.Refactor.cs apps/omnux-middleware/src/CommandService.Tasks.cs apps/omnux-middleware/src/CommandService.Doctor.cs apps/omnux-middleware/src/CommandService.Notebooks.cs apps/omnux-middleware/src/Infrastructure/Telegram/TelegramCommandHandoffPolicy.cs apps/omnux-middleware/src/Infrastructure/Telegram/TelegramHandoffPresentationPolicy.cs apps/omnux-middleware-tests/TelegramCommandHandoffPolicyTests.cs apps/omnux-middleware-tests/TelegramHandoffPresentationPolicyTests.cs scripts/check-chat-telegram-contract.mjs develop.md`
  - 결과: 성공, 공백 오류 없음.
- 이번 회차 추가 완료: `npm test`
  - 결과: 성공. repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, 미들웨어 build, 미들웨어 unit tests 1034개, gateway runtime contract, sandbox smoke 모두 통과.
- 이번 회차 추가 완료: `node --check scripts/check-repo-hygiene.mjs && node scripts/check-repo-hygiene.mjs`
  - 결과: 성공. ignored 파일이어도 루트/미들웨어 생성 스택 산출물이 남아 있지 않음을 확인했다.
- 이번 회차 추가 완료: `node --check scripts/check-tech-stack-contract.mjs && node scripts/check-tech-stack-contract.mjs`
  - 결과: 성공. 당시 루트 `main.js`/`preload.js`/`worker.js`와 미들웨어 루트 생성 산출물 부재까지 확인했다. 최신 기술 스택 계약 수치는 아래의 108 assertions 기록을 기준으로 본다.
- 이번 회차 추가 완료: `node --check scripts/check-tech-stack-contract.mjs`
  - 결과: 성공. Phase 5 스택 유입 차단 게이트를 추가한 계약 스크립트 문법을 확인했다.
- 이번 회차 추가 완료: `node scripts/check-tech-stack-contract.mjs`
  - 결과: 성공, assertions=108. 새 언어/런타임 승인 기준, Phase 5 게이트, `npm test`의 repo hygiene/tech stack 연결, 루트 `omnux/` 프로토타입 파일 목록 동결, `develop.md` 최신 반영 문구를 확인했다.
- 이번 회차 추가 완료: `npm test`
  - 결과: 성공. repo hygiene, dashboard JS 문법, 보안/core/desktop/tech/coding/browser/chat/logic/routine/notebook/plan 계약, `check-tech-stack-contract` 108 assertions, 미들웨어 build, 미들웨어 unit tests 1034개, gateway runtime contract, sandbox smoke가 모두 통과했다.
- 이번 회차 추가 완료: `find . -maxdepth 3 ...`
  - 결과: 12번 삭제 대상이던 루트 번들 및 `apps/omnux-middleware` 루트 Python/Node.js/C 산출물은 남지 않았다. 남은 항목은 대시보드/계약 검사/샌드박스 실행기/런처와 `workspace` 작업 산출물이다.
- 이번 회차 추가 완료: `git diff --check`
  - 결과: 성공, 공백 오류 없음.

### [전체 잔여 작업]
- `CommandService`의 나머지 루틴/로직/텔레그램 오케스트레이션 결합을 더 잘게 나누어야 한다.
- `CommandService.Telegram`의 주요 helper는 분리됐지만, 세부 provider 실행 브랜치는 여전히 `CommandService` private state에 붙어 있다.
- `CommandService.NaturalCommands`의 자연어 결과 실행은 public `ExecuteAsync` 재진입을 제거했고, normalized dispatch 경계를 직접 호출한다. 다만 이 dispatch 경계 내부는 여전히 `CommandService` private state와 도메인 helper에 붙어 있다.
- 통합 슬래시 명령의 route 판정과 실행 helper 분리는 완료됐지만, 실행 helper 내부가 여전히 `CommandService` private state와 도메인 메서드에 붙어 있다.
- 채널 LLM 설정 helper의 공통 상태 mutation과 텔레그램 `/talk`·`/code` 프로필 명령 mutation은 `LlmSettingsApplicationService`로 내려갔다. 다만 텔레그램 coding settings, provider 실행 브랜치 등 일부 세부 경로는 아직 `CommandService` private state와 내부 helper에 붙어 있다.
- `CommandService.NaturalCommands`의 자연어 해석 결과 정규화와 검증 경계는 정책으로 분리됐고 public `ExecuteAsync` 재진입도 제거됐지만, 일부 도메인 실행 helper는 여전히 `CommandService` private state와 내부 도메인 메서드에 직접 붙어 있다.
- `CommandService.Execution`의 초입 라우팅은 helper로 나뉘었지만, 텔레그램과 루틴 쪽 대형 helper는 아직 더 잘게 쪼개야 한다.
- `CommandService.RoutineGeneration`의 생성 오케스트레이션은 전략 선택/진행률 보고 중심으로 줄었고, split/single 실행·파싱·보정·결과 조립은 별도 partial로 분리됐다. 다만 여전히 `CommandService` private state와 provider 실행 helper에 붙어 있으므로 완전한 CQRS/이벤트 경계는 아니다.
- `apps/omnux-dashboard`의 루트 상태 조립, 주요 화면 page-level store 분리, React/CDN 부트 fallback, root Error Boundary는 1차 보강을 완료했다. Tauri 전환 시에는 도메인별 세부 Error Boundary와 로컬 UI 로그 적재를 추가로 확대해야 한다.
- `apps/desktop`은 지금 `shell-store`, `ShellErrorBoundary`, `middleware-contract`, 상태 카드, 카드별 Error Boundary, 로그 경계, 런타임 부트 계약, healthz/readyz HTTP probe, WebSocket ping/pong runtime probe, sidecar 배포 연결까지 갖춘 1차 셸 뼈대 상태다. 다음에는 Phase 5 본작업으로 화면별 JSX/TSX 이식과 Tauri SQLite UI 로그 적재를 진행해야 한다.
- 루트 `omnux/`는 git 추적 중인 기존 프로토타입 복제본이며 활성 source home이 아니다. 삭제나 `apps/desktop` 이관은 파괴적 변경이므로 사용자 확인 후 진행하고, 그 전까지 `scripts/check-tech-stack-contract.mjs`가 현재 파일 목록을 동결해 추가 성장을 막는다.
- 8번 C11 코어 데몬은 완전 삭제 완료다. 유지해야 하는 기능은 `.NET` `DotNetCoreRuntimeClient`의 `get_metrics` 호환 출력, `/kill`의 guarded kill, `core_runtime` doctor뿐이다.
- 10번 로컬 고립 한계는 기존 백업 ZIP에 portable package manifest를 넣고 Settings 화면 표기, 파일별 `SHA-256` 무결성 검증, portable-package-only 동기화 정책, 파일 충돌 preview, 선택적 범위 UX, 로컬 교차 루트 import 테스트, 수동 QA 체크리스트까지 붙여 1차 보강을 닫았다. 아직 실제 클라우드 provider와 물리적으로 다른 머신 import 수동 QA는 남아 있다.
- 9번 멀티 에이전트 폭주는 command-mode process group kill, active run 추적, queue claim lease, command-mode workspace rollback snapshot, command-mode rollback live QA, 프로세스 없는 staged/fake/subagent lane의 fail-closed transcript와 follow-up 차단까지 들어갔다. SQLite/DB 큐 전환 최종 판단도 끝났고, 실제 DB 큐 이식은 Phase 5 상태 DB 마이그레이션과 묶는다.
- Phase 2~5의 WS 연결과 대시보드 흐름은 치명 결함 12선 완전 해결 후 문서 기준대로 재개한다.
- 6번 rollback 안전장치의 실제 미들웨어 live E2E 확인은 완료했다.
- 7번은 Rust/.NET 경계 계약과 `apps/desktop` scaffold에 더해 React store 경계, UI 로그 경계, root 렌더 실패 fallback, 런타임 부트 계약, healthz/readyz/WebSocket runtime probe, sidecar 배포 연결, 재연결 성공 시도 횟수 초기화, 카드별 Error Boundary까지 진행해 1차 보강을 닫았다.
- 현실적 잔여 회차: 치명적 결함 12선 기준으로는 10번 실제 provider/물리 다른 머신 QA와 12번 Phase 5 새 스택 유입 차단 실사용 확인 및 루트 `omnux/` 프로토타입 정리 판단이 남아 최소 1~2회 더 필요하다. 11번 실제 자격증명 기반 `telegram-mobile-live-qa` 통과는 사용자가 최종 테스트에서 확인하는 별도 수동 QA로 분리한다. Phase 5 전체 마이그레이션 기준으로는 화면별 이식과 실제 WS 기능 연결 때문에 별도 4~6회 이상 필요하다.

### [다음 개발 작업 큐]
- 4번 과제에서 `CommandService`의 책임을 도메인별 dispatch/helper로 더 분리한다.
- 자연어 해석 후보 선택과 deterministic fast-path, 해석 루프, dispatch 판정, 통합 슬래시 route 판정, 통합 슬래시 실행 switch, 통합 슬래시 channel 실행 helper, 통합 슬래시 memory/doctor/domain/LLM command boundary, Telegram memory command partial, 채널 LLM 설정 helper, 자연어 실행 경계, public `ExecuteAsync` 재진입 제거, normalized dispatch 경계, 텔레그램 LLM 응답 종료 경계, 루틴 명령 디스패치, 루틴 스케줄러, 루틴 프롬프트 초기화, 루틴 실행 보조/요약, 루틴 생성 split/single 실행 helper 분리는 완료했다.
- 자연어 해석 결과의 검증과 정규화는 이미 정책으로 분리했으므로, 남은 실행 orchestration을 작은 단위로 줄인다.
- `ExecuteCoreAsync`는 한 차례 더 쪼갰고, 루틴 명령 정책과 텔레그램 대화/LLM helper도 분리됐으며, 루틴 생성은 전략/프롬프트/검증/실행 helper로 더 나뉘었다.
- 이번 회차에 `CommandService.Telegram.LlmControl`의 `/model` quick selection, Groq/Copilot 모델 설정, LLM 상태/모델/사용량 리포트 본문은 `CommandService.Telegram.LlmModelSelection`과 `CommandService.Telegram.LlmReports`로 분리했다.
- 이번 회차에 이어 `CommandService.Telegram.LlmControl`의 parsed `/llm` command 실행 switch와 provider set/multi channel mutation bridge도 `CommandService.Telegram.LlmCommandBoundary`로 분리했다.
- 이번 회차에 `CommandService.Telegram.LlmCommandBoundary`/`CommandService.Telegram.LlmModelSelection` 내부의 직접 provider/model channel mutation도 `CommandService.Telegram.LlmChannelMutation`으로 분리했고, 추가로 `CommandService.Telegram.LlmModelSelection` 내부의 quick/Groq/Copilot preference/provider selected model 직접 mutation을 mutation request helper로 더 낮췄다.
- 이번 추가 회차에는 `TelegramLlmMutationApplicationService`를 추가해 `CommandService.Telegram.LlmChannelMutation` 자체에 남아 있던 `_telegramLlmPreferences`, `_telegramLlmLock`, `_llmRouter`, `_copilotWrapper`, `SetChannelProvider`, `SetChannelModel` 직접 의존도 application service command boundary로 이동했다.
- 이번 추가 회차에는 공통 `CommandService.LlmSettings.cs`에 남아 있던 웹/텔레그램 프로필·모드·상태 출력·웹 provider/model state mutation도 `LlmSettingsApplicationService`로 낮췄다.
- 다음 구체적 분리 후보는 새 unified slash boundary 내부에 남은 `CommandService` private state/도메인 메서드 호출을 실제 application service command boundary 쪽으로 더 낮추거나, 텔레그램 coding settings의 남은 preference mutation을 command boundary/service로 더 낮추는 일이다.
- 5번 프론트엔드 상태 관리 부재는 root shell 분리, 주요 화면 page-level store 분리, React/CDN 부트 fallback, root Error Boundary까지 완료했으므로 1차 보강을 닫는다.
- 7번 Tauri 백엔드 충돌 1차 보강은 닫았다.
- 8번 C11 코어 데몬 오버엔지니어링은 완전 해결했다. 다음 순서에서는 8번을 반복하지 않는다.
- 10번 로컬 고립 한계는 portable package manifest, Settings 화면 표시, `SHA-256` 무결성 검증, portable-package-only 동기화 정책, 파일 충돌 preview, 선택적 범위 UX, 로컬 교차 루트 import 테스트, 수동 QA 체크리스트까지 붙였고, Gist/클라우드 provider/물리 다른 머신 QA를 후속으로 정리한다.
- 9번은 staged/fake/subagent의 OS kill을 반복 구현 대상으로 보지 않는다. 해당 lane은 프로세스가 없으므로 fail-closed 완료로 유지한다. SQLite/DB 큐 전환은 Phase 5 상태 DB 마이그레이션과 묶기로 판단 완료했으므로, 다음 개발 작업은 10번 실제 provider/물리 다른 머신 QA와 12번 Phase 5 새 스택 유입 차단 실사용 확인 및 루트 `omnux/` 프로토타입 정리 판단을 순서대로 좁힌다. 11번 live QA는 사용자의 최종 수동 테스트로 빼둔다.
- 11번 텔레그램 모바일 UX는 명령별 무거운 출력 차단, `/handoff` 데스크톱 문서 연결, `/coding download` 로컬 선택/상한 정책, 운영 문서 연결, live QA 스크립트, 실제 모바일 QA 체크리스트, deep link 미도입 최종 판단까지 1차 보강을 닫았다. 실제 token/chat id로 `scripts/telegram-mobile-live-qa.mjs`를 실행해 메시지 전송, 문서 첨부 전송, 모바일 ack, 첨부 echo-back 판정을 모두 통과시키는 확인은 사용자의 최종 수동 테스트에서 수행한다.
- 자연어 결과 실행의 public `ExecuteAsync` 재진입, unified slash channel 직접 mutation, unified slash memory/doctor/domain/LLM 직접 bridge 경계, Telegram LLM control 내부 memory 직접 실행 경계, Telegram LLM control 내부 report/model selection 직접 실행 경계, Telegram LLM control 내부 `/llm` 실행 switch와 provider/multi-channel 직접 mutation 경계, Telegram LLM command/model-selection boundary 내부의 직접 channel mutation 경계, 공통 `CommandService.LlmSettings.cs` 내부의 직접 웹/텔레그램 채널 설정 mutation 경계, Telegram `/talk`·`/code` 직접 프로필 mutation 경계는 제거했다. 다음에는 unified slash boundary 내부와 Telegram coding settings처럼 아직 `CommandService` private state에 닿는 세부 mutation을 application service command boundary로 더 낮춘다.
- 분리한 경로마다 계약 테스트를 추가해 회귀를 잠근다.
- 치명적 결함을 먼저 완전 해결한 뒤 Phase 2~5 기능 개발을 순서대로 재개한다.

---

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

현재 진행 중인 리팩터링과 UI 마이그레이션을 넘어, 프로젝트가 기술 부채에 짓눌리지 않기 위해 **반드시 해결해야 할 12가지 치명적 맹점**은 다음과 같습니다.
다만 이 12건을 **한 번에 먼저 다 고쳐서 개발을 멈추는 방식**이 아니라, 현재 진행 가능한 기능 개발을 계속 밀면서 아래 우선순위대로 순차적으로 제거합니다.

### [내 기준의 처리 순서]
1. **AI 코드 검증의 착각 (TDD 파이프라인 부재)**
   - 안전하게 큰 변경을 하기 위한 선결 조건이므로 가장 먼저 고칩니다.
2. **'보안 샌드박스'라는 착각 (RCE 위험)**
   - 로컬 실행의 가장 큰 보안 위험이라서 우선 처리합니다.
3. **의존성(Dependency) 격리 방안의 부재 (로컬 환경 오염)**
   - AI 생성 코드의 실행 안정성과 재현성을 위해 바로 잡아야 합니다.
   - 현재는 host package manager 기반 자동 설치를 제거하고, workspace-local `.venv`와 `node_modules`만 쓰도록 1차 보강을 완료했다.
4. **미들웨어의 'God Object' 문제 (Orchestration 결합)**
   - 구조 분리와 유지보수성의 중심이므로 다음 순서로 처리합니다.
5. **프론트엔드 상태 관리 부재 (React 'app.js' 괴물 전이 위험)**
   - Phase 5 마이그레이션의 전제이므로 함께 정리합니다.
6. **'자율'에 취해 '안전벨트(Rollback)'를 버린 플랫폼 아키텍처**
    - 완료. 백엔드 snapshot/restore/차단, WS 계약, Build 화면 복원 UI, 테스트 11개까지 모두 구현·검증 완료.
7. **Tauri 마이그레이션에서의 '백엔드 충돌' (Rust vs .NET)**
   - Phase 5 진입 전에 경계를 분명히 해야 합니다.
8. **C11 코어 데몬의 극악한 오버엔지니어링**
   - 완료. C11 코어 데몬과 alias는 제거했고 `.NET` core runtime 계약으로 재도입을 막는다.
9. **멀티 에이전트 모드의 비용 및 Rate Limit 폭주**
   - 실제 고부하 기능을 밀 때 바로 발목을 잡는 문제라서 뒤따라 정리합니다.
10. **'로컬 우선(Local-first)'이 아닌 '로컬 고립(Local-Isolated)'의 한계**
    - 외부 패키징/이식성 계획이 붙는 시점에 고칩니다.
11. **텔레그램 봇 맹신으로 인한 모바일 UX 붕괴**
    - 알림/트리거와 본작업 분리를 더 선명하게 만듭니다.
12. **기술 스택의 지독한 파편화 (Language Fragmentation)**
    - C11과 루트/미들웨어 생성 산출물은 제거했고 새 언어/런타임 승인 기준도 문서와 계약 검사에 고정했다. 남은 작업은 Phase 5 진행 중 새 스택 유입 차단의 실제 적용 확인이다.

### [구조 및 아키텍처 결함]
1. **미들웨어의 'God Object' 문제 (Orchestration 결합)**
   - **현황**: 파서(Parser)는 분리되었으나, 핵심인 상태 관리, 루프 제어, 노드 실행 로직이 여전히 `CommandService`에 뭉쳐 있습니다.
   - **대응**: 도메인별(코딩, 루틴, 로직) 전용 Orchestrator를 분리하고 DI를 통해 결합도를 완전히 끊어내야 합니다.

2. **프론트엔드 상태 관리 부재 (React 'app.js' 괴물 전이 위험)**
   - **현황**: 기존 대시보드의 `app.js` 셸 상태 과대화 문제를 안고 Phase 5로 넘어갑니다.
   - **대응**: 마이그레이션 첫 단추부터 **Zustand, Jotai** 같은 명확한 전역 상태 아키텍처를 도입하고 Store를 철저히 분할해야 합니다.

3. **'보안 샌드박스'라는 착각 (RCE 위험)**
   - **현황**: 현재의 `omnux-sandbox`는 파이썬 실행 시간과 메모리만 얕게 제한합니다.
   - **대응**: AI가 생성한 임의 코드를 로컬에서 실행하므로, **Docker 컨테이너, gVisor, Firecracker** 수준의 진짜 OS 레벨 샌드박스를 구축해야 RCE 취약점을 막을 수 있습니다.

4. **의존성(Dependency) 격리 방안의 부재 (로컬 환경 오염)**
   - **현황**: AI 생성 코드를 실행할 때 발생하는 패키지 설치(`pip install` 등)가 로컬 환경을 오염시킵니다.
   - **대응**: 코딩 에이전트 실행 시 즉석에서 Ephemeral Virtualenv나 Nix 환경을 스핀업하고 종료 후 완벽히 폐기(Teardown)해야 합니다.

5. **멀티 에이전트 모드의 비용 및 Rate Limit 폭주**
   - **현황**: 다중 에이전트(기획->코더->리뷰) 오케스트레이션 시 API 호출량이 증폭되어 429 에러에 매우 취약합니다.
   - **대응**: '토큰 버킷(Token Bucket)' 큐잉 및 스마트 롤백/폴백(Smart Fallback) 구조를 도입해야 합니다.

6. **AI 코드 검증의 착각 (TDD 파이프라인 부재)**
   - **현황**: stdout/stderr 로그만으로 에러 여부를 판단하여 논리적 버그를 잡지 못합니다.
   - **대응**: AI가 무조건 단위 테스트(Unit Test)를 먼저 작성하고 통과할 때만 성공으로 간주하는 'Test-Driven AI Generation' 게이트가 필요합니다.

### [제품 철학 및 UX 한계]
7. **'로컬 우선(Local-first)'이 아닌 '로컬 고립(Local-Isolated)'의 한계**
   - **현황**: 모든 데이터가 내 PC 구석에 고립되어 이식성(Portability)과 확장성이 0입니다.
   - **대응**: 루틴, 스킬, 환경 설정을 Gist 등으로 Export/Import 하는 '패키징 아키텍처' 및 클라우드 동기화 브릿지가 필요합니다.

8. **텔레그램 봇 맹신으로 인한 모바일 UX 붕괴**
   - **현황**: 코딩 Diff 뷰어 등 모바일 메신저에 맞지 않는 무거운 기능까지 텔레그램 명령어에 구겨 넣고 있습니다.
   - **대응**: 텔레그램은 '알림/트리거'로 제한하고, 무거운 작업은 데스크톱(Tauri) 환경으로 유도(Handoff)하도록 엄격히 분리해야 합니다.

9. **'자율'에 취해 '안전벨트(Rollback)'를 버린 플랫폼 아키텍처**
   - **현황**: 플랫폼 설정(`routing-policy.json` 등)이 꼬였을 때 복구할 타임머신 메커니즘이 없습니다.
   - **대응**: 플랫폼 자체 설정과 상태(State)에 대해 버튼 한 번으로 특정 시점으로 회귀할 수 있는 버저닝(Versioning) 시스템을 구축해야 합니다.

### [오버엔지니어링 및 기술 파편화]
10. **기술 스택의 지독한 파편화 (Language Fragmentation)**
    - **현황**: C11 코어 데몬과 루트 Electron/Codex 번들 잔재, 미들웨어 루트의 Python/Node.js/C 코딩 산출물 묶음은 제거했습니다. 활성 스택은 .NET 9 미들웨어, 대시보드 JavaScript, 데스크톱 React/TypeScript+Rust 셸, Python 샌드박스, Node.js 계약 검사로 좁혔습니다.
    - **대응**: 새 비즈니스/상태 로직은 .NET 9 미들웨어로 모으고, 새 언어/런타임은 문서화된 승인 기준 없이는 추가하지 않도록 계약으로 막아야 합니다.

11. **C11 코어 데몬의 극악한 오버엔지니어링**
    - **현황**: 완료. `apps/omnux-core`, 루트 core alias, legacy bootstrap/socket/auth C# 경로를 제거했고 `.NET` `DotNetCoreRuntimeClient`가 metrics와 guarded kill을 담당합니다.
    - **대응**: 재도입 방지는 `scripts/check-core-daemon-boundary-contract.mjs`와 기술 스택 계약으로 유지합니다.

12. **Tauri 마이그레이션에서의 '백엔드 충돌' (Rust vs .NET)**
    - **현황**: 1차 보강 완료. Tauri Rust는 앱 셸(Window 관리), dev bootstrap, sidecar 연결 경계만 맡고 .NET 미들웨어가 도메인 제어를 담당합니다.
    - **대응**: Phase 5 본작업에서 화면별 이식과 WS 연결을 진행하되 Rust 쪽에 provider/API/상태/도메인 로직을 추가하지 않도록 계약을 유지합니다.

---

## 5. UI 전환 및 마이그레이션 진척도 (Phase 1~5)

전체 WS 연결률: 55/93 (59%). Phase 1~4 완료 시 93/93 (100%).

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
