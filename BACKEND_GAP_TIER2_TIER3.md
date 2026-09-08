# 백엔드 갭 분석 — Tier 2 / Tier 3

기준일: 2026-06-20
작성 근거: WS 디스패처 155개 요청 타입 전수 추출 + 서비스 레이어 직접 확인(파일·라인 명시).

---

## 0. 핵심 요약 (먼저 읽어라)

"백엔드는 다 구현됐는데 프론트 연결만 안 됐다"는 통념은 **절반만 사실**이다.

- **Tier 1 (백엔드 완성 / 프론트 0%)**: 전체 155개 타입 중 프론트 미참조는 `doctor_fix_apply` **단 하나**였다. → 2026-06-20 세션에서 **연결 완료**.
- **Tier 2 (백엔드가 프로브에서 끝남)**: 우리가 "구현됨"이라 부르는 상당수 기능은 백엔드 자체가 **readiness / discovery / snapshot 프로브**다. 실제 액션(실행·수정·삭제)은 백엔드에도 없다. 프론트를 연결해도 호출할 대상이 없다.
- **Tier 3 (연결은 됐는데 반쪽)**: 백엔드 핵심 조각은 있으나 오케스트레이터/루프가 없어 기능이 절반만 동작한다.

> 문서 신뢰성 경고: `backend_hidden_features.md`(40개 "hidden feature"), `backend_feature_frontend.md`, `backend-feature-candidates.md` 는 Tier 2 항목 다수를 "구현됨"으로 과장한다. 외부 문서/README에서 "구현됨" 딱지를 붙이기 전에 본 문서의 판정을 따른다.

---

## Tier 2 — 백엔드가 프로브에서 끝나는 기능

이 그룹은 전부 WS 레이어에 `*_snapshot_get` / `*_readiness_get` 단 1개 타입만 노출되고, 프론트는 **Insights 탭의 read-only 카드**(`requestDesktopInsights`)로 정직하게 렌더링한다. 즉 UI는 백엔드 현실을 그대로 반영 중이다. 문제는 백엔드에 액션이 없다는 것.

| 기능 | "구현됨"으로 오해되는 것 | 실제 백엔드 상태 | 증거 (file:line) |
|---|---|---|---|
| Git Time Machine / rollback | reset·clean·checkpoint 복원 | 실행 코드 없음. 프로브가 "비활성화"라고 직접 보고 | `GitTimeMachineSnapshotService.cs:214-217` |
| Terminal PTY | 인터랙티브 터미널 세션 | 쉘 탐지(`DiscoverShells`)만 | `TerminalCapabilitySnapshotService.cs:72` |
| MCP tool call | start/stop/initialize/tools/call | config 파일 읽기(`Discover`)만, 프로세스 spawn 없음 | `McpConfigDiscoveryService.cs:34` |
| Worktree remove/prune | 정리·삭제 실행 | `GetSnapshot()`, 항목 `ReadOnly: true` | `AgentWorktreeSnapshotService.cs:99` |
| Semantic / Vector 검색 | tree-sitter + 임베딩 + 벡터검색 | readiness만. 벡터/임베딩 명시적 OFF | `SemanticSearchReadinessService.cs:70,84-85` |
| Self-Improvement | nightly 자동 적용/PR 생성 | snapshot DTO만 | `SelfImprovementSnapshotService.cs` |
| Commit Learning | memory/skill/system prompt 자동 주입 | snapshot만 | `WsCommitLearningCommandDispatcher.cs` |
| Code Repomap | tree-sitter 파싱 + 벡터 | 휴리스틱 파일 스캔 repomap(read-only). tree-sitter/벡터 없음 | `CodeRepomapSnapshotService.cs:148,305` |
| Local LLM offline enforce | provider 강제 라우팅/cloud 차단 | HTTP 엔드포인트 탐지(`probe`)만 | `LocalLlmDiscoveryService.cs:94,270` |

### 2.1 Git Time Machine — 가장 명백한 케이스
`GitTimeMachineSnapshotService.GetSnapshotAsync`는 git 상태를 읽어 체크포인트 목록을 보여주지만, 실제 복원은 프로브가 직접 끈다.

```
auto_snapshot_commit : skipped — "background git commit is not enabled"   // :214
rollback_execution   : skipped — "git reset --hard is not enabled"        // :216
worktree_clean       : skipped — "git clean -fd is not enabled"           // :217
```

→ rollback/reset/clean 실행은 **백엔드에 존재하지 않는다.** UI 버튼을 달 대상이 없음.

### 2.2 Terminal PTY
`TerminalCapabilitySnapshotService`는 PATH에서 쉘을 찾아 capability를 보고할 뿐(`DiscoverShells`, :72). PTY 세션 생성/입출력/종료 없음.
> 단, 명령 실행 자체가 0은 아니다. Build 코딩 루프(`CodingLoopActionExecutor`)는 `run` 액션으로 명령을 실행한다. 그러나 그것은 **코딩 루프 전용**이며 범용 인터랙티브 터미널이 아니다.

### 2.3 MCP
`McpConfigDiscoveryService.Discover`(:34)는 후보 config 경로(`mcp.json` 류)를 읽어 서버 정의의 readiness만 평가한다(`McpServerReadinessPolicy`). stdio/JSON-RPC 프로세스 spawn, `initialize`, `tools/list`, `tools/call` 전부 없음.

### 2.4 Worktree
`AgentWorktreeSnapshotService.GetSnapshot`은 worktree를 나열하고 git 상태를 읽되 모든 항목을 `ReadOnly: true`(:99)로 표시한다. `worktree_remove/prune/cleanup` 실행 경로 없음.

### 2.5 Semantic / Vector 검색
`SemanticSearchReadinessService`는 임베딩/벡터 가능 여부를 점검만 한다.

```
check "skipped" — "embedding generation and vector indexing are not enabled by this endpoint" // :69-70
VectorSearchEnabled: false, EmbeddingGenerationEnabled: false                                  // :84-85
```

`SemanticSearchIndexProbe`도 sqlite-vec 가시성만 확인하고 "vector search remains disabled"(:91-92)로 보고. 즉 실제 의미검색은 미구현. (반면 FTS 텍스트 메모리 검색 `memory_search`/`memory_index_rebuild`는 별개로 동작 — Tier 2 아님.)

### 2.6 Self-Improvement / Commit Learning
둘 다 snapshot DTO 서비스만 존재. nightly 자동 적용, issue/PR 생성, memory note/skill/system prompt 자동 주입 등 "학습 후 반영" 액션은 없다.

### 2.7 Code Repomap
360줄로 실제 파일 스캔 + 휴리스틱 심볼 추출은 한다(대용량/바이너리 skip, :148/:155, 4096바이트 프로브 :305). 다만 tree-sitter 정식 파서·임베딩·벡터검색은 없고 결과는 read-only 스냅샷.

### 2.8 Local LLM offline enforcement
`LocalLlmDiscoveryService`는 Ollama 등 로컬 엔드포인트를 HTTP로 프로브(:94)해 가용성만 보고한다(실패 시 `local_llm_probe_failed` :270). provider 강제 라우팅, cloud fallback 차단 같은 enforcement는 라우팅 정책에 미연결.

### Tier 2 결단 매트릭스
프론트를 붙이지 말 것(부를 대상 없음). 각 항목은 둘 중 하나를 택한다.

| 항목 | 권장 결단 | 이유 |
|---|---|---|
| Git rollback/reset/clean | 백엔드 액션 구현(preview→approval→apply, recovery path 포함) 또는 문서 relabel | 파괴적이라 정책 선행 필수 |
| Terminal PTY | 보류(relabel) | 임의 명령 실행 = 보안 표면 큼. 코딩 루프로 대체 가능 |
| MCP tool call | 수요 있으면 백엔드 구현 | 가치 높으나 프로세스 lifecycle/권한 설계 필요 |
| Worktree remove/prune | 백엔드 액션 구현(소유권·changed files 확인) | Agents 워크플로우 정리에 실질 가치 |
| Semantic/Vector | 백엔드 구현(임베딩+sqlite-vec) | RAG 품질의 핵심. Tier 3 Self-RAG와 직결 |
| Self-Improvement / Commit Learning | relabel | 자동 PR/주입은 리스크·범위 큼 |
| Code Repomap | 현행 유지(휴리스틱 OK) 또는 tree-sitter 승격 | 이미 동작, 점진 개선 대상 |
| Local LLM enforce | 라우팅 정책에 연결 | 탐지는 됨, enforcement 설계만 추가 |

---

## Tier 3 — 연결은 됐으나 반쪽짜리

### 3.1 Self-RAG (정정됨 + 2026-06-20 Build 경로 구현 완료)
초기 판정("실행기가 없다")은 **부분 오류**였다. 실제 조사 결과 두 개의 분리된 시스템이 있었다.

- **실제 실행기는 존재**: Ask 경로는 `CommandService.AskRetrieval.cs`의 `TryBuildAutoRetrievalBlockAsync` + `AskAutoRetrievalPolicy`(595줄)가 memory FTS·노트 직접스캔·대화검색·프로젝트 개요·노트북을 1.2s 예산으로 실행→pack→`[자동 참조 자료]`로 프롬프트에 주입한다(호출처 `CommandService.Chat.cs:270`). 즉 Ask Self-RAG는 이미 동작 중.
- **advisory는 별개**: `RagRetrievalPreflightPolicy`(320줄) + `rag_retrieval_preflight` WS는 Ask/Build UI에 "무엇을 검색하면 좋은가"를 띄우는 **별도 advisory**로, 위 실행기와 연결돼 있지 않다.
- **진짜 갭이었던 것**: Build/코딩 루프에는 자동검색이 **전혀 없었다**(`RunAutonomousCodingLoopAsync`).

**구현 완료 (2026-06-20)**: 검증된 Ask 실행기를 재사용해 코딩 루프에 자동검색을 이식. `ICodingCommandGateway.BuildCodingRetrievalBlockAsync` → 어댑터 → CommandService 구현(`AskIntentPlan`을 코딩용으로 합성: 대화이력·노트북 제외, 구조형 질문이면 프로젝트 개요만). 코딩 루프가 objective를 쿼리로 블록을 1회 생성해 compact `[refs]` / verbose `[참조 자료]` 섹션으로 주입(목표 우선). env `OMNUX_CODING_AUTO_RETRIEVAL=0/false/off/no`로 비활성. 테스트 +2(1484→1486, 회귀 0), 빌드 0경고.

**후속 처리 (2026-06-20, 동일 세션):**
- (a) preflight ↔ executor 연결 **완료**: `RagRetrievalPreflightPolicy`에 `EvaluateSignals`/`SuggestsSessionRetrieval` 공개 헬퍼 추가 → `AskIntentPlanner.Plan`이 preflight의 `session_or_agent` 신호로도 대화(세션)검색을 켠다(기존 회고 어휘 게이트에 OR 추가). 코딩 executor도 preflight 신호를 평가해 대화검색 차원 결정 + `coding_auto_retrieval/preflight` 감사 로그로 관측. 이제 advisory 정책과 실제 실행기가 같은 신호를 공유한다.
- (b) web/session 차원: **조사 결과 대부분 이미 커버됨**(아래 3.4). 추가 구현은 의도적으로 하지 않음.
- (c) 실제 LLM 키 라이브 검증은 사용자 영역(유지).
- (d) preflight 패널 "추천↔실제" 시각 통합 **완료**: Ask는 직전 AI 응답의 route/retrievalTrace를 패널에 합류(`RagActualRetrievalStrip`), Build는 코딩 결과에 전용 `RetrievalLabel`(`refs N`)을 source-gen JSON으로 배선해 패널에 "직전 빌드 실제 회수" 배지로 표시. 이제 한 패널에서 추천 후보와 실제 회수를 같이 본다.

### 3.2 Clipboard Vision
- `clipboard_vision_preflight`가 Ask(`AskPage.tsx`)에서 호출되어 가능 여부만 점검.
- 없는 것: OS 클립보드 watcher, 비전 LLM 직접 호출 루프, scaffold 실행, 캔버스 반복 비교.
- 판정: preflight만. 실사용하려면 watcher + 호출 루프 필요.

### 3.3 cleanup_apply
- preview→권한 모달→apply 연결됨(`ops-store.ts applyCleanupPreview`).
- 없는 것: 제외 목록(exclude list), undo, 세부 승인 토큰 정책.
- 판정: 동작은 하나 삭제 안전장치 미흡. 실삭제 전 제외/undo 보강 권장.

### 3.4 자동검색의 web/session 차원 — 조사 결론 (대부분 이미 존재)
처음엔 "실행기에 web/session 추가"가 필요해 보였으나, 코드 확인 결과 둘 다 이미 다른 경로로 처리되고 있어 빠른 로컬 블록에 중복 구현하지 않기로 했다.

- **web: 이미 자동 실행됨.** Ask는 `AskIntentPlanner.ResolveWebIntentHeuristic`(실시간/명시적 웹 질문 휴리스틱) → `ComposeGroundedWebAnswerWithFallbackAsync`(`CommandService.Chat.cs:387`)로 **전용 가드/인용 파이프라인**을 태워 웹을 실행한다. 1.2s 예산의 로컬 회수 블록에 라이브 웹 호출을 넣으면 비용·지연·인용 가드와 충돌하므로 의도적으로 분리 유지.
- **session: free-text 검색 API가 없음.** `SessionReplayApplicationService.GetReplay`는 conversationId/runId/agentId/groupId **anchor 필수**라 쿼리 기반 회수에 못 쓴다. 과거 세션 *내용* 회수는 `SearchAndFormatConversationViews`(대화검색)가 이미 담당하며, 3.1(a)에서 preflight `session_or_agent` 신호로 그 트리거를 확대했다.
- 판정: web=기존 전용 경로 유지, session=대화검색으로 커버 + preflight 신호로 확대 완료. `session_replay_get`을 쿼리 회수 차원으로 쓰려면 별도 세션 검색 인덱스가 필요(현재 미존재) — 신규 기능이라 범위 외.

---

## 부록 A — Tier 1 처리 완료 기록 (2026-06-20)

`doctor_fix_apply`: 백엔드(`DoctorApplicationService.ApplyDoctorFix`)는 previewId로 캐시된 plan 중 `AutoApply && Kind=="create_directory"` 항목만 `Directory.CreateDirectory`로 적용(삭제 없음, 저위험). 프론트는 스캐폴딩(상태 `fixApplying`, `doctor_fix_result` 라우팅, `DoctorFixResult.action`)이 이미 있었고 UI에 비활성 "적용 보류" 버튼만 박혀 있었다.

연결 내용:
- `ops-gateway.ts`: `doctor_fix_apply` 등록 + `doctorFixApply(previewId)` 추가, 과장된 "위험 명령" 주석 정정.
- `ops-store.ts`: `applyDoctorFix()` 추가 — `permissionAction:"write"` 권한 모달(자동 적용 항목 목록 + approvalToken=previewId) 후 전송.
- `OperationsDoctorPanel.tsx`: 비활성 버튼 → `canApplyFix`(preview 결과 + previewId + autoApply>0) 게이트의 "적용" 버튼.
- `OperationsOverviewSection.tsx`: `onApplyFix={store.applyDoctorFix}` 배선.

검증: `tsc --noEmit` 통과. 라이브 end-to-end(미들웨어 + 실제 doctor preview)는 사용자 직접 확인 영역.

---

## 부록 B — 측정 방법
- 백엔드 타입: `grep -rhoE 'message\.Type (==|!=) "..."' apps/omnux-middleware/src/Ws*.cs` → 155개.
- 프론트 미참조 교차검증: 각 타입 문자열의 게이트웨이/컴포넌트 출현 대조(컴포넌트는 raw 타입이 아닌 게이트웨이 함수를 호출하므로, 게이트웨이 함수의 실제 호출처까지 확인).
- Tier 2 판정: 디스패처가 주입받는 서비스의 public 메서드가 액션이 아닌 snapshot/discovery/readiness만 노출하는지 직접 확인.
