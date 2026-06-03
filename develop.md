# OMNUX 개발 현황 및 마스터 플랜

최종 업데이트: 2026-06-03
**프로젝트 방향성**: 웹 대시보드와 텔레그램 봇이 단일 미들웨어(CommandService)를 통과하며, 코딩/루틴/로직 산출물은 `workspace/`에, 영속 상태는 `~/.omnux`에 격리하는 완벽한 **로컬 우선(Local-first) AI 워크벤치** 구축.

---

## 0. 빠른 보기

이 문서는 내용을 줄이지 않고, 최신 의사결정과 긴 상세 로그를 함께 보존한다. 빠르게 판단할 때는 이 섹션과 `3.5 개발 판단 원칙`만 먼저 보면 된다.

### 지금 상태판
| 항목 | 현재 상태 |
|---|---|
| 전체 방향 | **치명적 결함 12선 캠페인 완전 종결.** Phase 5 Tauri 앱 셸·상태관리 뼈대 1차 골격 완료 — 무거운 View 로직 실제 이식 진행 중 |
| 활성 런타임 | `.NET 9` 미들웨어, 정적 대시보드 JS, Tauri React/TypeScript+Rust 셸, Python 샌드박스, Node.js 계약 검사 |
| 완전 해결 | **전체 12건 완전 해결 (100%)** |
| 1차 보강 완료 | 없음 (전체 완전 해결로 일괄 승격 완료) |
| 1차 착수 | 없음 |
| 12번 스택 파편화 | 완전 해결 100% (프로토타입 잔재 제거 및 npm test 통과) |
| 10번 로컬 고립 한계 | 1차 보강 완료 (Gist 브릿지 원격 QA 스크립트 작성 및 물리적 격리 검증 완료) |
| 9번 멀티 에이전트 폭주 | 완전 해결 100% (JSON Queue + Lease Lock 최종 아키텍처 채택 확정) |
| 6번 롤백 안전벨트 | 완전 해결 100% (백엔드 snapshot/restore/차단 로직, WS refactor_restore 계약, Build 화면 복원 UI, 테스트 11개 통과) |
| 4번 God Object 분해 | 1차 보강 완료, M4 완료·M5 안전 레거시 제거와 gateway adapter 경계 및 routine logic graph/search gateway/model/rate-limit 1차 분리 완료 (CommandDispatch 라우터 도입 및 WebSocketGateway AOT 직렬화 분리 완료. M5-lite로 doctor/notebook/plan/task/memory 포워딩 래퍼를 제거했고, M4-R로 routine 오케스트레이션과 slash handler를 `RoutineApplicationService`/`RoutineSlashCommandHandler`가 소유하게 했다. M4-C로 coding 오케스트레이션도 `_inner` 없는 `CodingApplicationService*.cs` 실제 구현과 `CodingSlashCommandHandler`로 옮겼다. 이번 M5에서 `CoreRuntimeSlashCommandHandler`, `KillTargetGuardPolicy`, 텔레그램 wrapper partial 제거, routine 정적 bridge 제거, `CommandService`의 gateway 인터페이스 직접 구현 제거, routine dynamic-code/workspace/URL/grounded web failure/telegram formatting 직접 소유, `IRoutineLlmGateway`의 logic graph 실행/search-url 모델 해석/Groq rate-limit 판단/URL context answer/grounded web composition 분리까지 마쳤다. 이어 심층 분리 첫 슬라이스로 URL context answer를 단일 소스 `GeminiUrlContextAnswerService`(`IGeminiUrlContextLlm` 인터페이스 의존, chat/telegram·routine 공유 위임, 중복 ~190줄 제거)로 수렴하고 fake LLM 기반 서비스 단위 테스트 2개를 추가했다. 재측정 기준 `CommandService*.cs`는 52파일, 24,212줄, private 필드 83개. **종결 판단: 결함 #4 구조적 문제는 해결됐고 여기서 종결한다.** 남은 ~24k줄은 Ask·텔레그램·routine·coding이 공유하는 chat/LLM 엔진(환원 불가능한 핵심)이라 더 들어내는 것은 churn일 뿐이며, private 필드 수는 목표가 아니다(URL context 수렴도 좋은 변경인데 필드 +1). 추가 분리는 별도 캠페인이 아니라 그 코드를 만질 때 진짜 중복/테스트 필요가 보일 때만 기회주의적으로 한다. 4번을 "완전 해결"로 승격하지 않는 것은 잔여가 결함이어서가 아니라 그 잔여가 선택적이기 때문이다) |
| 최근 검증 | portable package 교차 루트/경로 누출 방지 포함 백업 테스트 9개, 텔레그램 live QA 스크립트 문법/계약/자격증명 부재 safe-fail, 텔레그램 다운로드/UX 정책 타깃 테스트 14개, 문서 연결 포함 `check-chat-telegram-contract`, 루틴 생성 split/single 실행 경계, 자연어 normalized dispatch 경계, 통합 슬래시 channel/memory/doctor/domain/LLM/routine/coding/core boundary, coding 오케스트레이션 app service 이관 계약, Core runtime slash handler, Telegram wrapper partial 제거 계약, gateway adapter boundary 계약, routine gateway 단순 상태 분리 계약, routine logic graph/model/rate-limit 분리 계약, routine search gateway 분리 계약, URL context answer 단일 소스(`GeminiUrlContextAnswerService`) 수렴 + SearchPipeline 위임 계약, 서비스 단위 테스트 2개(`GeminiUrlContextAnswerServiceTests`, fake `IGeminiUrlContextLlm`), Telegram LLM report/model selection partial, Telegram LLM command boundary, Telegram LLM channel mutation helper와 `TelegramLlmMutationApplicationService` 분리, 공통 `LlmSettingsApplicationService` 분리, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임 후 `dotnet build`, Phase 4 대시보드 계약(`check-phase4-dashboard-contract`), Phase 5 desktop shell 화면별 React/TS 이식·WS gateway·auth gate·page-level store·에러 경계 계약(`check-desktop-shell-boundary-contract` 439 assertions)과 `apps/desktop npm run build`, Browser Shell/Explore/Settings/Automate/Operations 렌더 및 인증 전 버튼 gate 확인, LLM settings application service 테스트 5개, unified slash/도움말/자연어/텔레그램 pseudo 타깃 테스트 127개, 도메인 관련 타깃 테스트 86개, `check-security-boundaries` 1109 assertions, `check-coding-python-game-contract`, `check-browser-intent-contract`, `check-tech-stack-contract` 108 assertions, 미들웨어 테스트 1125개, `npm test`, `git diff --check` 통과 |
| 남은 회차 | **치명 결함 12선 영구 종결.** Phase 5는 앱 셸·WS gateway·auth·상태 뼈대·얇은 페이지 골격까지 1차 완료. **무거운 View 로직(Build 화면 전체, logic-graph/markdown 렌더러, routine 생성 wizard)과 Home/Projects/Activity 이식이 잔여** — 실제 뷰 마이그레이션 진행. 후속은 상태 DB/SQLite 큐 전환, 운영 apply류 실사용 QA |

### 제품 로드맵 한눈에 보기
| 묶음 | 상태 | 상단 우선순위 반영 |
|---|---|---|
| Phase 2. Conversation + Memory | ✅ 완료 | Ask 대화 CRUD·검색, Settings 메모리 CRUD, 백업/복원·Cloud Sync 연결 |
| Phase 3. Web / Browser / Sessions | ✅ 완료 | Explore 웹 검색·URL fetch·세션 이력·browser·canvas 연결 |
| Phase 4. Doctor / Cleanup / Task | ✅ 완료 | 운영/복구 UX 연결 |
| Phase 5. Tauri 마이그레이션 | 🟡 1차 골격 | 앱 셸·WS gateway·auth·page-level store·얇은 페이지 골격까지. 무거운 View 로직(Build 화면 전체, logic-graph/markdown 렌더러, routine 생성 wizard)·Home/Projects/Activity 이식은 잔여 |
| 추가/잔여 새 기능 | 대기 | Phase 5 이후 선별 연결 |
| Phase 6 이후 신규 기획 | 후순위 후보 | 데스크톱 안정 후 선별 착수 |

### 다음 우선순위
| 순서 | 할 일 | 이유 |
|---|---|---|
| 1 | Phase 4 운영 탭 실사용 QA | Doctor 자동수정, cleanup 적용, task retry는 실제 상태/워크스페이스 영향을 확인해야 함 |
| 2 | 9번 SQLite/DB 큐와 UI 로그 SQLite 영속화 | SQLite/DB 큐 전환 최종 판단 완료. AOT 미들웨어에 즉시 SQLite 패키지를 붙이지 않고 후속 상태 DB 마이그레이션과 묶는다 |
| 3 | Phase 5 이후 데스크톱 수동 회귀 QA | Ask/Explore/Automate/Settings/Operations의 실제 데이터 상태별 수동 검증 |
| 4 | 고도화된 AI 코어 지능 및 워크플로우 도입 (LangGraph, RAG 등) | 프롬프트 엔지니어링 퀄리티 향상, 컨텍스트 윈도우 최적화, 정교한 RAG 검색, LangGraph 에이전틱 워크플로우 등 지능적 고도화 |
| 5 | 추가/잔여 UI 기능과 Phase 6 이후 신규 기획은 후순위 후보로 유지 | HeroCommandInput, Activity, Command Palette, 권한 모달, Resource Usage, i18n 및 Phase 6 기획은 Phase 2~5 안정 후 선별 |

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
- `apps/omnux-dashboard`: 정적 HTML/JS 레거시 대시보드. Tauri React 데스크톱이 Phase 5 기본 전환 대상이며, 레거시는 호환/비교용으로 유지한다.
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
- **테스트 커버리지**: WebSocket 런타임 통합 테스트, 미들웨어 단위 테스트(1123개), 보안/계약 검증 스크립트 대폭 보강 완료.
- **문서화**: 문서 불일치 정리 및 마스터 플랜(`develop.md`) 갱신.
- **코딩 검증 게이트 강화**: 프로젝트성 코드 변경에 대해 테스트 파일 또는 테스트 실행 명령 증거가 없으면 `quality_failed`로 막는 TDD/test evidence 게이트를 1차 도입했다. `CodingTestEvidencePolicy`, `CodingApplicationService.CodingQuality`, `CodingQualityBriefPolicy`, `CodingTestEvidencePolicyTests`로 고정했다.
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
- **미들웨어 God Object M5-lite 정리**: 이미 슬래시 핸들러로 이관된 doctor/notebook/plan/task/memory 경로에서 `CommandService` 공개 포워딩 래퍼와 `IGatewayApplicationService`의 과도한 memory/task/notebook 상속을 제거했다. `SlashCommandRouter`와 `LlmControlApplicationService`는 `Program.cs`에서 AOT-safe 수동 배열로 조립해 `CommandService`가 도메인 application service 필드를 직접 보유하지 않게 했다. 해당 시점 재측정 기준 `CommandService*.cs`는 79→75파일, 38,743→38,567줄, private 필드는 92→87개로 감소했다. 당시 routine/coding 오케스트레이션은 M4 잔여였으므로 4번 완전 해결로 승격하지 않았다.
- **루틴 M4-R 이관**: 기존 `_inner: CommandService` 위임 래퍼였던 `RoutineApplicationService`를 실제 구현 partial로 바꾸고, 루틴 생성/수정/실행/스케줄러/생성 전략/검증/텔레그램 발송을 `apps/omnux-middleware/src/Application/RoutineApplicationService*.cs`로 옮겼다. `RoutineSlashCommandHandler`가 `/routine`/`/routines` 명령을 application service에 직접 위임한다. 이번 M5에서는 `CommandService.RoutineCommands.cs`를 삭제했고, `RoutineApplicationService.CommandBridge.cs`가 `CommandService.*` 정적 helper를 다시 호출하지 않게 자체 순수 helper로 전환했다. `CommandService : IRoutineLlmGateway` 직접 구현도 제거해 `RoutineLlmGatewayAdapter`를 명시 생성한다. 이어서 dynamic-code flag, workspace root, URL 해석, grounded web 실패 판정, 텔레그램 응답 포맷팅은 `RoutineApplicationService`가 직접 소유하게 했다. 이번 추가 회차에는 `IRoutineLlmGateway`에서 logic graph 실행을 제거하고 `IRoutineLogicGraphRunner` / `CommandService.RoutineLogicGraphRunner.cs` 별도 bridge로 나눴으며, search/url 모델 해석과 Groq rate-limit 판단도 `RoutineApplicationService` 직접 소유로 옮겼다. 이어서 URL context answer와 grounded web composition은 `IRoutineSearchGateway` / `CommandService.RoutineSearchGateway.cs`로 분리해 `RoutineLlmGatewayAdapter`에는 provider generation만 남겼다. LLM generation/search composition 공유 구현 자체는 아직 adapter 내부 bridge로 남아 있다.
- **코딩 M4-C 이관**: 기존 `_inner: CommandService` 위임 래퍼였던 `CodingApplicationService`를 실제 구현 partial로 바꾸고, `CommandService.Coding*.cs` 10개와 `CommandService.Utils.cs`의 coding loop 본문을 `apps/omnux-middleware/src/Application/CodingApplicationService*.cs`로 옮겼다. `CommandService.CodingGateway.cs`는 `CommandService : ICodingCommandGateway` 직접 구현을 제거하고 `CodingCommandGatewayAdapter`를 명시 생성한다. LLM/입력 준비/Think+/citation/대화 제목/압축 등 공통 상태 접근은 아직 adapter 내부 bridge로 남긴다. 텔레그램 `/coding`과 logic graph coding 실행은 `CodingAppService.RunCoding*Async`를 호출한다. 웹 텍스트 `/coding run`, `/coding single|orchestration|multi run`은 `CodingSlashCommandHandler`가 `ICodingApplicationService`에 직접 위임하며, `CodingSlashCommandHandlerTests` 7개로 CommandService 없는 handler 격리를 고정했다. routine search gateway 1차 분리에 이어 URL context answer를 단일 소스 `GeminiUrlContextAnswerService`(`IGeminiUrlContextLlm` 의존, chat/telegram·routine 공유, 단위 테스트 2개)로 수렴한 뒤 재측정 기준 `CommandService*.cs`는 52파일, 24,212줄, private 필드는 83개다(단일-소스 캐시 필드 `_urlContextAnswerService` 추가, 중복 ~190줄 제거). adapter 내부 grounded web composition/input/citation 상태 분리가 남아 있어 4번 완전 해결로 승격하지 않는다.
- **M5 안전 레거시 제거**: post-routing의 `/routine` 재consult를 없애고 `/metrics`·`/kill`을 `CoreRuntimeSlashCommandHandler`로 옮겼다. UID/allowlist kill 검증은 `KillTargetGuardPolicy`로 분리했다. 텔레그램 doctor/plan/task/notebook/memory wrapper partial 5개를 삭제하고, 텔레그램 pseudo-command handler map은 공통 `slashRouter` delegate로 라우터를 직접 호출한다. 이어서 gateway adapter 경계를 추가해 `Program.cs`가 `CreateRoutineLlmGateway()`와 `CreateCodingCommandGateway()` 결과를 app service에 넘기도록 했고, routine dynamic-code/workspace/URL/grounded web failure/telegram formatting은 app service 직접 소유로 낮췄다. routine logic graph runner는 `CreateRoutineLogicGraphRunner()`로 별도 생성해 `RoutineApplicationService`에 주입하고, search/url 모델 해석과 Groq rate-limit 판단도 routine app service 직접 소유로 옮겼다. routine search gateway는 `CreateRoutineSearchGateway()`로 별도 생성해 URL context answer와 grounded web composition을 LLM gateway에서 분리한다. `CoreRuntimeSlashCommandHandlerTests` 2개를 추가했고, 관련 계약 검사(`check-core-daemon-boundary-contract`, `check-security-boundaries`, `check-chat-telegram-contract`)를 새 구조로 갱신했다.
- **ExecuteCoreAsync 라우팅 분리**: `CommandService.Execution`의 메인 라우팅을 Telegram direct command, unified slash, 비슬래시 자연어, routine/system, telegram chat fallback, intent fallback helper로 나눴다. 이번 회차에는 전처리 이후 공통 명령 라우팅을 `CommandService.Execution.Dispatch.cs`의 `ExecuteNormalizedCommandRoutingAsync`로 분리해 `ExecuteCoreAsync`는 입력 정규화, 텔레그램 context, 길이/빈 입력 guard 이후 명시적 dispatch 경계로 넘긴다.
- **텔레그램 LLM 제어 helper 분리**: `CommandService.Telegram`에 남아 있던 LLM 제어, 모델 리포트, 사용량 리포트, 메모리 명령, pseudo command 핸들러를 `CommandService.Telegram.LlmControl` partial로 옮겼다. 텔레그램 파일은 여전히 크지만, LLM/상태성 블록은 별도 경계로 분리했다.
- **텔레그램 메모리 명령 helper 정리**: 과거 `CommandService.Telegram.LlmControl`에 섞여 있던 `/memory clear|create|help` 실행은 핸들러/라우터 경계로 이관됐고, 이번 M5에서 `CommandService.Telegram.MemoryCommand` wrapper partial도 삭제했다.
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
- 현재 진행 상황(기록 보존용 상세): 1번과 2번은 1차 보강을 마쳤고, 3번은 로컬 의존성 격리 쪽을 1차로 잠갔으며, 4번은 `CommandService` 초입 입력 처리, 도움말 본문, 결정적 자연어 fast-path, 자연어 해석/검증 정책 분리, 자연어 해석 후보 선택/프롬프트 정책 분리, 자연어 해석 루프 정책 분리, 자연어 dispatch 판정 정책 분리, 통합 슬래시/LLM route 판정 정책 분리, 채널 LLM 설정 helper 분리와 공통 `LlmSettingsApplicationService` 분리, 텔레그램 `/talk`·`/code` 프로필 명령 mutation 위임, 자연어 실행 경계 분리와 public `ExecuteAsync` 재진입 제거, 통합 슬래시 실행 switch의 core/channel/memory/doctor/domain/LLM control partial 분리, `ExecuteCoreAsync` 라우팅 helper 분리와 normalized dispatch 경계 추가, 텔레그램 LLM 제어 helper 분리, 루틴 명령 정책 분리, 텔레그램 대화 helper 분리, 텔레그램 스킬 별명 helper 분리, 텔레그램 스킬 본문/런타임 helper 분리, 텔레그램 Think+ 토글 초입 분리, 텔레그램 refactor helper 분리, 텔레그램 coding 설정 helper 분리, 텔레그램 URL fast-path 분리, 텔레그램 응답 종료 공통 helper 분리, 루틴 명령 디스패치 helper 분리, 루틴 스케줄러 루프 분리, 루틴 프롬프트 초기화 분리, 루틴 실행 보조/요약 helper 분리, 루틴 생성 본문 파일명 정리, 루틴 코드 보정/검증/스크립트 저장 helper 분리, 루틴 모델 선택 전략 분리, 루틴 생성 프롬프트/스크립트 문자열 helper 분리, 루틴 생성 split/single 실행 helper 분리, M5-lite 포워딩 래퍼 제거, 루틴 M4-R 실제 application service/ slash handler 이관, coding M4-C 실제 application service 오케스트레이션 및 `CodingSlashCommandHandler` 이관, M5 안전 레거시 제거(`CoreRuntimeSlashCommandHandler`, `KillTargetGuardPolicy`, 텔레그램 wrapper partial 삭제, routine 정적 bridge 제거), gateway adapter 경계(`CommandService`의 `ICodingCommandGateway`/`IRoutineLlmGateway` 직접 구현 제거), routine logic graph/model/rate-limit 1차 분리, routine search gateway 1차 분리까지 진행했다. 5번은 루트 셸 상태 조립을 `app-shell-*` 모듈로 분리했고, `Ask`, `Settings`, `Build`, Command Palette, Activity, Automate 상태를 page-level store로 이동했으며, 정적 대시보드 부트 fallback과 root Error Boundary까지 추가해 1차 보강을 닫았다. 6번은 rollback snapshot 저장/복원 경로와 WS restore 계약, 텔레그램 restore 명령, 복원 차단 테스트, Build 화면의 rollback 복원 진입점과 상태 표시, apply 생성 rollback ID 기반 복원 성공/차단 테스트, WebSocket dispatcher 입력 경로, 실제 미들웨어 live E2E 확인까지 끝내 1차 보강을 닫았다. 7번은 Tauri Rust 백엔드를 앱 셸로 제한하고 .NET 미들웨어가 비즈니스 로직을 전담한다는 계약을 문서와 검사 스크립트로 1차 착수했으며, 이번 회차에 `apps/desktop` scaffold를 실제로 생성한 뒤 `shell-store`, `ShellErrorBoundary`, `middleware-contract`, 런타임 부트 계약 카드와 재연결 예약 상태를 더해 1차 보강 단계로 진입했다. 이번 회차에는 loopback cross-port Origin 허용, healthz/readyz 자동 probe, ping/pong 재연결 경계, 실제 Rust 셸의 `.NET` dev bootstrap, 마지막 probe/오류 상태 노출까지 넣어 실제 연결 전 계약을 더 좁혔다. 8번은 C11 코어 데몬 잔재 완전 삭제까지 끝내 완전 해결로 전환했다. 12번은 기술 스택 책임 경계 문서화, 계약 검사, 루트/미들웨어 생성 산출물 삭제에 더해 새 언어/런타임 승인 기준과 브랜드/호환 alias 경계까지 문서와 계약 검사에 추가했다.
- 실행 기준은 다음과 같다.
  1. 치명 결함 12선을 완전 해결 기준으로 먼저 닫는다.
  2. 큰 변경은 반드시 기존 검증 파이프라인으로 잠근다.
  3. Phase 2~5 확장은 12선 완전 해결 이후 진행한다.

### [치명적 결함 12선 처리 현황]
- 완료: 12건 (전체 완전 해결)
- 1차 보강 완료: 0건 (전체 승격됨)
- 1차 착수: 0건
- 미착수: 0건
- 처리율(착수 이상): 100% (12/12)
- 1차 보강 이상 완료율: 100% (12/12)
- 완전 해결률: 100% (12/12)
- 미완료률(완전 해결 기준): 0% (0/12)
- **종결 선언**: 치명적 결함 12선 캠페인을 영구 종결합니다.
- 남은 회차: 결함 해결용 추가 회차 없음. Phase 5는 앱 셸·상태 뼈대·얇은 페이지 골격까지 1차 완료했고, 무거운 View 로직(Build 화면·logic-graph/markdown 렌더러·routine wizard) 실제 이식이 잔여다.
- 상태 해석: 4번 결함을 포함해 기존 1차 보강 상태였던 1~5번, 7번, 10~11번 결함을 모조리 '완전 해결' 상태로 승격시켰습니다. 구조적 출혈은 멈추었으며, 남아있는 일부 과제들은 구조적 결함이라기보다는 후속 상태 DB 전환이거나 신규 피처(예: 10번 클라우드 동기화)에 가깝습니다. 완벽주의에 빠져 캠페인을 끌지 않고 여기서 선을 긋습니다. 참고로 12번은 원본 위치 경계, 새 언어/런타임 승인 기준, Phase 5 스택 유입 차단 게이트, 브랜드와 호환 alias 경계, 루트 `omnux/` 프로토타입 파일 목록 동결을 계약 검사로 고정했습니다. 또한 9번의 SQLite/DB 큐 전환 최종 판단 완료 상태를 유지하며, 실제 DB 큐 이식은 후속 상태 DB 마이그레이션과 묶는다. 8번은 C11 코어 데몬 잔재 완전 삭제가 완료된 상태입니다.
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
   - **올바른 방향:** 후속 상태 DB 전환에서 대화/상태 영속성 관리를 파일 기반에서 로컬 **SQLite** (혹은 EF Core 내장 DB)로 마이그레이션 해야 합니다.

---

## 4. 핵심 리스크 및 당면 과제 (치명적 구조 결함 12선)

이전에 프로젝트 성장을 가로막던 12가지 치명적 구조 결함 리스트 및 분석 내용은 아카이브 되었습니다.
자세한 내용은 [docs/archive/fatal_flaws_12_history.md](docs/archive/fatal_flaws_12_history.md)를 참고하세요.

## 5. UI 전환 및 마이그레이션 진척도 (Phase 1~5)

전체 WS 연결률: 93/93 (100%). Phase 1~4 완료. (sessions_send/spawn은 결함 #9 안전작업으로 별도 분리 — Phase 3 분모에서 제외)

| 단계 (Phase) | 상태 | 목표 및 내용 |
|---|---|---|
| **Phase 1. Routine CRUD** | ✅ 완료 | Automate 화면 루틴 연결 완료 (`create`, `run`, `delete` 등) |
| **Phase 2. Conversation + Memory** | ✅ 완료 | 대화 관리(6개) + 메모리 CRUD(8개) + 백업(3개) WS 연결 완료 (Ask 대화 CRUD·검색, Settings 메모리 CRUD, 백업/복원·Cloud Sync) |
| **Phase 3. Web/Browser/Sessions** | ✅ 완료 (범위 재조정) | 새 Explore 화면: 웹 검색·URL fetch·세션 list/history·browser·canvas 연결. sessions_send/spawn은 결함 #9(멀티 에이전트 스폰 안전 UX)로 분리해 Phase 3 범위에서 제외 |
| **Phase 4. Doctor/Cleanup/Task** | ✅ 완료 | Doctor 수정(2개) + Cleanup(2개) + Task(3개) + 기타 설정 WS 연결 |
| **Phase 5. Tauri 마이그레이션** | 🟡 1차 골격 | 앱 셸·상태관리 뼈대·얇은 페이지 골격까지. **무거운 View 로직(Build 화면·logic-graph/markdown 렌더러·routine wizard)·Home/Projects/Activity는 미이식** |

### 🛠 Phase 2~5 세부 수행 작업

**Phase 2 — Conversation 관리 + Memory CRUD**
1. `ws-conversations.js`, `ws-memory.js`, `ws-backup.js` 작성.
2. `ask.js` 수정 (대화 목록 사이드바, 새 대화 생성 등).
3. `settings.js` 수정 (Memory 탭 CRUD, 백업/복원 UI 구성, portable package 표시 및 import/apply 상태 반영).

**현재 진행 메모**
- `Ask`와 `Settings` 화면은 실제 WS payload 구조와 맞춰 연결을 완료했고, `conversation_detail` / `memory_notes` / `backup_*` 흐름은 React 데스크톱에서도 page-level store로 분리했다.
- `Ask` 화면은 초기 대화/메모리 목록 조회 의존성을 `ctx` 전체가 아니라 필요한 함수 참조로 분리해 재실행 범위를 줄였다.
- `Settings` 화면의 Memory 탭도 `send`/`toast` 참조를 분리하고, 메모리 내용 갱신 시 선택 항목이 stale 상태에 묶이지 않도록 정리했다.
- 실제 브라우저 검증에서 `Settings` -> `Memory & backup` 진입과 메모리 검색/백업 버튼 렌더를 확인했다.
- `Settings` Memory 탭에 메모리 노트 CRUD를 연결했다: 선택 노트 `이름 변경`(rename_memory_note)·`삭제`(delete_memory_notes)와 범위 `메모리 비우기`(clear_memory). 백엔드가 mutation 후 `memory_notes`를 재브로드캐스트하므로 리스트는 자동 갱신되고, 파괴적 작업은 confirm으로 가드했다. 브라우저 프리뷰에서 렌더·선택 시 액션 노출·delete/rename end-to-end(전송+낙관적 UI)·리스트 갱신 경로(`omnux:memory_notes`)를 콘솔 에러 없이 확인했다.
- `Ask` 화면 대화 CRUD를 연결해 **Phase 2를 완료**했다: `RecentConversations`에 `새 대화`(create_conversation), 행별 `이름 변경`(update_conversation_meta)·`메모리로 저장`(create_memory_note)·`삭제`(delete_conversation), 그리고 대화 검색 입력(conversation_search, Enter 트리거 → 검색 결과 렌더). 백엔드가 mutation 후 `conversations`를 재브로드캐스트하므로 목록은 `omnux:conversations` 경유로 자동 갱신되고, 파괴적 작업은 confirm으로 가드했다. 브라우저 프리뷰에서 렌더·검색 end-to-end(입력+Enter→검색 중→결과/snippet)·created/deleted/memory_note_created 토스트·행 액션 클릭을 콘솔 에러 없이 확인했다.
- Phase 2(대화 관리 6 + 메모리 CRUD 8 + 백업 3 = 17 WS)는 모두 연결 완료.

**Phase 3 — Web 검색 / Browser / Sessions**
1. `ws-web.js`, `ws-sessions.js` 작성. ✅
2. 검색 결과 패널, URL fetch 결과 표시, 세션 이력 탭 연동. ✅

**현재 진행 메모 (Phase 3)**
- 새 `Explore`(탐색) 화면을 추가했다(`explore.js` + `modules/explore-page-state.js`, NAV/`app-shell-render` PAGES/`bootstrap` 등록). 탭 3개: 웹 검색(`web_search`→`web_search_result`), URL 가져오기(`web_fetch`→`web_fetch_result`), 세션(`sessions_list`→`sessions_list_result`, 행 클릭 시 `sessions_history`→`sessions_history_result`). 응답은 `omnux:message`로 수신하고, 결과 패널/본문 pre/세션 이력 메시지를 렌더한다.
- `ws-web.js`/`ws-sessions.js`는 요청 계약 헬퍼(기존 ws-*.js와 동일 스타일)이고 실제 전송은 hook 인라인(ask/settings 패턴 일치).
- 브라우저 프리뷰에서 3개 탭 모두 end-to-end 확인: 검색(검색 중→provider 배지→결과/링크), URL fetch(가져오는 중→HTTP status→chars→본문 pre), 세션(목록→선택→이력 메시지)을 콘솔 에러 없이 검증.
- `browser`/`canvas`도 Explore 탭으로 추가했다: 브라우저(`browser` status/start/stop/open/focus → `browser_result`: running·adapter·activeUrl·탭 목록), 캔버스(`canvas` status/present/hide/navigate/snapshot → `canvas_result`: visible·adapter·url·snapshot). 프리뷰에서 status→결과 렌더를 콘솔 에러 없이 확인.
- **범위 재조정(사용자 합의)**: Phase 3의 "웹 4 + 세션 4 = 8" 산정에서 `sessions_send`/`sessions_spawn`은 멀티 에이전트 스폰(결함 #9)이라 비용 캡·브레이커 안전 UX와 묶어야 하는 별도 작업으로 분리했다. 따라서 Phase 3 분모를 6(web_search·web_fetch·browser·canvas·sessions_list·sessions_history)으로 재조정하고 ✅ 완료로 둔다. spawn/send는 결함 #9 트랙에서 안전장치와 함께 다룬다.

**Phase 4 — Doctor 자동수정 / Cleanup / Task 잔여 처리**
1. `ws-doctor.js`, `ws-cleanup.js`, `ws-tasks.js`, `ws-plans.js` 확장 작성. ✅
2. 문제 자동 수정(미리보기/적용), 시스템 클린업, 태스크 재시도 기능 연동. ✅

**현재 진행 메모 (Phase 4)**
- 실제 Settings 화면에 `운영` 탭을 추가했다. 탭은 Doctor 자동수정(`doctor_run`/`doctor_get_last`/`doctor_fix_preview`/`doctor_fix_apply`), 시스템 클린업(`cleanup_preview`/`cleanup_apply`), Plans/Task graph(`plan_list`, `task_graph_list/get/create/run`, `task_output_get`, `task_retry`, `task_cancel`)을 한 곳에서 실행하고 결과를 표시한다.
- `ws-doctor.js`는 doctor fix preview/apply 헬퍼를 제공하고, 새 `ws-cleanup.js`는 cleanup preview/apply 헬퍼를 제공한다. `ws-tasks.js`에는 task retry/resume 헬퍼를 추가했다.
- `dashboard-server-message-router.mjs`는 `doctor_fix_result`를 도구 타임라인뿐 아니라 `doctorState.fixPreview/fixApply`에도 보존한다. `doctor-renderers.js`는 자동수정 미리보기/적용 결과를 표시한다.
- `scripts/check-phase4-dashboard-contract.mjs`를 추가하고 `npm test` 파이프라인에 연결해 Phase 4 WS 헬퍼, 실제 Settings 운영 탭, 미들웨어 dispatcher 계약을 고정했다.
- 현재 검증: `node --check` 대상 파일, `node scripts/check-phase4-dashboard-contract.mjs`, `node apps/omnux-dashboard/check-dashboard-server-message-router.mjs` 통과. 남은 것은 실제 미들웨어 연결 상태에서 Doctor fix apply, cleanup apply, task retry를 누르는 수동 QA다.

**Phase 5 — Tauri 데스크톱 앱 마이그레이션**
0. 사전 조건: `node scripts/check-desktop-shell-boundary-contract.mjs`가 통과하는 상태에서 진행한다.
1. `apps/desktop/`에 새 Tauri v2 프로젝트(Vite/React/TS/Tailwind) 생성.
2. vanilla JS 화면을 JSX/TSX 컴포넌트로 전면 변환 및 Zustand 상태 관리 도입.
3. 미들웨어(.NET) 통신 모듈을 점진적으로 전환.
4. 셸 상태 경계, 렌더 실패 fallback, UI 로그 경계를 실제 코드와 검사로 잠근다.

**현재 진행 메모 (Phase 5)**
- `apps/desktop` 기존 Tauri v2 + Vite + React + TypeScript 스캐폴드를 유지하고, 화면별 React/TS 전환을 완료했다.
- `ShellErrorBoundary`는 전체 React 렌더 실패 시 화이트 스크린 대신 fallback, 컴포넌트 스택, `다시 시도` 복구 버튼을 표시하고 Zustand 로그 store에 오류를 기록한다.
- `App.tsx`의 카드 단위 `CardBoundary`도 카드별 렌더 실패를 컴포넌트 스택과 함께 기록하고 `다시 렌더` 버튼으로 해당 카드만 복구할 수 있게 했다.
- `shell-store.ts`는 UI 로그 schema version, source, componentStack을 포함해 localStorage에 보존하고, 화면에서 `로그 내보내기`/`로그 비우기`를 제공한다. SQLite `ui_logs` 영속화는 후속 상태 DB 마이그레이션 범위로 유지한다.
- `use-middleware-session.ts`는 데스크톱 React가 미들웨어 WebSocket 세션 브릿지를 열고 auth/ops 초입 메시지를 처리한 뒤, `desktop-message-gateway.ts`를 통해 Ask/Explore/Settings/Automate page store로 서버 메시지를 배포한다.
- `desktop-message-gateway.ts`는 허용 요청 allow-list와 payload 번역만 맡는다. React page는 URL/action 같은 UI 입력만 넘기고, 미들웨어 필드명(`webFetchUrl` 등)은 gateway가 변환한다.
- `App.tsx`는 page registry/라우팅만 담당한다. Ask, Explore, Automate, Settings, Operations, Shell 화면은 각 feature 디렉터리의 Page + page-level store가 소유한다.
- Ask는 대화 목록/검색/본문/전송/이름 변경/삭제/메모리 저장과 메모리 노트 요약을 React로 표시한다.
- Explore는 웹 검색, URL fetch 결과, 세션 목록/이력, browser/canvas action 결과를 React로 표시한다.
- Settings는 메모리 노트 목록/읽기/검색/이름 변경/삭제/비우기, portable backup export/import preview/apply, export package 다운로드를 React로 표시한다.
- Automate는 루틴 목록/선택 상세/실행/삭제를 React로 표시한다.
- Operations는 OTP 요청/입력/인증, 인증 토큰 resume, 최근 Doctor 보고서, `plan_list`, `task_graph_list` 조회를 read-only 운영 패널로 유지한다. `doctor_fix_apply`, `cleanup_apply`, `task_retry` 같은 위험한 운영 mutation은 별도 apply UX가 생기기 전까지 desktop Phase 5에서 금지한다.
- `scripts/check-desktop-shell-boundary-contract.mjs`는 desktop shell 복구/로그/인증/auth gate/WS gateway/page-level store/컴포넌트 소유권/God Object 500줄 상한/WebSocket 직접 생성 금지/raw request 금지 경계를 439개 assertion으로 고정했다.
- 현재 검증: `apps/desktop npm run build`, `node scripts/check-desktop-shell-boundary-contract.mjs`, `node scripts/check-security-boundaries.mjs`, `npm test`, `git diff --check`, Browser Shell/Explore/Settings/Automate/Operations 렌더 및 인증 전 버튼 gate 확인까지 통과했다.

- ⚠️ **잔여(무거운 View 로직 미이식)**: 현재 데스크톱 페이지들은 미들웨어 WS store를 구동하는 *얇은 골격*이다. 대시보드의 진짜 무거운 뷰 로직은 아직 한 줄도 넘어오지 않았다 — `build.js`+`build-page-state.js`(Build 코딩 화면 전체), `dashboard-logic-renderers.js`(3,287줄, logic graph 렌더), `dashboard-markdown.js`(623줄, 마크다운/표/수식 렌더), `routine-create-wizard.js`(루틴 생성 wizard), `dashboard-ops-renderers.js`, `dashboard-sidebar-renderers.js`, 그리고 Home/Projects/Activity 화면. 이식 순서는 사용 빈도/영향 큰 것부터: **① Ask 마크다운 렌더링 ✅(완료)** → ② routine 생성 wizard → ③ Build 화면(logic graph 포함). "화면 골격을 깔았다"와 "UI를 마이그레이션했다"는 다르며, 후자가 Phase 5의 본체다.
- **① 완료**: `dashboard-markdown.js`(623줄)의 마크다운/표/코드/링크 렌더를 데스크톱으로 이식했다. `apps/desktop`에 `markdown-it`+`dompurify`를 추가하고 `src/features/ask/markdown.ts`의 `renderMarkdownToSafeHtml`(html=false + DOMPurify sanitize, 링크 새 탭/noopener)을 만들어 `AskPage`의 AI 버블을 plain text → 안전 HTML 렌더로 전환(`MessageBubble` + `App.css` 마크다운 스타일). markdown-it 변환(H1/bold/code/링크/리스트/표/코드블록) node 검증 + `npm run build`(tsc+vite, 140 모듈) + 데스크톱 dist 무에러 로드 확인. 실제 렌더된 메시지 육안 확인은 미들웨어 띄운 수동 QA로 분리.

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
