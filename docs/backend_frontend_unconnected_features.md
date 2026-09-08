# 백엔드 구현 대비 프론트 미연결 기능 목록

기준일: 2026-06-04

확인한 문서:

- `backend_feature_frontend.md`
- `backend_hidden_features.md`
- `backend-feature-candidates.md`

확인한 코드:

- 백엔드 WS 디스패처: `apps/omnux-middleware/src/Ws*CommandDispatcher.cs`, `WebSocketGateway.SocketLoop.cs`
- 현재 앱 WS 게이트웨이: `apps/desktop/src/features/middleware/*-gateway.ts`, `desktop-message-gateway.ts`
- 현재 앱 페이지: `apps/desktop/src/features`

## 개발 진행 현황

- 완료: `cleanup_preview/apply`, `command`, `get_metrics`, `get_setup_state`, `context_scan`, `commands_list`, `read_workspace_file`, sync/cloud backup, `cron` status/list/run, `nodes` status/pending/approve/reject/invoke, `telegram_stub_command`, `logic_path_list`, `plan_update`, `task_retry`, `task_resume`, Settings memory search/index/detail, Ask/Build RAG `memory_get` 원문 미리보기, Ask/Build/Logic 공통 문맥 picker, Notebook 빠른 기록 가져오기, `refactor_preview` anchor UI, Operations guard retry timeline read-only, Operations guard alert dispatch 설정/테스트, OTP, Build preview/live server 계열.
- 남음: Ask RAG 후보의 session replay 직접 실행, Telegram STT/alias/outbox, terminal PTY, MCP lifecycle/tool call, git rollback/worktree remove, Doctor apply.
- 우선순위: P0 read-only/preview 계열은 `refactor_preview`, `memory_get`, workspace 파일 브라우저, Ask/Build/Logic 공통 문맥 picker, guard retry timeline까지 연결됐고, preview/apply 승인 UX와 Settings 전역 권한 정책, Automate 루틴별 권한 세그먼트도 1차 반영됐다. 다음 P0 후보는 Automate file-change trigger 계약 확인이다. P2는 terminal/MCP/git rollback/worktree remove/doctor apply처럼 추가 rollback/실행 로그 정책 없이는 연결하지 않는다.

## 1. 백엔드 요청 타입 기준 미연결 목록

아래 요청 타입은 백엔드에서 구현되어 있으나 현재 데스크톱 앱 프론트에서 등록/전송 UI를 찾지 못했다.

동적 요청 타입 보정:

- `llm_chat_single`, `llm_chat_orchestration`, `llm_chat_multi`는 현재 Ask에서 모드에 따라 전송된다.
- `coding_run_single`, `coding_run_orchestration`, `coding_run_multi`는 현재 Build에서 모드에 따라 전송된다.
- 따라서 위 6개는 미연결로 보지 않는다.

| 요청 타입 | 백엔드 근거 | 현재 상태 | 프론트 작업 |
|---|---|---|---|
| `cleanup_preview` | `WsToolCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > Cleanup`에서 후보/총 크기/previewId를 조회한다. |
| `cleanup_apply` | `WsToolCommandDispatcher.cs` | 연결됨/위험 | Operations `운영 도구 > Cleanup`에서 previewId 확인 후 커스텀 확인 모달을 거쳐 apply한다. 제외 목록/undo는 없음. |
| `command` | `WsAiCommandDispatcher.cs` | 연결됨/주의 | Operations `운영 도구 > 자연어 명령 콘솔`에서 자연어 또는 slash 명령을 백엔드 command 라우터로 전송하고 결과/최근 실행을 표시한다. 삭제·reset·kill·apply 등 위험 키워드는 실행 전 확인 모달을 거친다. |
| `get_metrics` | `WsAiCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > 문맥 · 파일`에서 metrics를 수동 조회하고 raw preview로 표시한다. |
| `get_setup_state` | `WsSetupCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > 문맥 · 파일`에서 setup 상태를 read-only로 조회한다. |
| `context_scan` | `WsContextCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > 문맥 · 파일`에서 instruction sources/skills/commands 카운트와 목록을 조회한다. |
| `commands_list` | `WsContextCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > 문맥 · 파일`에서 command template 목록을 조회한다. |
| `read_workspace_file` | `WsConversationMemoryDispatcher.cs` | 연결됨/주의 | Operations `운영 도구 > 문맥 · 파일`에서 workspace 브라우저/검색 후보를 고른 뒤 preview로 읽는다. 직접 경로 입력도 유지한다. 전체 워크스페이스 인덱스 검색이 아니라 현재 폴더·문맥·명령·최근 preview 후보 필터다. |
| `sync_config_read` | `WsConversationMemoryDispatcher.cs` | 연결됨 | Settings `클라우드 동기화` 카드에서 Gist ID/token set 여부/last sync 조회. |
| `sync_config_write` | `WsConversationMemoryDispatcher.cs` | 연결됨/주의 | Settings에서 Gist ID 저장, token 저장/삭제를 분리해 처리. secret 입력은 password field와 set 여부 표시만 사용. |
| `cloud_sync_upload` | `WsConversationMemoryDispatcher.cs` | 연결됨/주의 | Settings에서 현재 백업 include scope를 Gist 업로드에 사용. |
| `cloud_sync_download` | `WsConversationMemoryDispatcher.cs` | 연결됨/주의 | Settings에서 Gist 다운로드 후 `backup_import_preview` 결과로 연결. 실제 apply는 기존 백업 적용 버튼과 분리. |
| `cron` | `WsToolCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > Cron`에서 status/list/run에 더해 add(생성 폼)/update(enable·disable 토글)/remove(권한 모달)/runs(실행 기록 패널)/wake(스케줄러 깨우기)를 연결했다. |
| `nodes` | `WsToolCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > Nodes`에서 status/pending/approve/reject/invoke에 더해 describe(선택 node 상세)/notify(title·body·priority·delivery 알림 폼)를 연결했다. |
| `telegram_stub_command` | `WsToolCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > Telegram Stub`에서 stub 명령 입력/전송/결과 요약을 제공한다. |
| `logic_path_list` | `WsLogicCommandDispatcher.cs` | 연결됨 | Operations `운영 도구 > 문맥 · 파일`과 Logic 속성 `경로` 탭에서 workspace/memory logic path browser를 read-only로 조회한다. |
| `plan_update` | `WsPlanningCommandDispatcher.cs` | 연결됨/주의 | Planning에서 승인 전 계획 title/objective/constraints를 수정한다. 저장 시 리뷰/실행 기록이 무효화됨을 확인 모달로 안내한다. |
| `task_graph_update` | `WsTaskCommandDispatcher.cs` | 연결됨 | Planning 태스크 그래프 `구조 편집`에서 노드 제목/분류(category)/지시(prompt)/선행작업(dependsOn)/스킬·도구를 편집하고 노드 추가·삭제 후 전체 nodes payload로 저장한다. 저장 시 실행 기록 초기화를 확인 모달로 안내한다. |
| `task_retry` | `WsTaskCommandDispatcher.cs` | 연결됨 | Planning 태스크 노드에서 재시도 버튼을 제공한다. |
| `task_resume` | `WsTaskCommandDispatcher.cs` | 연결됨 | Planning 태스크 그래프 상세에서 재개 버튼을 제공한다. |
| `doctor_fix_apply` | `WsDoctorCommandDispatcher.cs` | 의도적 보류 | `ops-gateway.ts`에 위험 명령이라 preview만 연결한다고 명시됨. 연결 시 별도 정책 필요. |
| `ping` | `WebSocketGateway.SocketLoop.cs` | 앱 UI 없음 | transport heartbeat 내부용이면 UI 불필요. 브릿지 진단에는 활용 가능. |

## 2. 등록은 되었지만 화면/함수가 불완전한 요청

| 요청 타입 | 현재 근거 | 상태 | 필요한 작업 |
|---|---|---|---|
| `refactor_preview` | `refactor-gateway.ts`에 등록됨 | 연결됨 | Refactor 페이지와 Build Safe Refactor 도크에서 파일 읽기 결과의 anchor hash를 사용해 start/end line 교체 preview를 생성한다. 적용은 기존 `refactor_apply` previewId 승인 흐름을 탄다. |
| `git_operation_apply` | `git-gateway.ts`, `OperationsPage.tsx` | 연결됨 | 현재 preview/apply 승인 게이트가 있다. 추가 작업은 LLM 커밋 메시지/PR body 자동 생성 같은 후보 기능이다. |
| `memory_get` | `memory-gateway.ts` | 연결됨 | Settings memory search 상세 열기와 Ask/Build RAG memory_search 후보의 원문 미리보기가 연결됐다. Ask/Build/Logic 공통 문맥 picker가 memory search/detail, workspace preview, path browser를 재사용한다. |
| `session_replay_get` | `rag-gateway.ts`, `SessionReplayPanel.tsx` | 연결됨 | Activity 안에 있음. Ask RAG 후보에서 바로 session replay 실행까지 자동 연결되지는 않는다. |

## 3. 문서 기준 구현됐지만 프론트가 읽기 전용/부분 연결인 항목

`backend_feature_frontend.md`와 `backend-feature-candidates.md` 기준.

| 기능 | 백엔드 상태 | 현재 프론트 상태 | 남은 연결 |
|---|---|---|---|
| Local LLM 실제 라우팅 / 오프라인 모드 | readiness 1차+ | `Insights`, `Routing`에서 snapshot/readiness 표시 | 실제 provider 선택 정책, offline enforcement, cloud 차단 토글은 미연결/보류. |
| Self-RAG 실행 오케스트레이터 | preflight 1차 | Ask/Build에서 `rag_retrieval_preflight` 표시 | memory/code/session/web 검색 자동 실행 plan, 결과 pack, 프롬프트 주입은 미연결/보류. |
| Terminal PTY 실행 | capability snapshot 1차 | `Insights`에서 `terminal_capabilities_get` 표시 | preview/store/start/stop/send 기반 PTY 실행 UI는 미구현. |
| MCP process/JSON-RPC/tool registry | discovery/readiness 1차+ | `Insights`에서 `mcp_servers_list` 표시 | MCP 서버 start/stop, initialize/tools list, tool call UI는 미연결/보류. |
| Tree-sitter 본도입/vector DB | heuristic/readiness 1차 | `Insights`의 repomap/semantic readiness | 실제 tree-sitter parser, embedding 생성, vector search/rerank UI는 미연결/보류. |
| Durable Workflow auto resume | recovery list 1차 | Logic recovery 후보 표시 | run resume/retry 정책과 버튼은 없음. 백엔드도 자동 resume은 보류. |
| Git rollback/time machine | read-only snapshot 1차 | `Insights`에서 snapshot 표시 | rollback checkpoint, reset/clean, snapshot branch/GC 실행 UI는 보류. |
| Worktree cleanup/remove | inventory 1차 | `Agents`에서 worktree snapshot 표시 | worktree_remove/cleanup/prune 실행 UI는 보류. |
| 자동 커밋/PR 생성 | 승인 게이트 3차 | `Operations`에서 Git preview/apply 연결 | 코딩 완료 hook 자동 호출, LLM 커밋 메시지/PR body 생성은 미연결. |
| Commit learning | snapshot 1차 | `Insights` 연결 | memory note/skill/system prompt 자동 주입은 없음. |
| Self improvement | snapshot 1차 | `Insights` 연결 | nightly 자동 적용/issue 생성/PR 생성은 없음. |
| Clipboard Vision | preflight 1차 | Ask `AskVisionPanel` 연결 | OS clipboard watcher, vision LLM 직접 호출, scaffold execution, canvas 반복 비교는 미연결/보류. |

## 4. `backend_hidden_features.md` 항목별 프론트 연결 상태

| 번호 | 기능 | 현재 프론트 상태 | 판정 |
|---|---|---|---|
| 1 | 멀티 에이전트 스폰/큐/비용/롤백 | Explore/Agents에서 sessions status, watchdog, worktree 일부 표시 | 부분 연결. queue 상세, cost ledger, rollback 실행 UI 없음. |
| 2 | Copilot/Codex CLI wrapper/device auth/usage | Settings 모델·키/CLI 인증/사용량 연결 | 부분 연결. device auth 세부 스트림/월별 과금 추적 상세 UI는 제한적. |
| 3 | Universal Code Runner | Build 결과 실행/재실행 연결 | 부분 연결. 언어별 runner capability matrix와 독립 실행 콘솔 없음. |
| 4 | Local FTS Memory Index | Settings memory search/index rebuild 연결 | 연결됨. semantic/vector 실행은 보류. |
| 5 | Auto-Skill Directive/SkillFileService | Skills 페이지 연결 | 연결됨. directive 생성은 대화 후처리 내부 기능. |
| 6 | Notebook & Handoff | Notebooks 페이지 연결 | 부분 연결. projectKey, 검색, 템플릿, 체크리스트, 전체 보기 모달은 연결됐다. 빠른 기록 가져오기는 Planning/Doctor/Refactor 현재 store 기반 초안 가져오기로 연결됐다. 공통 문맥 picker는 별도다. |
| 7 | Canvas Tool | Explore canvas 연결 | 부분 연결. A2UI push/reset과 snapshot 결과 시각화는 제한적. |
| 8 | Telegram STT | 설정/루틴 Telegram만 연결 | 미연결. 음성 메시지 STT 상태/로그 UI 없음. |
| 9 | Visual Node Logic Graphs | Logic 비주얼 에디터 연결 | 연결됨. 노드 팔레트(31종)/드래그 캔버스/노드 리사이즈/포트 연결/인스펙터/엣지 조건/그래프 설정/클라이언트 검증, Logic 내장 path browser, 노드별 run I/O 상세 패널까지 연결됐다. |
| 10 | Think+ 및 검색 파이프라인 | Ask Think+, web/RAG 일부 연결 | 부분 연결. evidence guard timeline/인용 무결성 디버그 UI 없음. |
| 11 | Browser intent/NLP | Explore browser, 루틴 browser_agent 일부 연결 | 부분 연결. 자연어 브라우저 intent 변환/실행 trace UI 없음. |
| 12 | Advanced Refactoring | Refactor/Build dock 연결 | 부분 연결. anchor `refactor_preview`, `ast_replace`, `lsp_rename`, `refactor_apply`는 연결됐다. 다중 anchor edit/구조적 route 추천은 없다. |
| 13 | AI Orchestration/LLM router | Ask/Build 모드와 Routing/Insights 연결 | 부분 연결. Insights `Provider route metrics`에서 telemetry events 기반 provider/model/source별 호출·토큰·지연·cascade/cache/signal을 표시한다. router decision live trace는 아직 제한적이다. |
| 14 | Planning & Tasks | Planning 연결 | 연결됨. `plan_update`, `task_retry`, `task_resume`, `task_graph_update`(노드 구조 편집), 리뷰 상세(findings/risks/missing verification)/단계/결정 로그/실행 요약까지 연결됐다. |
| 15 | Scheduler/Doctor auto fix | Automate/Operations 연결 | 부분 연결. `cron` status/list/run/runs/wake/add/update/remove는 Operations에 연결됐다. `doctor_fix_apply`는 위험 명령으로 보류. |
| 16 | Gist/cloud sync/maintenance | Settings backup + Cloud Sync 연결 | 부분 연결. `backup_export_prepare`, `backup_import_preview/apply`, `sync_config_read/write`, `cloud_sync_upload/download`는 연결됐다. cleanup preview/apply도 Operations에 연결됐다. |
| 17 | Security guards/keychain/kill guard | 일부 에러/Settings key 저장 | 부분 연결. Guard Alert dispatch 설정/테스트는 Operations에 연결됐다. kill request/keychain mode 상세 UI는 없음. |
| 18 | ACP session binding | Agents/Insights 일부 | 부분 연결. ACP binding 상세/adapter command UI 없음. |
| 19 | Streaming continuation | 내부 응답 품질 기능 | 별도 UI 없음. 연결 대상이라기보다 메시지 결과에 반영되는 내부 기능. |
| 20 | Output sanitizer | 내부 응답 정제 | 별도 UI 없음. 연결 대상이라기보다 출력 전 처리. |
| 21 | Deterministic auto-repair | Build 결과에 일부 반영 가능 | 부분 연결. Insights `Repair / quality timeline`에서 최근 Build 결과와 telemetry 실패 후보를 합쳐 `deterministic_repair`, `[repair-pass]`, `[quality-gate]`, retry/citation validation 마커를 표시한다. repair 전용 백엔드 event store 계약은 아직 없다. |
| 22 | CleanupService | 백엔드 요청 있음 | 연결됨/주의. Operations에서 preview/apply를 연결했지만 제외 목록/undo는 없다. |
| 23 | Coding quality gate/auto verification | Build evidence/safety 일부 | 부분 연결. Build evidence와 Insights repair/quality timeline에서 quality gate/citation 실패 마커를 표시한다. 품질 점수/언어별 검증 matrix 전체 UI는 아직 없다. |
| 24 | Execution safety guard | Build blocked/error 표시 가능 | 부분 연결. safety policy reason 전용 대시보드 없음. |
| 25 | Context inertia retry guard | 내부 채팅 품질 기능 | 별도 UI 없음. retry 발생 timeline/표시 없음. |
| 26 | Telegram OTP Auth | Settings OTP 연결 | 연결됨. |
| 27 | Computer Use Agent | Automate browser_agent tool profile | 부분 연결. desktop_control 권한/스크린샷/마우스 trace UI 없음. |
| 28 | Telegram Skill Alias | Skills/Telegram 설정과 분리 | 미연결. quick alias list/add/remove UI 없음. |
| 29 | NVIDIA NIM long-polling | 모델 선택/실행 결과 일부 | 부분 연결. requestId polling 상태 UI 없음. |
| 30 | Guard Alert Dispatcher | 백엔드 있음 | 연결됨. Operations에서 백엔드 환경변수 계약(`OMNUX_GUARD_ALERT_WEBHOOK_URL`, `OMNUX_GUARD_ALERT_LOG_COLLECTOR_URL`, timeout/max attempts)을 표시하고, `guard_alert_event.v1` 샘플 편집·검증·수동 `dispatch_guard_alert` 테스트·target별 결과 표시를 제공한다. |
| 31 | Coding Preview Live Server | Build iframe preview 연결 | 연결됨. |
| 32 | One-Shot UI Clone Mode | Build 결과로 간접 반영 | 부분 연결. one-shot profile 선택/표시 UI 없음. |
| 33 | LLM Coding Persona Profiles | Build provider/model 일부 | 부분 연결. persona/profile decision trace UI 없음. |
| 34 | Telegram Offline Outbox Queue | 루틴 run Telegram 상태 일부 | 부분 연결. outbox queue list/retry UI 없음. |
| 35 | Guard Retry Timeline Store | 백엔드 있음 | 연결됨. Operations `Guard Retry Timeline` 카드에서 chat/coding/telegram 채널별 60분 bucket snapshot을 read-only로 조회한다. |
| 36 | Project Workspace Manager | Projects 연결 | 연결됨. |
| 37 | Telegram Mobile Response Formatter | 내부 Telegram 출력 기능 | 별도 UI 없음. handoff marker/모바일 포맷 로그 UI 없음. |
| 38 | Telegram context follow-up | 내부 Telegram 대화 기능 | 별도 UI 없음. follow-up correction trace UI 없음. |
| 39 | Python sandbox resource limit | 샌드박스/Build 결과로 간접 반영 | 부분 연결. Insights `Sandbox / 품질 readiness`에서 Doctor `sandbox` check와 executor 기본 제한(timeout 10s, memory 200MB, CPU 10s)을 표시한다. 실행별 실제 RSS/CPU 사용량 WS 계약은 아직 없다. |
| 40 | WebSocket Gateway | 앱 브릿지 전반 | 연결됨. 단, `ping`/rate-limit/dispatcher health 상세 UI는 제한적. |

## 5. 의도적 보류 또는 정책 필요한 항목

아래 항목은 단순 누락으로 바로 연결하면 위험하다. `preview → approval → apply` 또는 별도 권한 정책이 먼저 필요하다.

| 항목 | 보류 사유 | 최소 프론트 조건 |
|---|---|---|
| `doctor_fix_apply` | 환경 수정 명령 | previewId, planned fixes, 명시 승인, 실행 로그, rollback 안내. |
| `cleanup_apply` | 파일 삭제/정리 | Operations에 previewId + 확인 모달은 연결됨. 제외 목록, 승인 토큰, undo 불가 경고 세분화는 추가 필요. |
| worktree remove/prune | 작업 디렉터리 삭제 가능 | inventory, changed files, ownership, explicit confirmation. |
| git rollback/reset/clean | 파괴적 git 변경 | clean/dirty 상태, checkpoint risk, confirmation token, recovery path. |
| Terminal PTY 실행 | 임의 명령 실행 | command preview, allowlist/denylist, timeout/log cap, session stop. |
| MCP process/tool call | 서드파티 프로세스 실행 | config audit, env redaction, process lifecycle, per-tool approval. |
| Self-RAG 자동 prompt injection | 품질/비용/출처 위험 | 사용자 opt-in, retrieved context preview, source filtering. |
| Local LLM offline enforcement | provider routing 전역 변경 | routing policy preview, cloud fallback 차단 상태, per-request override. |

## 6. 프론트 작업 묶음

1. **운영 도구 통합**
   - 연결됨: `cleanup_preview/apply`, `cron` status/list/run/runs/wake/add/update/remove, `nodes` status/pending/approve/reject/invoke/describe/notify, `telegram_stub_command`, `dispatch_guard_alert`.
   - 우선순위: 완료된 항목은 guard retry timeline read-only 표시, guard alert dispatch 설정/테스트, cron 전체 생명주기·nodes describe/notify다. 남은 P1은 cron 통합 실행 히스토리·split test다.

2. **로직 에디터**
   - 연결됨: 비주얼 에디터(노드 팔레트 31종, 드래그 캔버스, 노드 리사이즈, 포트 연결, inspector, 엣지 조건, 그래프 설정, 클라이언트 검증), `logic_path_list` read-only browser(Operations/Logic), 노드별 run I/O 상세.
   - 우선순위: 현재 핵심 Logic 보강 항목 완료. 위험 실행형 노드 정책은 보류군에 유지한다.

3. **계획/태스크**
   - 연결됨: `plan_update`, `task_retry`, `task_resume`, `task_graph_update`(노드 구조 편집), 리뷰 상세/단계/결정 로그/실행 요약.
   - 남은 것: 노드별 LLM provider/model chain(백엔드 task 모델에 필드 없음), 태스크 그래프 전용 체크리스트.

4. **문맥/명령**
   - 연결됨: `command`, `context_scan`, `commands_list`, instruction sources/command template read-only table.
   - 우선순위: 완료된 항목은 Ask/Build RAG 결과의 `memory_get` 원문 미리보기, Operations 자연어 명령 콘솔, Ask/Build/Logic 공통 문맥 picker다.

5. **동기화/워크스페이스 파일**
   - 연결됨: `get_setup_state`, `read_workspace_file` read-only preview, workspace 현재 폴더 브라우저/검색 후보 필터.
   - 우선순위: 완료된 항목은 Operations workspace 파일 브라우저/검색과 Ask/Build/Logic 공통 문맥 picker의 workspace preview handoff다.

6. **정책 보류 실행형**
   - `doctor_fix_apply`, terminal PTY, MCP process/tool call, git rollback/worktree remove.
   - `cleanup_apply`는 Operations에 연결됐지만 제외 목록/undo/세부 승인 정책은 보강 필요.
   - 우선순위: P2로 유지. 전역 권한 정책은 Settings에 1차 저장되지만, 승인 토큰 검증, 실행 로그, rollback 안내가 먼저 필요하다.

7. **관측/품질**
   - 연결됨: `get_metrics` 수동 조회, Operations guard retry timeline read-only 카드, Insights sandbox limit readiness, provider route metrics, Build/telemetry 파생 repair/quality timeline.
   - 우선순위: P1은 실행별 sandbox resource usage telemetry와 repair event 전용 백엔드 store 계약이다.
