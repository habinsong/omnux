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

## 다음 연결 후보

- Self-RAG 실행 오케스트레이터: preflight 결과를 검색 실행 plan과 evidence pack UI로 확장.
- Terminal PTY 승인 게이트: terminal capability snapshot 이후 preview/apply/session 모델로 실행 제어.
- MCP process/JSON-RPC 1차: MCP readiness를 실제 프로세스 lifecycle로 확장하되 Terminal 승인 모델 재사용.

## 주의

- `backup(omni-node)/`는 참조용 백업이며 커밋 대상이 아니다.
- Git rollback, worktree 삭제, cleanup/prune은 정책 확정 전까지 read-only inventory만 표시한다.
