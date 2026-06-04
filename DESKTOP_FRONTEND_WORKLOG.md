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

## 다음 연결 후보

- 다음 연결 후보는 Local LLM 실제 라우팅 readiness, Self-RAG 실행 plan, Terminal PTY 승인 게이트 중 정책상 안전한 단위부터 고른다.

## 주의

- `backup(omni-node)/`는 참조용 백업이며 커밋 대상이 아니다.
- Git rollback, worktree 삭제, cleanup/prune은 정책 확정 전까지 read-only inventory만 표시한다.
