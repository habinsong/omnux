# 데스크톱 프론트엔드 작업 로그

최종 업데이트: 2026-06-04

## 목표

- `apps/desktop` Tauri + React + TypeScript 프론트엔드에서 백엔드로만 구현된 기능을 사용자가 실제로 조작할 수 있게 연결한다.
- `UIUX_design.md`의 Tailwind 기반 B2B SaaS UI/UX 기준을 우선 적용한다.
- 레거시 대시보드(`backup(omni-node)/Omni-node-master/apps/omninode-dashboard`)의 탭 내부 기능까지 데스크톱 화면으로 점진 이관한다.

## 작업 기준

- 모든 `.ts`/`.tsx` 파일은 500줄 이하를 유지한다.
- `window.alert/confirm/prompt`, `dangerouslySetInnerHTML`, 인라인 스타일을 쓰지 않는다.
- 실행형 기능은 `snapshot/readiness -> preview -> apply` 구조로 연결하고, destructive 성격은 앱 내부 확인 UI를 거친다.
- 도메인별 WebSocket gateway는 `apps/desktop/src/features/middleware/*-gateway.ts`에 둔다.
- 검증은 `cd apps/desktop && npm run build`와 `node scripts/check-desktop-shell-boundary-contract.mjs`를 기본으로 한다.

## 참조 정본

- `UIUX_design.md`: 디자인/반응형/금지 패턴 기준.
- `backend_feature_frontend.md`: 프론트 연결 가능한 백엔드 계약과 unlock/policy 판단.
- `backend-feature-candidates.md`: 백엔드 구현 현황과 다음 연결 우선순위.
- `backend_hidden_features.md`: 아직 UI에 충분히 노출되지 않은 백엔드 기능 목록.
- `backup(omni-node)/Omni-node-master/apps/omninode-dashboard`: 옛 대시보드 기능과 화면 구조 기준.

## 2026-06-04 진행

### Git operation 승인 게이트

- 운영 화면에 `Git automation` 패널을 추가했다.
- `git_automation_snapshot_get`으로 branch, 변경 파일 수, staged/unstaged/untracked/conflict, readiness/publish 상태를 표시한다.
- `git_operation_preview`로 `create_branch`, `stage_and_commit`, `snapshot_commit`, `push_current_branch`, `open_pull_request` 미리보기를 요청한다.
- `git_operation_apply`는 preview 성공, blocker 없음, confirmation token 존재, 앱 내부 확인 통과 후에만 실행되도록 연결했다.
- 신규 gateway는 `apps/desktop/src/features/middleware/git-gateway.ts`로 분리해 core gateway 줄 수 증가를 막았다.

### 검증 상태

- `npm run build`: 통과. Vite chunk size 경고만 남음.
- `node scripts/check-desktop-shell-boundary-contract.mjs`: 통과.
- 브라우저 QA: 운영 화면에서 `Git automation`, `Preview`, `대상 파일` 렌더링과 콘솔 오류 없음 확인.

### Local LLM readiness 상세화

- 인사이트 화면의 `로컬 LLM (Ollama / LM Studio)` 패널이 `local_llm_snapshot_get` 상세 응답을 표시하도록 확장했다.
- endpoint별 latency/error, 발견 모델 목록, 모델 family/parameter/quantization/size를 표시한다.
- `offlineMode.status`, 요청 env var, cloud credential env var 이름, 오프라인 readiness check를 배지와 행으로 표시한다.
- 실제 provider 라우팅, cloud 차단, 모델 warmup은 백엔드 정책상 보류 상태라 UI에서 실행 버튼으로 노출하지 않는다.

### Self-RAG preflight 후보 명시 조회

- Ask 화면의 RAG preflight 후보에 `조회` 액션을 추가했다.
- `memory_search`, `web_search`, `code_repomap_snapshot_get`, `session_replay_get` 후보를 사용자가 명시적으로 실행할 수 있게 했다.
- 조회 결과는 같은 Ask 화면 안에서 제목, 설명, 상태 배지로 요약한다.
- 자동 검색 실행이나 retrieved context 프롬프트 주입은 하지 않는다.

### Terminal readiness 상세화

- 인사이트 화면의 `터미널 / 툴체인 readiness` 패널이 `terminal_capabilities_get` 상세 응답을 표시하도록 확장했다.
- shell/toolchain resolved path, backend message, readiness checks, scan time을 표시한다.
- `ptySessionEnabled=false` 상태에서는 시작/입력/중단 컨트롤을 비활성으로 보여준다.
- 실제 PTY 세션 생성, stdin/stdout 스트리밍, 자동 repair loop는 백엔드 정책상 보류 상태라 실행하지 않는다.

### MCP readiness 상세화

- 인사이트 화면의 `MCP 서버` 패널이 `mcp_servers_list` 상세 응답을 표시하도록 확장했다.
- config 후보 파일, 발견 서버 수, discovery error, scanned time을 표시한다.
- 서버별 transport, command/url, args preview, working directory, env key 이름, readiness check를 표시한다.
- MCP process start, JSON-RPC handshake, tool registry 주입은 백엔드 정책상 보류 상태라 비활성 컨트롤로만 표시한다.

### Ask RAG store 분리

- `ask-store.ts`의 RAG 타입과 응답 정규화 로직을 `ask-rag.ts`로 분리했다.
- `ask-store.ts`를 479줄에서 380줄로 줄여 500줄 계약 여유를 확보했다.
- `AskPage`의 `row-actions`와 `MarkdownMessage` 마커는 유지했다.

### Insights panel 분리

- `InsightsPage.tsx`에 몰려 있던 패널 JSX와 공용 `Stat`/`Row`/`Empty` 렌더러를 `InsightsPanels.tsx`로 분리했다.
- `InsightsPage.tsx`는 페이지 헤더, 새로고침 액션, `CardBoundary` 배치만 담당하도록 줄였다.
- 스냅샷 타입은 `insights-store.ts`에서 export해 패널 props가 store 계약을 그대로 따르게 했다.
- 줄 수 기준: `InsightsPage.tsx` 86줄, `InsightsPanels.tsx` 392줄, `insights-store.ts` 371줄.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과.

### Clipboard Vision preflight 연결

- Ask 화면에 이미지 선택과 `Vision 점검` 액션을 추가했다.
- `clipboard_vision_preflight`는 신규 `vision-gateway.ts`에서 등록하고, Ask store는 `clipboard_vision_preflight_result`를 받아 readiness 카드로 표시한다.
- 이미지 파일 변환과 응답 정규화는 `ask-vision.ts`, 결과 카드는 `AskVisionPanel.tsx`로 분리해 `AskPage.tsx`를 363줄로 유지했다.
- UI는 provider 후보, image payload 상태, skipped checks, warning, suggested prompt를 raw JSON 없이 표시한다.
- 실제 Vision API 호출, 클립보드 감시, 코드 스캐폴딩, Canvas push는 백엔드 정책상 보류라 실행하지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과, Ask 화면 브라우저 QA에서 `이미지`/`Vision 점검` 버튼 렌더링과 콘솔 오류 없음 확인.

### Agent bus 수동 기록 연결

- 에이전트 화면에 `버스 기록` 폼을 추가했다.
- `agents-gateway.ts`에 `agent_message_post`, `agent_board_put`을 등록하고, 메시지 기록/공유 보드 upsert 요청을 보낼 수 있게 했다.
- `agents-store.ts`는 쓰기 응답의 `snapshot`을 즉시 에이전트 버스 카드에 반영하고, 성공 시 trace projection만 후속 조회한다.
- UI는 message와 board 입력을 같은 카드 안의 2열 작업면으로 배치했고, raw JSON이나 네이티브 팝업은 쓰지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과, Agents 화면 브라우저 QA에서 `버스 기록` 폼 렌더링과 콘솔 오류 없음 확인.

### Agent lifecycle / command 기록 연결

- `agents-gateway.ts`에 `agent_lifecycle_emit`, `agent_group_command`을 등록했다.
- 에이전트 `버스 기록` 폼에 lifecycle event 저장과 group/run command 메시지 저장 입력을 추가했다.
- `agent_group_command`는 백엔드 정책상 실제 프로세스 중단이 아니라 `kind=command` 메시지 저장이지만, 앱 내부 확인 모달을 거친 뒤에만 전송한다.
- `agents-store.ts`는 `agent_lifecycle_result`, `agent_group_command_result`의 snapshot도 기존 버스 카드에 반영한다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과, Agents 화면 브라우저 QA에서 lifecycle/command 폼 렌더링과 콘솔 오류 없음 확인.

### Routing policy 결정 요약 / Local LLM readiness 보강

- 라우팅 정책 화면의 `최근 라우팅 결정` raw JSON 표시를 제거하고, 카테고리/요청 provider/결과 provider/결정 시각/사유/체인을 카드와 배지로 표시한다.
- `routing_policy_result`의 `snapshot.lastDecision`과 `routing_decision_result`를 `RoutingDecision` 타입으로 정규화해 같은 패널에서 재사용한다.
- 라우팅 화면 사이드 패널에 `local_llm_snapshot_get` readiness를 연결해 endpoint 수, 모델 수, 오프라인 모드 상태, readiness check를 표시한다.
- 이 패널은 discovery/readiness 전용이며 실제 provider 자동 전환, cloud 차단, 모델 warmup은 백엔드 정책상 실행하지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과, 줄 수 상위 파일이 모두 500줄 이하임을 확인했다.
- 브라우저 QA: `http://127.0.0.1:1420/` 라우팅 화면에서 `최근 라우팅 결정`과 `로컬 LLM readiness` 패널 렌더링, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-routing-policy-local-llm-qa.png` 확인.

### Activity 세션 리플레이 패널 연결

- Activity 화면에 `session_replay_get` 전용 패널을 추가했다.
- conversation/run/agent/group 중 하나를 입력해 대화 메시지, LLM telemetry, agent event 타임라인을 명시 조회할 수 있다.
- `includeText`, `includeTelemetry`, `includeAgentEvents`, `limit` 옵션을 UI에서 조절하되, 원문 전체나 raw JSON은 덤프하지 않고 summary/body preview와 배지형 metadata로 표시한다.
- `rag-gateway.ts`의 `sessionReplay` 헬퍼를 기존 Ask RAG 호출이 유지되도록 문자열/객체 양쪽을 받는 구조로 확장했다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(913 assertions), 신규 파일 포함 모든 `.ts/.tsx` 500줄 이하 확인.
- 브라우저 QA: `http://127.0.0.1:1420/` Activity 화면에서 `Session replay` 패널, 입력/토글 UI, disabled 조회 상태, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-activity-session-replay-qa.png` 확인.

### Semantic Search readiness 상세화

- Insights의 `Semantic Search readiness` 패널이 `readOnly`, vector/embedding 실행 가능 여부, local embedding endpoint/model 수를 표시하도록 확장했다.
- 백엔드 응답의 `checks`, `recommendations`, `warnings`, `skipped`를 정규화해 row/badge로 표시한다.
- `임베딩 생성`, `벡터 검색`, `대량 reindex` 컨트롤은 readiness가 켜지기 전까지 비활성으로 표시해 실제 실행 기능이 아님을 명확히 했다.
- 실제 embedding generation, sqlite-vec migration, vector similarity query, semantic rerank는 백엔드 정책상 보류 상태라 호출하지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(913 assertions), `InsightsPanels.tsx` 419줄 / `insights-store.ts` 385줄 확인.
- 브라우저 QA: `http://127.0.0.1:1420/` Insights 화면에서 `Semantic Search readiness` 패널 렌더링, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-insights-semantic-readiness-qa.png` 확인. 미들웨어 오프라인이라 상세 readiness 데이터 수신은 빌드/타입 검증까지만 확인.

### Memory Search tier metadata 표시

- Settings의 메모리 검색 결과가 `memoryTier`, `source`, `startLine/endLine`, `lastAccessedAtUnixMs`를 보존하고 배지로 표시하도록 확장했다.
- `long_term` tier 배지에는 오래된 결과도 score floor 정책으로 유지될 수 있다는 짧은 tooltip을 붙였다.
- Ask 화면의 RAG 후보 명시 조회에서 `memory_search` 결과도 score 외 tier/source/line 배지를 함께 표시한다.
- 기존 `memory_search` 요청 흐름은 그대로 유지하고, 자동 검색 실행이나 프롬프트 주입은 추가하지 않았다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(913 assertions), `SettingsPage.tsx` 284줄 / `settings-store.ts` 418줄 / `AskPage.tsx` 366줄 확인.
- 브라우저 QA: `http://127.0.0.1:1420/` Settings Memory 화면에서 검색 입력/패널 렌더링, Ask 화면 기본 렌더링, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-settings-memory-tier-qa.png` 확인. 미들웨어 오프라인이라 실제 memory search 결과 tier 수신은 빌드/타입 검증까지만 확인.

### Memory index rebuild / result detail 연결

- `memory_get`, `memory_index_rebuild`를 신규 `memory-gateway.ts`에 등록해 메모리 상세 읽기와 FTS 인덱스 재구축을 Settings Memory 탭에서 실행할 수 있게 했다.
- 기존 `read_memory_note`의 `memory_note_content` 응답을 store에서 처리해 노트 클릭 시 본문이 실제로 열리도록 보정했다.
- 검색 결과 카드에는 `열기` 액션을 추가해 `startLine/endLine` 범위를 `memory_get`으로 조회하고, 노트/검색 결과 상세 상태를 배지로 구분한다.
- 인덱스 재구축 결과는 scanned/indexed/removed/FTS/elapsed 배지와 한 줄 메시지로 표시하고 raw JSON은 노출하지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(927 assertions), 모든 `.ts/.tsx` 500줄 이하 확인(`settings-store.ts` 448줄 / `SettingsPage.tsx` 315줄).
- 브라우저 QA: `http://127.0.0.1:1420/` Settings Memory 화면에서 `인덱스` 버튼, 검색 입력, 기존 메모리 액션 렌더링과 검색 입력 상태 변경 확인, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-settings-memory-index-qa.png` 저장. 미들웨어 인증 전 상태라 실제 `memory_get`/`memory_index_rebuild` 응답 수신은 빌드/계약 검증까지만 확인.

### Adaptive Context Compression 표시

- Ask store가 `conversation.messages[].meta/createdUtc/tokenUsage`, `conversation.linkedMemoryNotes`, `conversation.tokenUsageTotal`을 보존하도록 확장했다.
- `meta=auto-compress` 시스템 메시지를 일반 AI 답변처럼 보이지 않게 context system 카드로 표시한다.
- 대화 본문 툴바에 total token pill, linked memory 개수, auto-compress 개수를 표시해 백엔드 압축 정책이 동작한 흔적을 사용자가 볼 수 있게 했다.
- 레거시 대시보드의 token usage pill / linked memory 표시 흐름을 React+Tailwind 구조로 옮겼고, raw JSON은 노출하지 않았다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(934 assertions), 모든 `.ts/.tsx` 500줄 이하 확인(`AskPage.tsx` 406줄 / `ask-store.ts` 402줄).
- 브라우저 QA: `http://127.0.0.1:1420/` Ask 화면에서 기본 렌더링, 채팅 모드 선택 상호작용, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-ask-context-compression-qa.png` 저장. 미들웨어 오프라인이라 실제 `auto-compress` 메시지 수신은 빌드/타입 검증까지만 확인.

### Ask 메시지별 token usage 표시

- Ask 메시지 말풍선에 `tokenUsage.totalTokens`와 `tokenUsage.source` 배지를 표시하도록 연결했다.
- 전체 대화 token pill과 개별 응답 token badge를 분리해, 사용자가 대화 단위와 메시지 단위 비용/추정 출처를 동시에 볼 수 있게 했다.
- `system` context 카드에도 token usage가 있으면 같은 배지를 표시하며, raw JSON이나 원문 프롬프트는 노출하지 않는다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(934 assertions), 모든 `.ts/.tsx` 500줄 이하 확인(`AskPage.tsx` 419줄 / `ask-store.ts` 402줄).
- 브라우저 QA: `http://127.0.0.1:1420/` Ask 화면에서 기본 렌더링, 채팅 모드 선택 상호작용, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-ask-message-token-qa.png` 저장. 미들웨어 오프라인이라 실제 token badge 데이터 수신은 빌드/타입 검증까지만 확인.

### Operations Doctor 진단/복구 연결

- 운영 화면 상단에 `Doctor / 환경 진단` 패널을 추가해 `doctor_get_last`, `doctor_run`, `doctor_fix_preview`를 연결했다.
- 구 대시보드의 Doctor 요약 흐름을 React+Tailwind로 옮겨 ok/warn/fail/skip 카운트, 체크별 상태·상세·제안 액션, fix action 목록을 raw JSON 없이 표시한다.
- `doctor_fix_apply`는 shell boundary 계약에서 Phase 5 운영 위험 명령으로 금지되어 이번 단위에서는 호출하지 않고, Apply 버튼을 보류 상태로 비활성 표시한다.
- 운영 화면 왼쪽에는 `plan_list`, `task_graph_list` read-only 요약 카드를 복원해 Plan/Task Graph 개수와 최근 항목을 바로 볼 수 있게 했다.
- 신규 요청 등록은 `ops-gateway.ts`로 분리해 core gateway 줄 수를 늘리지 않았고, `ops-doctor.ts`/`OperationsDoctorPanel.tsx`로 타입·패널을 분리해 500줄 제한을 유지했다.
- 검증: `npm run build` 통과, 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(955 assertions), 모든 `.ts/.tsx` 500줄 이하 확인(`ops-store.ts` 477줄).
- 브라우저 QA: `http://127.0.0.1:1420/` 운영 화면에서 `Doctor / 환경 진단`, `Plan / Task 상태`, `Doctor fix preview`, `Git automation` 렌더링과 인증 전 버튼 비활성 상태, 콘솔 오류 없음, 스크린샷 `/tmp/omnux-operations-doctor-qa.png` 저장.

### Commit learning / Self improvement 상세 표시

- 인사이트 화면의 `Commit learning` 패널이 `commit_learning_snapshot_get` 응답의 repository/limit/scannedAt, 최근 커밋 목록, intent rollup, hotspot, warning을 보존하고 표시하도록 확장했다.
- 최근 커밋은 subject, author/date, files changed, added/deleted lines, heuristic intent 배지로 표시해 자동 규칙 적용이 아니라 관찰용 판단 자료임을 유지했다.
- `Self improvement 제안` 패널이 `self_improvement_snapshot_get` 응답의 source, targetPath, evidence, requiresApproval, warning을 raw JSON 없이 카드형 제안으로 표시하도록 보강했다.
- 모든 제안은 백엔드 계약대로 read-only/승인 필요 상태만 보여주며, `SKILL.md`, memory note, 시스템 프롬프트, 루틴 생성 같은 apply 동작은 추가하지 않았다.
- `InsightsLearningPanels.tsx`를 새로 분리해 기존 `InsightsPanels.tsx` 줄 수를 줄이고 모든 `.ts/.tsx` 500줄 이하 계약 여유를 유지했다.
- 검증: `npm run build` 통과. Vite chunk size 경고만 남음.
- 계약 검사: 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(962 assertions).
- 브라우저 QA: `http://127.0.0.1:1420/` 인사이트 화면에서 `Commit learning`, `Self improvement 제안` 카드 렌더링과 인증 전 새로고침 disabled 상태, 콘솔 warn/error 없음 확인.

### Git Time Machine readiness 상세 표시

- 인사이트 화면의 `Git 타임머신` 패널이 `git_time_machine_snapshot_get` 응답의 `readiness`, `checks`, `warnings`, `checkpointsTruncated`, `suggestedSnapshotBranch`, checkpoint `riskFlags`를 보존하고 표시하도록 확장했다.
- dirty/conflict/blocker 상태는 변경 파일·충돌·blocker 통계와 배지로 표시하고, `rollbackAvailable=false`이면 rollback은 보류 상태로만 보여준다.
- checkpoint 목록은 author/date/hash, rollback 후보, parent 수, `current_head`/`history_rewrite_required`/`merge_commit` risk flag를 raw JSON 없이 표시한다.
- `rollback_execution`, `git clean -fd`, snapshot GC 같은 보류 작업은 `checks[].status=skipped` 행으로만 노출하고 실행 버튼이나 apply 호출은 추가하지 않았다.
- `insights-store.ts`가 494줄이라 500줄 계약은 통과하지만 여유가 작다. 다음 인사이트 확장 시 타입/정규화 분리를 먼저 해야 한다.
- 검증: `npm run build` 통과. Vite chunk size 경고만 남음.
- 계약 검사: 루트 기준 `node scripts/check-desktop-shell-boundary-contract.mjs` 통과(962 assertions).
- 브라우저 QA: `http://127.0.0.1:1420/` 인사이트 화면 리로드 후 `Git 타임머신`, `Commit learning`, `Self improvement 제안` 카드 렌더링과 인증 전 새로고침 disabled 상태, 콘솔 warn/error 없음 확인.

## 다음 연결 후보

- 다음 연결 후보는 Local LLM 실제 라우팅 readiness, Self-RAG 실행 plan, Terminal PTY 승인 게이트 중 정책상 안전한 단위부터 고른다.

## 주의

- `backup(omni-node)/`는 참조용 백업이며 커밋 대상이 아니다.
- Git rollback, worktree 삭제, cleanup/prune은 정책 확정 전까지 read-only inventory만 표시한다.
