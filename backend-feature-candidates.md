# 백엔드 추가 기능 후보 (Backend Feature Candidates)

> 2026-06-04 기준, 기존 기능과 경쟁사/논문 분석을 바탕으로 도출한 백엔드 보완 후보.
> UI/UX는 제외, 순수 백엔드 기능만 포함.

---

## 현재 구현 현황

| 영역 | 상태 | 구현체 |
|---|---|---|
| 멀티 에이전트 스폰/큐 | ✅ | `SessionSpawnTool`, `FileAgentSpawnQueueStore` |
| 롤백/스냅샷 | ✅ | `AgentSpawnWorkspaceRollbackPolicy`, 400파일/4MB |
| 스킬 자가 생성 | ✅ | `SkillCreateDirective` |
| 로직 그래프 워크플로우 | ✅ | 노드 기반 비주얼 프로그래밍 런타임 |
| FTS 코드베이스 인덱싱 | ✅ | `MemoryIndexDocumentSync` SQLite FTS |
| 구조 인식 청킹 | ✅ 1차 | `MemoryChunkingPolicy`, C#/JS/TS/Python 선언 경계 기반 chunk plan |
| 계층적 메모리 | ✅ 1차 | `MemoryTierPolicy`, `chunks.memory_tier/last_accessed_at`, tier-aware 검색 점수 |
| 비용 제한 (Run Breaker) | ✅ | `AgentSpawnRunBreaker`, 60K 토큰/일 |
| 검색 증거 검증 | ✅ | `SearchGuard`, `EvidencePack` |
| 루틴 스케줄링 | ✅ | `RoutineSchedulePolicy` |
| 핸드오프 | ✅ | `WsNotebookCommandDispatcher` |
| 컨텍스트 적응형 압축 | ✅ | `AdaptiveContextCompressionPolicy`, 토큰/문자/메시지 임계치 기반 자동 압축 |
| 에이전트 간 메시지 패싱 | ✅ | `AgentCommunicationApplicationService`, `FileAgentCommunicationStore`, `WsAgentCommandDispatcher` |
| MCP 서버/클라이언트 | ❌ | CodexCliWrapper에 MCP 문자열만 존재 |
| Git worktree 격리 | ❌ | 검색 결과 0 |
| 셀프 힐링/워치독 | ✅ 1차 | `FileAgentSpawnActiveRunStore.EvaluateWatchdog`, 백그라운드 active-run timeout/stale 감지 |
| 자동 커밋/PR 생성 | ❌ | 검색 결과 0 |
| Durable Workflow | ✅ 1차 | `LogicRunSnapshot` 지속 저장, `LogicRunRecoveryScanner`, `logic_graph_recovery_list` |
| OpenTelemetry 옵저버빌리티 | ✅ 1차 | `TelemetryTracer`, `FileTelemetryTraceStore`, `WsTelemetryCommandDispatcher` — ActivitySource + 로컬 스냅샷 |
| 세션 리플레이 & 디버깅 | ✅ 1차 | `SessionReplayApplicationService`, `WsSessionReplayCommandDispatcher` — 대화/telemetry/agent bus 타임라인 스냅샷 |
| 프롬프트 캐싱 최적화 | ✅ 1차 | `PromptCachePolicy`, telemetry cache key/affinity/readiness 기록 |
| 스마트 모델 라우팅 | ✅ 1차 | `ModelRoutingReadinessPolicy`, telemetry complexity/tier/cascade readiness 기록 |
| 에이전트 권한 샌드박스 강화 | ✅ 1차 | `UniversalCodeExecutionSafetyPolicy`, `UniversalCodeRunner` bash/unknown shell preflight 차단 |
| 벡터 임베딩 시맨틱 검색 | ⏳ Phase 6-3 | 현재 FTS 유지, Phase 6-2(Ollama) 선행 후 sqlite-vec + Ollama embed로 추가 |
| Nightly 자기 개선 | ❌ | 검색 결과 0 |

---

## 우선순위 매트릭스 (갱신)

| 순위 | 기능 | 가치 | 난이도 | 외부 의존성 |
|---|---|---|---|---|
| 1 | 컨텍스트 적응형 압축 | ⭐⭐⭐⭐⭐ | 중 | 없음 |
| 2 | 인터-에이전트 메시지 패싱 | ⭐⭐⭐⭐⭐ | 중 | 없음 |
| 3 | Tree-sitter(AST) 지능형 청킹 & Repomap | ⭐⭐⭐⭐⭐ | 높음 | Tree-sitter 파서 |
| 4 | Durable Workflow 체크포인트 | ⭐⭐⭐⭐ | 중 | 없음 |
| 5 | MCP 서버 지원 | ⭐⭐⭐⭐ | 높음 | MCP 스펙 |
| 6 | 자동 커밋/PR 생성 | ⭐⭐⭐⭐ | 낮음 | git, gh |
| 7 | OpenTelemetry 옵저버빌리티 | ⭐⭐⭐⭐ | 낮음 | 없음 (.NET 내장) |
| 8 | 스마트 모델 라우팅 | ⭐⭐⭐⭐ | 중 | 없음 |
| 9 | 계층적 메모리 | ⭐⭐⭐⭐ | 높음 | 없음 |
| 10 | 셀프 힐링 워치독 | ⭐⭐⭐ | 낮음 | 없음 |
| 11 | 세션 리플레이 & 디버깅 | ⭐⭐⭐ | 중 | 없음 |
| 12 | 에이전트 권한 샌드박스 강화 | ⭐⭐⭐ | 높음 | OS별 API |
| 13 | 커밋 히스토리 기반 학습 | ⭐⭐⭐ | 중 | 없음 |
| 14 | 프롬프트 캐싱 최적화 | ⭐⭐⭐ | 낮음 | 없음 |
| 15 | Git Worktree 격리 | ⭐⭐⭐ | 중 | git |
| 16 | 시맨틱 검색 (Ollama embed) | ⭐⭐ | 낮음 | 대화 검색용으로 보류 |

### 권장 구현 순서 (2026-06-04 갱신)

1. **1차** (즉시, 최우선 RAG 고도화): 컨텍스트 압축 → 인터-에이전트 메시지 패싱 → **Tree-sitter(AST) 지능형 청킹 및 Repomap 도입**
2. **2차** (기존 인프라 확장): 프롬프트 캐싱 → OTel 옵저버빌리티 → 셀프 힐링 워치독
3. **3차** (모델 최적화): 스마트 모델 라우팅 → Durable Workflow
4. **4차** (외부 도구 연동): 자동 커밋/PR → MCP 서버 → Git Worktree
5. **5차** (지능 고도화): 계층적 메모리 → 커밋 학습 → 세션 리플레이 → 샌드박스 강화
6. **보류** (후순위): 시맨틱 검색(Ollama embed)은 나중에 필요시 대화 검색용으로만 검토

## 추천 기능 1: 컨텍스트 적응형 압축 (Adaptive Context Compression)

### 가치: ⭐⭐⭐⭐⭐ — 최우선

### 문제

현재 대화가 길어지면 전체를 그대로 LLM에 전달. 토큰 한도 도달 시 실패하거나 오래된 컨텍스트가 짤림. 긴 코딩 세션(30분+)에서 치명적.

### 경쟁사 구현

- **Sema Code**: adaptive context tracking mechanism + dual-path degradation policy. 토큰 임계치 기반 자동 요약.
- **Coder**: "As conversations grow, the agent automatically summarizes older context to stay within the model's context window."
- **Cursor**: `.cursor/rules`로 장기 컨텍스트를 파일에 저장, 세션 간 유지.

### 구체적 스펙

1. 대화 토큰 수를 실시간 추적 (LLM 응답의 `usage.total_tokens` 활용)
2. 모델 컨텍스트 윈도우의 70% 도달 시 트리거
3. 이전 메시지를 LLM으로 요약하여 압축된 컨텍스트 생성
4. 최종 프롬프트 = 요약본 + 최근 N턴
5. 원본 메시지는 SQLite에 보존 (UI에서 전체 대화 조회 가능)
6. 압축 비율과 타이밍을 WebSocket으로 UI에 통지

### 구현 난이도

중. 기존 `CommandService.Chat.cs`의 `summariz` 관련 코드를 확장. 외부 의존성 없음.

### 참고

- Sema Code 논문: https://arxiv.org/html/2604.11045
- Coder Architecture: https://coder.com/docs/ai-coder/agents/architecture


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `CommandService.Chat.cs`, `ConversationContextPolicy.cs`
- **신규 파일**: `AdaptiveContextCompressor.cs`
- **구현 방향**: `ConversationContextPolicy.cs`에서 `_llm.usage` 값을 누적 트래킹합니다. 임계치(예: 모델 윈도우의 80%)에 도달하면 `AdaptiveContextCompressor`를 백그라운드 호출하여 과거 메시지 블록을 단일 요약 메시지로 교체하여 토큰을 확보합니다.

---

## 추천 기능 2: 인터-에이전트 메시지 패싱 (Inter-Agent Communication)

### 가치: ⭐⭐⭐⭐⭐ — 최우선

### 문제

현재 스폰된 서브 에이전트끼리 소통 불가. 부모→자식 단방향만 존재. 서브 에이전트는 "고립된 워커"이며 "협업 시스템"이 아님.

### 경쟁사 구현

- **amux**: inter-agent REST API. 에이전트가 서로의 출력을 peek, 메시지 전송, 공유 보드 읽기/쓰기 가능.
- **SPOQ 논문**: 에이전트 간 상태 공유로 defect 0.34→0.03 감소, 테스트 통과율 99.75% 달성.
- **Sema Code**: 서브 에이전트가 공유하는 abort controller로 전체 에이전트 트리를 한 번에 정지 가능.
- **LangGraph**: 그래프 기반 에이전트 간 상태 전달.

### 구체적 스펙

1. 에이전트 간 메시지 큐 (로컬 파일 기반, 기존 `FileAgentSpawnQueueStore` 패턴과 일치)
2. 스폰된 에이전트가 다른 에이전트의 완료 결과를 구독 가능
3. 공유 상태 보드 — 각 에이전트가 자신의 진행 상태를 write, 다른 에이전트가 read
4. 에이전트 생명주기 이벤트 (spawned, running, completed, failed) 브로드캐스트
5. 부모 에이전트가 자식 에이전트 그룹에 명령 전달 (예: "전체 정지")

### 구현 난이도

중. 기존 파일 기반 큐 패턴을 재사용. 외부 의존성 없음.

### 참고

- SPOQ 논문: https://arxiv.org/html/2606.03115
- amux: https://amux.io/guides/ai-agent-orchestration-2026/


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `SessionSpawnTool.cs`, `FileAgentSpawnQueueStore.cs`
- **신규 파일**: `InterAgentMessageBus.cs`, `AgentStateBoardStore.cs`
- **구현 방향**: `SessionSpawnTool` 실행 시 생성되는 고유 ID를 기반으로 로컬 파일 기반의 MessageBus를 구축합니다. 서브 에이전트들이 `Publish()`로 상태(진행률, 결과물)를 기록하고 부모 에이전트가 이를 폴링/구독하는 퍼브섭(Pub-Sub) 형태로 구성합니다.

---

## 추천 기능 3: Durable Workflow 체크포인트 (Checkpoint Recovery)

### 가치: ⭐⭐⭐⭐

### 상태: ✅ 1차 구현

- 로직 그래프 실행은 이미 노드 이벤트마다 `.runtime/logic/<graphId>/<runId>/snapshot.json`을 저장한다.
- `LogicRunRecoveryScanner`가 재시작 후 디스크에 남은 non-terminal snapshot을 찾아 복구 후보로 반환한다.
- WebSocket `logic_graph_recovery_list`가 복구 후보 목록을 조회한다.
- 자동 재실행/resume은 아직 하지 않는다. 노드 중복 실행, 외부 side effect, tool 재호출 정책이 필요해 별도 단계로 둔다.

### 문제

로직 그래프 런타임이 있으나, 미들웨어 크래시/재시작 시 진행 상태가 날아감. 장시간 실행 그래프(10분+)에서 전체 재시작 필요.

### 경쟁사 구현

- **Centaur (Paradigm)**: "The workflow engine checkpoints every step to Postgres. If the process crashes mid-workflow, it resumes exactly where it left off, no duplicate work, no lost state."
- **Open SWE**: LangGraph 기반으로 상태 그래프의 각 노드 완료 시 체크포인트.

### 구체적 스펙

1. 로직 그래프 실행 시 매 노드 완료 후 상태를 SQLite에 체크포인트
2. 미들웨어 재시작 시 미완료 그래프를 자동 탐지
3. 마지막 완료 노드부터 재개, 실패한 노드만 재시도
4. 성공한 노드는 결과를 캐시에서 불러와 건너뜀
5. 체크포인트 파일은 기존 `FileRunArtifactStore`와 동일한 패턴으로 관리

### 구현 난이도

중. 기존 SQLite FTS 인프라 재사용. 외부 의존성 없음.

### 참고

- Centaur: https://www.paradigm.xyz/2026/05/open-sourcing-centaur-multiplayer-self-hosted-secure-agents
- Open SWE: https://www.langchain.com/blog/open-swe-an-open-source-framework-for-internal-coding-agents


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `WsLogicCommandDispatcher.cs`, `LogicLeafNodeExecutor.cs`
- **신규 파일**: `LogicGraphCheckpointStore.cs` (SQLite 기반)
- **구현 방향**: 각 로직 그래프 노드 실행이 완료될 때마다 상태와 결과를 SQLite에 즉시 저장합니다. 앱 크래시나 미들웨어 재시작 시 `WsLogicCommandDispatcher`의 초기화 단계에서 미완료 그래프를 로드하여 마지막 성공 지점부터 다시 실행(Resume)하도록 합니다.

---

## 추천 기능 4: MCP 서버 지원 (Model Context Protocol)

### 가치: ⭐⭐⭐⭐

### 문제

2025-2026 에이전트 생태계의 표준 프로토콜이나, 현재 미들웨어에 MCP 지원이 없음. 도구 생태계 확장이 불가한 닫힌 시스템.

### 경쟁사 구현

- **Windsurf**: MCP 네이티브 지원. `.codeium/windsurf/mcp_config.json`으로 외부 서비스 등록.
- **Cursor**: MCP 서버를 통한 외부 도구 연동.
- **Claude Code**: MCP가 Anthropic의 표준 도구 프로토콜.
- **Coder**: workspace `.mcp.json` 파일에서 MCP 서버 자동 감지.

### 구체적 스펙

1. `.mcp.json` (또는 `.omni/mcp.json`) 파일 파싱하여 외부 MCP 서버 등록
2. MCP 서버 프로세스 생명주기 관리 (시작/중지/재시작)
3. 스폰된 에이전트가 MCP 도구를 사용 가능하도록 툴 레지스트리에 등록
4. 파일시스템, GitHub, 데이터베이스 등 외부 리소스 접근
5. 기존 `ToolRegistry.cs`를 확장하여 MCP 도구를 통합

### 구현 난이도

높음. MCP 스펙 구현 필요. JSON-RPC 기반 프로토콜.

### 참고

- MCP 스펙: https://modelcontextprotocol.io/
- Windsurf MCP: https://docs.windsurf.com/context-awareness/overview


### 개발 가이드 (Implementation Guide)
- **참고 파일**: `ToolRegistry.cs`, `CodexCliWrapper.cs`
- **신규 파일**: `McpClientGateway.cs`, `McpToolRegistryAdapter.cs`
- **구현 방향**: `.mcp.json` 파일의 설정을 파싱하여 Node.js나 Python으로 작성된 MCP 서버를 하위 프로세스(Subprocess)로 띄웁니다. 표준 JSON-RPC over stdio로 통신하며, 서버가 반환한 도구(Tool) 목록을 `ToolRegistry`에 동적으로 주입합니다.

---

## 추천 기능 5: 자동 커밋/PR 생성 (Auto-commit & PR)

### 가치: ⭐⭐⭐⭐

### 문제

에이전트가 코드를 수정해도 커밋/PR은 수동. 작업 완료 후 마무리 단계가 없어 변경사항이 워킹 디렉토리에 방치됨.

### 경쟁사 구현

- **Open SWE**: `open_pr_if_needed` 미들웨어가 에이전트가 PR을 안 만들면 안전망으로 자동 생성.
- **Coder**: `propose_plan` → 승인 → 자동 커밋 플로우.
- **Centaur**: 워크플로우의 마지막 스텝으로 PR 생성.

### 구체적 스펙

1. 코딩 에이전트 완료 시 `git diff --stat`으로 변경 내용 감지
2. 변경 내용을 LLM으로 요약하여 커밋 메시지 자동 생성
3. 브랜치 전략과 연동 (feature 브랜치 자동 생성)
4. GitHub CLI (`gh pr create`)로 PR 생성
5. 롤백과 연동 — PR 단위로 되돌리기 가능
6. 기존 `CodingApplicationService` 완료 훅에 통합

### 구현 난이도

낮음. git CLI + GitHub CLI 조합. 외부 의존성 git, gh.

### 참고

- Open SWE: https://www.langchain.com/blog/open-swe-an-open-source-framework-for-internal-coding-agents


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `CodingLoopActionExecutor.cs`, `CommandService.CodingGateway.cs`
- **신규 파일**: `GitAutomationService.cs`
- **구현 방향**: 에이전트의 코딩 태스크 완료(Done) 시점에 `GitAutomationService`를 호출해 `git diff`를 가져옵니다. LLM을 통해 변경 사항을 요약하여 커밋 메시지를 생성한 뒤, `git commit` 및 `gh pr create`를 백그라운드 서브프로세스로 실행합니다.

---

## 추천 기능 6: 셀프 힐링 워치독 (Self-Healing Watchdog)

### 가치: ⭐⭐⭐

### 문제

에이전트 세션이 응답 없어지면 수동 개입 필요. Telegram 자율 모드 등 무인 운영에서 치명적.

### 경쟁사 구현

- **Centaur**: self-healing watchdog으로 세션 응답 없으면 자동 재시작.
- **amux**: 워치독 + cron 스케줄러 내장.

### 구체적 스펙

1. 백그라운드 타이머가 에이전트 세션 heartbeat 모니터링
2. heartbeat 타임아웃 발생 시 세션 상태 진단
3. 복구 가능 → 롤백 후 재시도
4. 복구 불가 → 에이전트 종료 + 사용자 통지 (WebSocket/Telegram)
5. 기존 `BackgroundTaskCoordinator`에 하트비트 체크 로직 추가
6. 재시도 횟수 상한 (기존 `AgentSpawnRunBreaker`와 연동)

### 구현 난이도

낮음. 기존 코디네이터에 타이머 추가. 외부 의존성 없음.


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `AgentSpawnRunBreaker.cs`
- **신규 파일**: `AgentWatchdogCoordinator.cs` (IHostedService 구현)
- **구현 방향**: 백그라운드 타이머를 돌려 활성 상태인 에이전트 세션들의 '마지막 액션 타임스탬프'를 감시합니다. 특정 시간(예: 5분) 이상 멈춰있으면 세션을 강제로 킬(Kill)하고 `RunBreaker` 정책에 따라 안전하게 재시도를 트리거합니다.

---

## 추천 기능 7: 시맨틱 검색 (Ollama Embed API) — 역할 축소 및 후순위 연기

### 가치: ⭐⭐ → **우선순위 대폭 하향. 코드가 아닌 '과거 대화/문서' 검색용으로만 제한적 사용.**

### 결론 (2026-06-04 아키텍처 확정)

**Ollama Embed API는 당분간 보류(서랍행)하며, 코드 검색은 FTS5(BM25) + Tree-sitter(AST) 조합에 올인합니다.**

### 아키텍처 근거

1. **임베딩의 한계 (구문 맹점)**: 벡터 임베딩은 텍스트의 '의미(뉘앙스)'를 찾을 뿐, 괄호, 들여쓰기, 정확한 변수명 등 코딩의 핵심인 '정확한 구문(Syntax)'을 이해하지 못합니다.
2. **코드 검색의 정답은 AST + BM25**: 무거운 시맨틱 검색을 돌리는 것보다, Tree-sitter로 코드를 '함수/클래스' 단위로 지능적으로 자른(Chunking) 뒤, 기존의 초고속 FTS5(BM25)로 텍스트 매칭을 하는 것이 속도와 정확도 면에서 압도적으로 우수합니다. (Aider, Cursor의 핵심 아키텍처)
3. **Ollama의 남은 역할**: 훗날 대시보드에서 "과거 채팅 기록"이나 "기획 문서(자연어)"를 검색할 때만 Ollama 임베딩을 가볍게 활용합니다. 코드 검색 엔진에서는 배제합니다.

### 기각된 대안들

| 대안 | 기각 사유 |
|---|---|
| ONNX Runtime 직접 탑재 | C++ 네이티브 바이너리 크로스 컴파일, 앱 용량 증가 |
| 시맨틱 기반 코드 RAG | 코드는 '의미'보다 '구조'가 중요함. 임베딩은 엉뚱한 코드를 반환할 확률 높음 |


### 개발 가이드 (Implementation Guide)
- **결론**: **아키텍처 확정으로 인해 코드 검색용 구현은 전면 보류합니다.**
- **추후 구현 시**: 훗날 채팅 기록이나 기획 문서 등 '자연어 검색'이 필요해질 때만 `OpenAiCompatibleProtocol.cs` 패턴을 응용하여 `OllamaEmbeddingProvider.cs`를 추가하는 선에서 가볍게 연동합니다.

---

## 추천 기능 8: Git Worktree 격리 (Agent Isolation)

### 가치: ⭐⭐⭐

### 문제

현재 스폰된 에이전트들이 같은 워킹 디렉토리에서 작업. 병렬 에이전트 스폰 시 파일 충돌 가능.

### 경쟁사 구현

- **amux**: git worktree + SQLite task board로 에이전트별 격리.
- **Claude Squad**: tmux 세션 그룹 + git worktree.
- **workmux**: git worktree + 터미널 멀티플렉서 자동화.

### 구체적 스펙

1. 에이전트 스폰 시 `git worktree add`로 별도 디렉토리 생성
2. 각 에이전트는 자신의 worktree에서만 작업
3. 작업 완료 후 변경사항을 메인 브랜치에 머지/체리픽
4. 실패 시 worktree만 삭제 (기존 롤백과 연동)
5. worktree 정리 정책 — 완료 후 N시간 내 자동 삭제

### 구현 난이도

중. git CLI 호출. 파일시스템 공간 소모 고려 필요.


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `SessionSpawnTool.cs`
- **신규 파일**: `GitWorktreeManager.cs`
- **구현 방향**: 다수의 서브 에이전트가 동시에 스폰될 때, 동일한 워크스페이스를 사용하면 파일 충돌이 발생합니다. 스폰 직전에 `git worktree add`를 호출하여 임시 폴더에 격리된 워크트리를 만들고, 해당 에이전트의 CWD(Current Working Directory)로 할당합니다.

---

---

## 추천 기능 9: OpenTelemetry 기반 옵저버빌리티 (Distributed Tracing & Token Accounting)

### 가치: ⭐⭐⭐⭐

### 문제

현재 `AuditLogger` 104곳 + `ILogger` 5곳. 커스텀 파일 로거만 있고, 토큰 사용량/비용/레이턴시/에이전트 체인을 종합적으로 추적할 수 없음. 어느 에이전트가 토큰을 가장 많이 쓰는지, 어느 LLM 호출이 병목인지 파악 불가.

### 경쟁사 구현

- **AG2 (AutoGen)**: `TelemetryMiddleware`가 OpenTelemetry spans을 emit. 에이전트 턴, LLM 호출, 툴 실행, human-in-the-loop 각각에 span 생성. `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens` 등 표준 속성 포함.
- **AgentWeave**: 에이전트 위임 체인 전체를 W3C PROV-O provenance로 추적. "어떤 에이전트가, 어떤 모델로, 얼마의 비용으로, 무엇을 생성했는지"를 단일 trace로 파악.
- **AgentOrbit**: 프록시 기반 제로코드 옵저버빌리티. LLM 응답을 그대로 패스스루하면서 병렬로 span 기록. 실시간 대시보드, 실패 클러스터링, 비용 추적.
- **Red Hat / Databricks**: 에이전트 워크플로우에 대한 분산 트레이싱. OTLP 표준으로 Jaeger, Grafana Tempo, Datadog 등 모든 백엔드와 호환.

### 구체적 스펙

1. `System.Diagnostics.Activity` (.NET 내장)로 에이전트 턴, LLM 호출, 툴 실행마다 span 생성
2. 각 span에 `gen_ai.*` 표준 속성 부여 (모델명, 토큰 수, 비용, 제공자)
3. OTLP exporter로 외부 백엔드(Jaeger, Grafana Tempo 등)에 export
4. 토큰 사용량 히스토그램, 에이전트별 비용 롤업, P50/P99 레이턴시 대시보드
5. 기존 `AuditLogger`와 병렬 운영 (점진적 마이그레이션)
6. 로컬 모드에서는 콘솔/파일 export, 서버 모드에서는 OTLP export

### 구현 난이도

낮음. .NET에 `System.Diagnostics.Activity`와 OpenTelemetry SDK 내장. 외부 백엔드는 선택사항.

### 참고

- AG2 Telemetry: https://docs.ag2.ai/latest/docs/beta/telemetry/
- AgentWeave: https://github.com/arniesaha/agentweave
- OpenTelemetry GenAI Semantic Conventions: https://zylos.ai/research/2026-02-28-opentelemetry-ai-agent-observability


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `Program.cs`, `AuditLogger.cs`
- **신규 파일**: `TelemetryTracer.cs`
- **구현 방향**: .NET 내장 `System.Diagnostics.Activity`를 적극 활용합니다. `Program.cs`에 `AddOpenTelemetry()`를 설정하고, LLM 호출부 및 도구 실행부에 `ActivitySource.StartActivity()`를 래핑합니다. 토큰 사용량(`gen_ai.usage.input_tokens`)과 레이턴시를 태그(Tag)로 기록하여 OTLP로 내보냅니다.

---

## 추천 기능 10: 스마트 모델 라우팅 게이트웨이 (Multi-Model Cascade Router)

### 가치: ⭐⭐⭐⭐

### 상태: ✅ 1차 구현

- `ModelRoutingReadinessPolicy`가 LLM 입력을 `simple`, `moderate`, `complex`로 분류한다.
- 입력 token estimate, intent signal, 추천 tier(`economy`, `balanced`, `frontier`), cascade 후보 여부를 산출한다.
- `TelemetryTraceEvent`에 `modelRouting*` 필드로 기록해 비용/라우팅 패널에서 관찰할 수 있게 했다.
- 실제 provider/model 자동 변경, cascade 재시도, 품질 판정 기반 escalation은 아직 적용하지 않았다. 기존 사용자 선택과 provider chain 동작은 그대로 유지한다.

### 문제

현재 LLM 호출이 단일 모델로 고정되거나 수동 선택. 간단한 분류/포매팅 작업에도 고가의 프론티어 모델 사용. 50-70%의 요청이 가장 저렴한 모델로 처리 가능함에도 불구하고.

### 경쟁사 구현

- **FrugalGPT (Stanford)**: Cascade routing으로 최대 98% 비용 절감. 저렴한 모델 → 실패 시 고급 모델로 에스컬레이션.
- **RouteLLM (UC Berkeley)**: Matrix factorization 분류기로 MT-Bench에서 85% 비용 절감.
- **Amazon Bedrock IPR**: 프롬프트별 품질 예측으로 60% 절감.
- **Cloudflare Workers AI**: Prefix caching + session affinity 헤더로 캐시 적중률 극대화.

### 구체적 스펙

1. 작업 복잡도 분류기 (간단/중간/복잡)
   - 간단: 분류, 추출, 포맷팅, 유효성 검사 → Haiku/Flash-lite급
   - 중간: 요약, 구조화된 추론, 간단한 코드 생성 → Sonnet/GPT-4o급
   - 복잡: 다단계 추론, 아키텍처 설계, 모호한 문제 → Opus/Gemini Pro급
2. Cascade 패턴: 저렴한 모델 먼저 시도 → 신뢰도 낮으면 자동 에스컬레이션
3. Prompt caching: 정적 프리픽스(시스템 프롬프트, 스킬 정의)를 캐시하여 입력 토큰 비용 60-70% 절감
4. Provider failover: Anthropic 장애 시 → OpenAI → Gemini 자동 전환
5. 세션 단위 비용 추적 (기능 9와 연동)

### 예상 절감 효과

| 기법 | 절감률 |
|---|---|
| Cascade routing | 40-70% |
| Prompt caching | 60-70% (캐시된 입력 토큰) |
| 병행 적용 시 | 85-90% |

### 구현 난이도

중. 기존 `CommandService.ProviderRouting.cs` 확장. 외부 의존성 없음.

### 참고

- FrugalGPT: Stanford/TMLR 2024
- RouteLLM: UC Berkeley 2024
- Multi-Model Routing Guide: https://akshayghalme.com/blogs/multi-model-routing-ai-gateway-pattern/
- LLM Cost Optimization: https://dev.to/omnithium/llm-cost-optimization-for-agent-workflows-a-practical-guide-49c1


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `ProviderModelSelectionPolicy.cs`, `LlmRouter.cs`
- **신규 파일**: `ModelCascadeRouter.cs`
- **구현 방향**: 사용자 입력의 복잡도(예: 정규식, 텍스트 길이, 프롬프트 의도)를 1차 판단하여 단순 작업은 저렴한 모델(Claude 3.5 Haiku 등)로 우선 할당합니다. JSON 파싱 에러나 결과 품질 미달 시 상위 모델(Opus)로 자동 에스컬레이션(Cascade) 재시도합니다.

---

## 추천 기능 11: 계층적 메모리 아키텍처 (Tiered Memory System)

### 가치: ⭐⭐⭐⭐

### 상태: ✅ 1차 구현

- SQLite `chunks` 테이블에 `last_accessed_at`, `memory_tier` 컬럼을 추가했다.
- `MemoryIndexDocumentSync`가 문서 mtime 기준으로 `working`, `short_term`, `episodic`, `long_term` 계층을 저장한다.
- `MemorySearchTool`이 BM25 점수에 계층/시간 confidence를 적용하고, long-term 결과도 floor 이하로 사라지지 않게 보정한다.
- WebSocket `memory_search_result.results[]`에 `memoryTier`, `lastAccessedAtUnixMs`를 내려 프론트에서 계층 배지/정렬 설명을 붙일 수 있다.
- 실제 접근 이벤트 기반 갱신, cascading retrieval, ADR 저장소, vector/semantic memory는 별도 단계로 둔다.

### 문제

현재 `MemoryIndexDocumentSync`는 평면적인 FTS 인덱스. 최근 코드는 빠르게 찾지만, 6개월 이상 된 코드는 사실상 검색 불가 (Temporal Event Horizon). 컨텍스트 윈도우가 늘어나도 외부 메모리 없이는 세션 간 지식 유지 불가.

### 경쟁사 구현

- **D3 Adaptive Memory (Blankline)**: Working/Short-term/Episodic/Long-term 4계층 메모리. Logarithmic Floor Function으로 6개월+ 레거시 코드 88.7% recall 달성 (기존 12.4%).
- **MemCoder (arXiv 2603.13258)**: 커밋 히스토리에서 intent-to-code 매핑을 추출해 장기 메모리에 저장. SWE-bench에서 SOTA + 9.4% 개선.
- **Cortex**: 신경과학 기반 persistent memory. Hippocampal Replay로 컨텍스트 압축 전후 상태 복원. BEAM-10M 벤치마크에서 33.4% 개선.
- **DevContext Engine**: 프로젝트 지식 그래프 + 아키텍처 결정 기록 + 하이브리드 검색.
- **CodeRAG**: Tree-sitter AST 파싱 → 자연어 보강 → 하이브리드 검색(BM25 + 벡터) → 토큰 버젯 최적화.

### 구체적 스펙

1. **Working Memory** (τ < 1시간): 현재 세션의 활성 파일. Confidence 1.0
2. **Short-term Memory** (τ < 24시간): 오늘 접근한 파일. Confidence 0.95
3. **Episodic Memory** (τ < 7일): 스프린트 관련 코드. Confidence 0.9
4. **Long-term Memory** (τ > 7일): 과거 코드베이스. Confidence decays but never below floor
5. Logarithmic Floor: `max(e^(-λt), Floor(N))` — 오래된 코드도 의미적 유사도가 충분하면 항상 검색 가능
6. 기존 SQLite FTS를 확장하여 계층 컬럼과 타임스탬프 추가
7. Cascading Retrieval: Working Memory(50ms) → Short-term(200ms) → Deep Archive(500ms)
8. 아키텍처 결정 기록 (ADR) 저장소 — "왜 이 구조를 선택했는지" 기록

### 구현 난이도

높음. 기존 FTS를 계층적으로 확장. 임베딩은 선택사항 (FTS만으로도 계층 효과 있음).

### 참고

- D3 Adaptive Memory: https://blankline.org/research/beyond-retrieval-augmented-generation-how-we-solved-the-temporal-event-horizon-problem
- MemCoder: https://www.arxiv.org/pdf/2603.13258
- Cortex: https://github.com/cdeust/cortex
- CodeRAG: https://github.com/maciek-O-digiaidev/CodeRAG
- Memory for Autonomous LLM Agents (Survey): https://arxiv.org/html/2603.07670v1


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `MemoryIndexDocumentSync.cs`, `MemorySearchTool.cs`
- **구현 방향**: SQLite `chunks` 테이블에 `last_accessed_at` (마지막 접근 시간) 및 `memory_tier` 컬럼을 추가합니다. `MemorySearchTool`에서 검색 시 시간에 따른 감쇠 곡선(Logarithmic Floor) 공식 가중치를 `bm25()` 점수에 곱해 오래된 코드는 패널티를 주되 완전히 사라지진 않게 정렬합니다.

---

## 추천 기능 12: 에이전트 세션 리플레이 & 디버깅 (Session Replay & Debugging)

### 가치: ⭐⭐⭐

### 상태: ✅ 1차 구현

- `SessionReplayApplicationService`가 기존 `ConversationStore`, `TelemetryApplicationService`, `AgentCommunicationApplicationService`를 조합해 세션 타임라인을 생성한다.
- `WsSessionReplayCommandDispatcher`가 `session_replay_get` WebSocket 요청을 처리한다.
- 원문 프롬프트/응답을 별도 저장소에 중복 저장하지 않고, 기존 conversation 메시지와 safe telemetry metadata를 읽어 반환한다.
- telemetry는 아직 conversationId를 직접 갖지 않으므로, conversation 시간창과 겹치는 LLM 호출만 `correlation=conversation_window`로 표시한다.
- SQLite append-only 전체 결정 트리와 실시간 스트리밍은 다음 단계로 둔다.

### 문제

에이전트가 실패했을 때 왜 실패했는지 추적 불가. 토큰 사용, LLM 응답, 툴 호출, 컨텍스트 상태가 로그에 흩어져 있음.

### 구체적 스펙

1. 에이전트 세션의 전체 결정 트리를 SQLite에 기록
2. 각 스텝: 입력 프롬프트, LLM 응답, 툴 호출과 결과, 토큰 사용량, 타임스탬프
3. 세션 타임라인 뷰 — 시간순으로 전체 흐름을 재생
4. 실패 지점 자동 하이라이트 (에러 응답, 재시도, 롤백 발생 지점)
5. WebSocket으로 실시간 스트리밍 + 종료 후 리플레이
6. 기능 9(OTel)의 span 데이터를 리플레이 소스로 활용

### 구현 난이도

중. 기존 `FileRunArtifactStore` 패턴 확장.


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `ConversationStore.cs`
- **신규 파일**: `SessionReplayStore.cs`
- **구현 방향**: LLM 입력/출력, 툴 호출, 롤백 등 주요 이벤트 발생 시 마다 JSON 형태로 `SessionReplayStore`에 Append-only로 기록합니다. 프론트엔드 대시보드에서 타임라인 애니메이션으로 재생할 수 있도록 WebSocket 스트리밍 엔드포인트를 추가합니다.

---

## 추천 기능 13: 에이전트 권한 샌드박스 강화 (Hardened Sandbox)

### 가치: ⭐⭐⭐

### 상태: ✅ 1차 구현 / OS 샌드박스 본도입 보류

- `UniversalCodeExecutionSafetyPolicy`가 shell script 실행 전 위험 패턴을 검사한다.
- `UniversalCodeRunner`의 `bash` 및 unknown-language fallback 실행은 preflight에서 차단될 수 있다.
- 차단 대상은 기존 코딩 루프 안전 정책과 같은 파괴적 명령(`rm -rf`), bootstrap pipe(`curl|sh`, `wget|bash`), 워크스페이스 밖 절대경로 write 등이다.
- 차단 시 코드는 run directory에 저장하되 shell은 실행하지 않고 `CodeExecutionResult.Status=blocked`, `ExitCode=126`을 반환한다.
- macOS `sandbox-exec`, Linux namespace/cgroup, 네트워크 격리, Python/Node/C/C++ 세부 syscall 제한은 플랫폼별 리스크가 커서 다음 단계로 둔다.

### 문제

현재 `UniversalCodeRunner`가 `resource.setrlimit`만으로 Python을 실행. C/C++/Java/Rust는 네이티브 바이너리 실행에 네트워크/파일시스템 격리 없음. 프로세스 관리(BrowserTool)도 Kill/Dispose 없음.

### 경쟁사 구현

- **Centaur (Paradigm)**: 각 에이전트 세션에 전용 샌드박스 컨테이너 할당. 내부 전용 네트워크. 리소스 제한.
- **Open SWE**: Pluggable sandbox backend (Modal, Daytona, Runloop). 컨테이너 기반 격리.
- **Coder**: 워크스페이스 데몬 HTTP API로 명령 실행. 에이전트는 직접 셸에 접근하지 않음.

### 구체적 스펙

1. 실행 가능한 명령 화이트리스트 (기본: 읽기/쓰기/빌드/테스트, 차단: `rm -rf /`, 네트워크 접근 등)
2. 프로세스 리소스 제한: CPU 시간, 메모리, 파일 디스크립터 상한
3. 네트워크 격리: 외부 접근 필요 시 명시적 허용 정책
4. 파일시스템 격리: 워크스페이스 외부 쓰기 차단
5. 실행 로그: 모든 프로세스의 stdout/stderr를 캡처하여 저장
6. macOS에서는 `sandbox-exec` (Seatbelt), Linux에서는 `namespaces`/`cgroups` 활용

### 구현 난이도

높음. OS별 샌드박스 API 차이. 하지만 점진적 강화 가능 (화이트리스트부터 시작).


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `UniversalCodeRunner.cs`, `PythonSandboxClient.cs`
- **구현 방향**: 에이전트가 생성한 코드를 실행할 때 OS 레벨의 샌드박스를 강제합니다. macOS의 경우 `sandbox-exec -f profile.sb`로 프로세스를 래핑하고, Linux 계열은 Bubblewrap(`bwrap`)이나 `cgroups`를 사용하여 외부 네트워크 통신 및 워크스페이스 밖의 파일시스템 접근을 차단합니다.

---

## 추천 기능 14: 커밋 히스토리 기반 학습 (Commit-Driven Learning)

### 가치: ⭐⭐⭐

### 문제

에이전트가 같은 실수를 반복. 과거 커밋에서 개발자가 어떻게 문제를 해결했는지 학습 메커니즘 없음.

### 경쟁사 구현

- **MemCoder**: 커밋 히스토리에서 intent-to-code 매핑을 추출해 장기 메모리에 저장. 인간이 검증한 솔루션을 자동으로 내재화.
- **Cortex**: Nightly reflection — 매일 밤 자신의 성과를 검토하고 스킬/툴을 자동 개선.

### 구체적 스펙

1. `git log --diff-filter=M`으로 최근 커밋의 변경 패턴을 분석
2. 변경 의도를 LLM으로 추론 (bug fix, feature, refactor, performance 등)
3. intent → code change 매핑을 메모리에 저장
4. 동일한 패턴의 문제가 발생하면 과거 해결 방법을 컨텍스트에 자동 주입
5. 기능 11 (계층적 메모리)과 연동
6. 루틴/크론으로 매일 밤 실행 (기존 `RoutineSchedulePolicy` 활용)

### 구현 난이도

중. git CLI + LLM 요약. 외부 의존성 없음.


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `RoutineSchedulePolicy.cs`
- **신규 파일**: `CommitPatternLearner.cs`
- **구현 방향**: 야간 배치(Nightly Routine)로 `git log -p`를 읽어 최근 버그 픽스 내역을 가져옵니다. LLM이 "이 개발자가 자주 하는 실수와 수정 패턴"을 분석하게 한 뒤, 그 인사이트를 `SKILL.md`나 시스템 프롬프트용 캐시 파일에 자동 주입하여 스스로 학습하게 만듭니다.

---

## 추천 기능 15: 프롬프트 캐싱 최적화 (Prompt Cache Manager)

### 가치: ⭐⭐⭐

### 상태: ✅ 1차 구현

- `PromptCachePolicy`가 LLM 입력에서 `사용자 입력:` 등 안정적인 marker 앞의 정적 프리픽스를 추출한다.
- 정적 프리픽스 hash 기반 `promptCacheKey`와 provider/model 단위 `promptCacheAffinityKey`를 생성한다.
- `TelemetryTraceEvent`에 cache eligibility, static prefix chars/tokens, strategy/reason을 기록한다.
- 실제 provider cache API 호출은 아직 하지 않는다. Anthropic/Gemini/OpenAI 계열의 계약 차이와 비용 정책을 분리 설계한 뒤 적용한다.

### 문제

시스템 프롬프트, 스킬 정의, AGENTS.md 등 정적 컨텍스트를 매 요청마다 재전송. 동일한 프리픽스에 대해 캐시 활용 없음. 입력 토큰 비용의 60-70%가 캐시 가능한 정적 프리픽스.

### 경쟁사 구현

- **Anthropic**: 1,024 토큰 이상 프롬프트 자동 캐싱. 캐시된 토큰은 정상 요금의 ~10%.
- **OpenAI**: 캐시된 입력 토큰 50% 할인.
- **Google Gemini**: 명시적 TTL 관리로 컨텍스트 캐싱.
- **Cloudflare**: Session affinity 헤더로 캐시 적중률 극대화.

### 구체적 스펙

1. 프롬프트를 정적 프리픽스와 동적 서픽스로 분리
2. 정적 프리픽스: 시스템 프롬프트 + 스킬 정의 + AGENTS.md + 세션 규칙
3. 동적 서픽스: 사용자 메시지 + 검색 결과 + 최근 대화
4. 세션 ID 기반 세션 어피니티 — 같은 세션은 같은 캐시 활용
5. 프리픽스 변경 시 캐시 무효화 (버전 관리)
6. 캐시 적중률 메트릭을 기능 9(OTel)로 추적

### 예상 절감

- 입력 토큰 비용 60-70% 절감 (캐시된 프리픽스 부분)
- Time-to-First-Token 감소 (프리픽스 prefill 생략)

### 구현 난이도

낮음. 프롬프트 빌더 수정만으로 적용 가능. Provider별 캐시 API 차이는 어댑터로 추상화.

### 참고

- Anthropic Prompt Caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Cloudflare Session Affinity: https://blog.cloudflare.com/workers-ai-large-models/


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `CommandService.Chat.cs`, `ProviderChatAdapter.cs`
- **구현 방향**: Anthropic 및 OpenAI API 호출 시, 변하지 않는 정적 텍스트(시스템 프롬프트, AGENTS.md 등) 덩어리를 묶어서 `ephemeral` 캐시 컨트롤 헤더를 삽입하도록 메시지 빌더 패턴을 수정합니다. 이를 통해 입력 토큰 비용을 최대 70%까지 방어합니다.

---

## 추천 기능 16: Tree-sitter(AST) 기반 지식 그래프 및 지능형 청킹 (Code Knowledge Graph)

### 가치: ⭐⭐⭐⭐⭐ — **핵심 RAG 아키텍처로 격상 (최우선 도입)**

### 상태: ✅ 1차 구현 / Tree-sitter 본도입 보류

- `MemoryChunkingPolicy`를 추가해 프로젝트 코드 파일의 chunk plan을 `MemoryIndexDocumentSync` 밖으로 분리했다.
- C#, JS/MJS, TS/TSX, Python 파일은 선언 경계(class/interface/function/method/constructor)를 기준으로 chunk를 나눈다.
- memory note와 conversation 문서는 기존 sliding window 청킹을 유지한다.
- 큰 선언 블록은 기존 max token/overlap 기준으로 fallback split한다.
- 실제 Tree-sitter 파서, 다언어 AST node 추출, Repomap 생성/프롬프트 주입은 외부 패키지와 언어별 grammar 검증이 필요해 다음 단계로 둔다.

### 문제

현재 `MemoryIndexDocumentSync`는 텍스트를 무식하게 라인 수(N줄) 단위로 자르고(Chunking) 있어, 함수나 클래스의 중간이 잘려나가는 치명적 문제가 있습니다. FTS가 검색을 해와도 위아래 맥락이 잘린 코드가 LLM에 전달됩니다.

### 구체적 스펙 (3단계 하이브리드 RAG 아키텍처)

1. **지능형 청킹 (Write Phase)**
   - Tree-sitter 파서를 도입하여 소스 코드를 AST로 분석.
   - 라인 수가 아닌 **클래스, 메서드(함수)** 단위로 정확하게 코드를 발라내어 청크(Chunk) 생성.
   - 발라낸 청크를 기존 SQLite `chunks` 및 `chunks_fts`에 Insert.
2. **초고속 검색 (Read Phase)**
   - 검색은 기존 FTS5(BM25) 엔진을 100% 그대로 활용. (수정 불필요)
   - BM25가 매칭을 찾으면, Tree-sitter가 예쁘게 잘라둔 '온전한 함수 전체'가 반환됨.
3. **Repomap 주입 (Context Phase)**
   - Tree-sitter로 파일의 알맹이를 뺀 구조적 뼈대(함수명/클래스명 시그니처)만 추출하여 **'코드베이스 지도(Repomap)'** 생성.
   - LLM 프롬프트 최상단에 Repomap을 주입하여 전체 아키텍처 시야 확보 (Aider 방식).

### 구현 난이도

높음. .NET에서 Tree-sitter 바인딩(`TreeSitterBindings`) 구성 및 언어별 파서 적용 필요. 하지만 FTS5 엔진을 그대로 쓰기 때문에 검색단 로직은 건드릴 필요가 없어 깔끔하게 이식 가능.


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `MemoryIndexDocumentSync.cs`
- **신규 파일**: `TreeSitterParserService.cs`, `RepomapGenerator.cs`
- **참고 패키지**: `TreeSitterBindings` (NuGet)
- **구현 방향**: 기존의 라인 단위 무식한 청킹(N줄 자르기) 로직을 폐기합니다. `TreeSitterParserService`를 통해 코드를 파싱하고, 클래스와 메서드(함수) 단위로 정확히 분할하여 SQLite에 저장합니다. `RepomapGenerator`는 파일의 뼈대(시그니처)만 추출하여 LLM 프롬프트 상단에 '코드 지도'로 주입합니다.

---



---

## 분석 근거

### 에이전트 오케스트레이션

- Sema Code (2026): 에이전트 엔진과 클라이언트 레이어 분리, 적응형 컨텍스트 압축, 멀티 테넌트 격리
- SPOQ (2026): Wave-based dispatch, dual validation gates, Human-as-Agent, 3-tier 에이전트 계층
- Centaur / Paradigm (2026): Durable workflow, 셀프 힐링, 크리덴셜 프록시, Nightly 자기 개선
- Open SWE / LangChain (2026): 서브에이전트 오케스트레이션, 미들웨어 훅, 자동 PR
- amux (2026): 5-레이어 오케스트레이션 스택, 인터-에이전트 REST API, atomic task board

### 옵저버빌리티 & 비용 최적화

- AG2 Telemetry (2026): OpenTelemetry GenAI Semantic Conventions, W3C Trace Context 전파
- AgentWeave (2026): PROV-O provenance + OTel, 에이전트 위임 체인 추적
- AgentOrbit (2026): 프록시 기반 제로코드 옵저버빌리티, 실시간 대시보드
- FrugalGPT (Stanford 2024): Cascade routing, 최대 98% 비용 절감
- RouteLLM (UC Berkeley 2024): Matrix factorization 분류기, 85% 절감
- LLM Cost Optimization (2026): 모델 라우팅 40-70%, 프롬프트 캐싱 60-70%, 병행 시 85-90%

### 메모리 & 컨텍스트

- D3 Adaptive Memory (Blankline 2026): 4계층 메모리, Logarithmic Floor, 레거시 코드 88.7% recall
- MemCoder (arXiv 2603.13258): 커밋 기반 학습, SWE-bench SOTA + 9.4%
- Cortex (2026): 신경과학 기반 persistent memory, Hippocampal Replay, BEAM-10M +33.4%
- DevContext Engine (2026): 프로젝트 지식 그래프, 아키텍처 결정 기록
- CodeRAG (2026): Tree-sitter AST, 하이브리드 검색, 토큰 버젯 최적화
- Memory Survey (arXiv 2603.07670): write-manage-read 루프, 5가지 메커니즘 패밀리 분석

### IDE & 코딩 도구

- Cursor (2025-2026): 시맨틱 인덱싱, Merkle tree 증분 동기화, 12.5% 정확도 향상
- Windsurf (2025-2026): SWE-grep 빠른 컨텍스트, MCP 전면 도입, 로컬 인덱싱

### 코드 RAG 연구

- Practical Code RAG (arXiv 2510.20609): PL→PL은 BM25가 dense보다 우수, 청크 크기는 컨텍스트 윈도우에 비례

---

# Phase 6 이후 신규 기획 9선 — 심층 분석 및 확장 후보

> develop.md "6. 향후 확장 마일스톤"의 9개 기획을 분석하고, 업계 동향/경쟁사/논문을 기반으로 구체적 구현 방향과 추가 아이디어를 도출.

---

## Phase 6-1: 터미널 자율 디버깅 에이전트 (Terminal Integration)

### develop.md 원문

> 샌드박스가 아닌 호스트 터미널 세션(pty)을 제어하여 빌드, 실행, 에러 분석(stderr), 코드 자동 수정 루프를 자율적으로 수행하는 `Terminal Node` 도입.

### 경쟁사/연구 현황

- **Coder agent-tty (2026)**: CLI-first PTY 자동화. `node-pty` 기반 장기 세션, semantic snapshot, PNG 스크린샷, asciicast 녹화. AI 에이전트가 터미널을 "검사 가능한(inspectable)" 환경으로 다룸.
- **PiloTY (2025)**: MCP 서버 기반 PTY 제어. AI 에이전트가 `send_line`, `wait_for_regex`, `snapshot_screen` 등으로 실제 터미널을 조작. SSH 세션, REPL, 대화형 프롬프트까지 제어 가능.
- **tttt (2026)**: Rust 기반 터미널 멀티플렉서. PTY 세션 관리 + MCP 툴 + 패턴 기반 알림 + live reload. Claude Opus가 Sonnet 워커를 PTY로 오케스트레이션.
- **Dagger Self-Healing CI (2025)**: 빌드 실패 → 로그 분석 → 코드 수정 → 테스트 재실행 → PR 제안의 완전 자동 루프.
- **Velo (2026)**: LangGraph 기반 자율 CI/CD 힐링 에이전트. GitHub Actions 실패 시 자동으로 원인 분석, 수정 PR 생성. 평균 복구 시간 30-60분 → 3분.
- **PhantomRun (arXiv 2602.20284)**: CI 컴파일 실패를 LLM으로 자동 수리. 임베디드 환경에서 최대 45% 성공률.
- **EvidenT (Microsoft 2026)**: 시스템 레벨 빌드 실패 자동 수리 프레임워크. 53.88% 수리 성공률 (기존 대비 33% 개선).

### 구체적 구현 방향

1. **PTY 세션 매니저**: `System.Diagnostics.Process`로 PTY 세션 생성, stdin/stdout/stderr 스트림 제어
2. **에러 파서**: 빌드 에러(stderr)를 정규식/LLM으로 구조화 — 파일 경로, 라인 번호, 에러 타입 추출
3. **자율 수정 루프**: 에러 발생 → 원인 분석 → 코드 수정 → 재빌드 → 성공/실패 판정 (최대 5회)
4. **로그 캡처**: 모든 PTY 출력을 SQLite에 append-only로 저장 (재생 가능)
5. **WebSocket 스트리밍**: 터미널 출력을 실시간으로 UI에 전달
6. **안전 장치**: `rm -rf /` 등 파괴적 명령 차단, 타임아웃, 최대 재시도 횟수

### 추가 아이디어

- **CI/CD 훅**: GitHub Actions/GitLab CI 웹훅을 수신하여 실패 시 자동으로 디버깅 에이전트 활성화 (Velo 패턴)
- **과거 에러 학습**: 동일한 에러 패턴이 재발하면 과거 해결 이력을 자동 주입
- **터미널 상태 분류**: `running`, `ready`, `password`, `confirm`, `repl`, `editor` 등 터미널 상태를 자동 감지 (PiloTY 패턴)


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `WsRoutineCommandDispatcher.cs`
- **신규 파일**: `PtySessionManager.cs`, `TerminalDebuggerPolicy.cs`
- **구현 방향**: .NET `Process` 클래스로 백그라운드 터미널(PTY) 세션을 유지하고 `stdout/stderr`를 비동기로 스트리밍합니다. 빌드 에러가 감지되면 `TerminalDebuggerPolicy`가 즉시 개입하여 에러를 분석하고 파일을 수정한 뒤 자율적으로 루프를 돕니다.

---

## Phase 6-2: 완전 오프라인 프라이버시 모드 (Local LLM 연동)

### develop.md 원문

> 외부 인터넷 통신을 100% 차단하고 Ollama, LM Studio 등 OpenAI-compatible 로컬 엔드포인트를 연결하여 완벽한 오프라인 보안 코딩 환경 구축.

### 경쟁사 현황

- **offcode (2026)**: 100% 오프라인 Rust 코딩 에이전트. Ollama 전용. `--no-web` 플래그로 완전 차단.
- **Sovereign (2026)**: 하드웨어 자동 감지 + SafeLoad(OOM 방지). RAM/VRAM에 맞는 모델 자동 선택.
- **mita-code (2026)**: 로컬 RAG(LanceDB) + MCP 플러그인 + Tree-sitter. 오프라인에서도 시맨틱 검색 동작.
- **nexus-dispatch (NXD, 2026)**: 완전 오프라인 멀티 에이전트 오케스트레이션. Ollama로 Tech Lead/Senior/Junior/QA 역할 분담. Wave-based 병렬 실행.
- **OllamaDev (2026)**: 153KB PHP 바이너리. 명명된 세션 관리. Ollama/LM Studio 모두 지원.
- **local-cli-agent (2026)**: Watch 모드 — 파일 변경 시 자동으로 에이전트 트리거. 오프라인 TDD 지원.

### 구체적 구현 방향

1. **Provider 추상화**: 기존 LLM 호출부에 `ILlmProvider` 인터페이스 도입
   - `CloudLlmProvider`: 기존 OpenAI/Anthropic/Gemini
   - `LocalLlmProvider`: `http://localhost:11434/v1/chat/completions` (Ollama) 또는 `http://localhost:1234/v1/chat/completions` (LM Studio)
2. **오프라인 감지**: 외부 API 호출 실패 시 자동으로 로컬 엔드포인트로 폴백
3. **모델 자동 탐지**: Ollama `GET /api/tags`로 설치된 모델 목록 조회
4. **하드웨어 적응**: VRAM/RAM에 따라 추천 모델 변경
   - 24GB+: `qwen3-coder:30b` (리뷰어) + `gemma4:e4b` (코더)
   - 16GB: `qwen2.5-coder:14b` + `gemma4:e4b`
   - 8GB: `gemma4:e4b` (단일 모델)
5. **오프라인 인덱싱**: 기존 `MemoryIndexDocumentSync` FTS는 이미 로컬이므로 그대로 동작
6. **트래픽 차단**: `RuntimeOptions.OfflineMode` 플래그로 외부 HTTP 요청 전체 차단

### 추가 아이디어

- **하이브리드 모드**: 간단한 작업은 로컬 모델, 복잡한 작업은 클라우드로 자동 라우팅 (기능 10 스마트 라우팅과 연동)
- **로컬 RAG**: 오프라인에서도 시맨틱 검색이 동작하도록 로컬 임베딩 모델(`nomic-embed-text`) 활용
- **모델 웜업**: 미들웨어 시작 시 Ollama 모델을 사전 로드하여 첫 응답 지연 최소화


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `ProviderRegistry.cs`, `RuntimeSettings.cs`
- **신규 파일**: `LocalOllamaProvider.cs`
- **구현 방향**: `RuntimeSettings.OfflineMode` 플래그가 활성화되면 OpenAI/Anthropic 프로바이더 로드를 건너뛰고, `LocalOllamaProvider`(`http://localhost:11434`)만 툴 레지스트리에 강제 매핑하여 100% 트래픽 망분리 환경을 구축합니다.

---

## Phase 6-3: AST 기반 하이브리드 RAG (지능형 메모리)

### develop.md 원문

> Tauri SQLite에 Vector Search 확장(`sqlite-vec`)을 결합하여, 과거 대화 및 코딩 이력을 임베딩하고 자연어(Semantic Search)로 즉시 복원.

### 관련 기능 (이미 문서에 포함)

- **기능 16**: Tree-sitter(AST) 기반 지식 그래프 및 지능형 청킹 (최우선 도입)
- **기능 7**: 시맨틱 검색 (Ollama Embed API) — 역할 축소 및 후순위 연기
- **기능 11**: 계층적 메모리 — 4계층 + Logarithmic Floor

### 구현 전략 (아키텍처 확정 - 2026-06-04)

| 대안 | 판정 | 사유 |
|---|---|---|
| **Tree-sitter(AST) 도입** | ✅ **핵심** | 클래스/함수 단위 지능형 청킹 및 Repomap 생성. AI 코드 파악의 핵심 |
| **기존 FTS5(BM25) 유지** | ✅ **기본값** | 코드 검색은 BM25가 dense보다 우수함. AST 청킹과 결합 시 시너지 극대화 |
| Ollama embed API | ⚠️ 보류 | 무거운 벡터 연산. 추후 자연어 쿼리(과거 대화/기획 문서) 검색에만 제한적 사용 |
| ONNX / Rust Candle | ❌ 기각 | 빌드 복잡도 증가, 용량 폭증, 아키텍처 원칙 위반 |

### 추가 아이디어

- **Repomap 기반 프롬프트 주입**: 파일 전체가 아닌 AST로 요약된 구조도만 AI에게 주입하여 컨텍스트 낭비 방지
- **청킹 전략 분리**: 코드 파일은 Tree-sitter + FTS5로 검색. 기획 문서/채팅 로그는 훗날 임베딩으로 검색

---

## Phase 6-4: Git 단위 타임머신 기능 (작업 롤백 자동화)

### develop.md 원문

> AI의 광범위한 코드 수정 이벤트를 백그라운드 `git commit`으로 자동 스냅샷화하여, 대시보드에서 원클릭 롤백(Undo) 지원.

### 관련 기능 (이미 문서에 포함)

- **기능 5**: 자동 커밋/PR 생성

### 추가 아이디어

- **의미 있는 커밋 메시지**: 단순 "auto snapshot"이 아닌, LLM이 변경 내용을 요약한 커밋 메시지 (예: "refactor: CommandService partial 분리 — 인터페이스 추출")
- **체크포인트 브랜치**: `snapshots/` 네임스페이스 아래에 체크포인트 커밋을 저장. 메인 브랜치 히스토리 오염 방지
- **Diff 뷰어**: 두 체크포인트 간 diff를 WebSocket으로 UI에 스트리밍
- **자동 가비지 컬렉션**: N일 이상 된 체크포인트 브랜치 자동 삭제
- **롤백 충돌 감지**: 롤백 대상 이후에 수동 커밋이 있으면 경고 (덮어쓰기 방지)


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `AgentSpawnWorkspaceRollbackPolicy.cs`
- **신규 파일**: `GitTimeMachineService.cs`
- **구현 방향**: 에이전트의 대규모 파일 수정 전후로 `git commit -m "omni-snapshot"`을 은밀히 백그라운드 실행합니다. UI의 타임머신 인터페이스에서 특정 스냅샷을 선택하면 `git reset --hard` 및 `clean -fd`를 수행하여 완벽하게 이전 상태로 되돌립니다.

---

## Phase 6-5: 다중 모달(Vision) 클립보드 직결

### develop.md 원문

> 바탕화면의 이점을 살려 클립보드 이미지(UI 스크린샷 등)를 직접 읽어들여 클론 코딩 스캐폴딩을 즉시 수행하는 Vision 파이프라인.

### 경쟁사 현황

- **screenshot-to-code (abi, 2023-2026)**: 스크린샷 → HTML/Tailwind/React/Vue 코드 변환. GPT-5.5, Claude Opus 4.6+ 등 최신 모델 지원.
- **One-Click Clone (2026)**: 브라우저 자동화로 웹사이트를 완전 클론. 에셋 다운로드, 정확한 CSS 추출, 섹션별 병렬 AI 에이전트 코딩. 70-80% 충실도.
- **ui-from-image (Ixe1, 2026)**: Codex 스킬로 고충실도 UI 복원. 검증 패스(타이포그래피, 간격, 아이콘, 레이아웃) 내장.
- **UI2Code^N (zai-org, 2025)**: VLM 기반 UI-to-code. 생성 → 편집 → 폴리싱의 반복 루프. Claude-4-Sonnet, Gemini-2.5-pro 수준 성능.
- **ScreenCoder (2025)**: 모듈형 멀티 에이전트 아키텍처. UI 요소 감지 → 레이아웃 계획 → 코드 생성.
- **AgentLens (2026)**: 브라우저 확장으로 UI 결함을 시각적으로 어노테이션 → MCP로 AI에게 전달 → 자동 수정.
- **ClonePage (2026)**: 원클릭으로 DESIGN.md 생성. 디자인 토큰, 레이아웃 트리, 컴포넌트, 카피, 스크린샷을 추출.

### 구체적 구현 방향

1. **클립보드 감시**: Tauri의 `clipboard-manager` 플러그인으로 이미지 복사 이벤트 감지
2. **이미지 → LLM Vision**: 클립보드 이미지를 Base64로 인코딩하여 LLM Vision API(GPT-4o, Gemini Pro Vision, Claude)에 전송
3. **UI 구조 분석**: LLM이 이미지에서 레이아웃, 컴포넌트, 색상, 타이포그래피를 추출
4. **코드 스캐폴딩**: 분석 결과를 기반으로 HTML/React/Vue 코드 생성
5. **기존 CanvasTool과 연동**: `CanvasTool.cs`의 `a2ui_push`/`a2ui_reset` 메커니즘으로 실시간 프리뷰
6. **반복 개선 루프**: 생성된 코드를 렌더링 → 스크린샷 → 원본과 비교 → 차이점 수정 (UI2Code^N 패턴)

### 추가 아이디어

- **디자인 토큰 추출**: 이미지에서 색상 팔레트, 폰트, 간격을 자동 추출하여 CSS 변수/Design Token으로 저장
- **컴포넌트 분할**: 전체 UI를 개별 컴포넌트로 자동 분할하여 재사용 가능한 코드 생성
- **Figma 연동**: 클립보드뿐 아니라 Figma API에서 직접 디자인을 가져오는 경로도 지원


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `WsAiCommandDispatcher.cs`
- **신규 파일**: `ClipboardVisionTool.cs`
- **구현 방향**: 데스크톱 프론트엔드(Tauri)에서 클립보드 이미지를 가로채 Base64로 인코딩한 뒤 WebSocket으로 백엔드에 쏩니다. 백엔드는 이를 Vision API(Claude 3.5 Sonnet 등) 전용 프롬프트에 실어 넘겨 즉각적인 UI 클론 코딩 스캐폴딩을 시작합니다.

---

## Phase 6-6: MCP 전면 도입 및 생태계 확장

### develop.md 원문

> omnux를 표준 MCP 클라이언트로 격상시켜 수많은 서드파티 오픈소스 툴(Notion, GitHub, Slack 등)을 코드 추가 없이 플러그인 형태로 연결.

### 관련 기능 (이미 문서에 포함)

- **기능 4**: MCP 서버 지원

### 추가 아이디어

- **MCP 서버 자동 발견**: `.omni/mcp.json`뿐 아니라 `.mcp.json`, `.cursor/mcp.json` 등 다른 도구의 설정도 자동 감지
- **MCP 서버 샌드박스**: 서드파티 MCP 서버를 격리된 프로세스에서 실행. 악의적 툴이 메인 프로세스에 영향 주지 않도록
- **MCP 툴 레지스트리**: 설치된 MCP 툴을 통합 관리하는 UI/WS 엔드포인트. 툴 활성화/비활성화, 권한 설정
- **MCP 서버 헬스체크**: 등록된 MCP 서버의 연결 상태를 주기적으로 모니터링


### 개발 가이드 (Implementation Guide)
- **비고**: *상단 추천 기능 4 (MCP 서버 지원) 가이드와 동일하게 구현합니다.*

---

## Phase 6-7: Adaptive Skills (자가 진화 학습 루프)

### develop.md 원문

> 사용자의 코드 피드백과 교정(Correction) 패턴을 백그라운드 AI가 분석하여, `USER_PREFERENCE_SKILL.md`를 스스로 갱신하는 학습 루프 구축.

### 관련 기능 (이미 문서에 포함)

- **기능 14**: 커밋 히스토리 기반 학습

### 추가 아이디어

- **교정 패턴 감지**: 사용자가 AI가 제안한 코드를 수정한 이력을 분석. "AI는 항상 var를 쓰는데 사용자는 명시적 타입을 선호함" 같은 패턴 추출
- **스킬 충돌 감지**: 새로운 학습 내용이 기존 스킬과 모순되면 사용자에게 확인 요청
- **학습 가중치**: 최근 교정일수록 높은 가중치. Ebbinghaus 망각 곡선 적용 (Cortex에서 착안)
- **Nightly reflection**: 매일 밤 미사용/저빈도 스킬을 정리하고, 고빈도 패턴을 스킬로 승격
- **크로스 사용자 학습** (향후): 동일 프로젝트의 여러 사용자 패턴을 익명화하여 집합 지능 형성


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `SkillFileService.cs`
- **구현 방향**: 사용자가 AI 코드를 수정한 `git diff` 이력을 수집하여 백그라운드 LLM에게 "이 사용자의 코딩 취향"을 분석하게 합니다. 결과물을 `.omni/skills/user-preference.md` 파일에 스스로 덮어쓰도록 하여, 에이전트가 점점 사용자의 스타일과 동기화되게 만듭니다.

---

## Phase 6-8: 멀티 에이전트 토론 및 오케스트레이션 시각화

### develop.md 원문

> 기획자, 코더, 리뷰어 등 에이전트 간의 리뷰/반박(Critique) 과정을 단순 로그가 아닌 슬랙 스레드(Thread)나 실시간 애니메이션 UI로 시각화하여 사용자의 개입(Human-in-the-loop)을 극대화.

### 관련 기능 (이미 문서에 포함)

- **기능 2**: 인터-에이전트 메시지 패싱

### 경쟁사 접근법

- **SPOQ**: Human-as-Agent(HaaA) — 인간이 에이전트 계층에 참여. Defect 0.47→0.03 감소.
- **Windsurf Agent Command Center**: Kanban 보드로 로컬/클라우드 에이전트 상태 관리.
- **amux**: SQLite-backed kanban board로 에이전트 간 작업 할당.
- **nexus-dispatch**: Tech Lead/Senior/Junior/QA/Supervisor 역할 분담 + TUI 대시보드.
- **tttt**: 사이드바에 세션 목록 + 메시지 + 업타임 실시간 표시.

### 추가 아이디어 (백엔드 관점)

- **에이전트 역할 정의 시스템**: 기획자(Planner), 코더(Coder), 리뷰어(Reviewer), QA 역할을 YAML/JSON으로 정의. 각 역할에 다른 모델/프롬프트 할당
- **토론 스레드 모델**: 에이전트 간 메시지를 스레드 형태로 저장. WebSocket으로 실시간 스트리밍
- **Critique 프로토콜**: 리뷰어 에이전트가 코더의 결과를 구조화된 형식으로 비폭. 긍정/부정/제안을 분리하여 저장
- **투표/합의 메커니즘**: 여러 에이전트의 의견이 충돌할 때 다수결 또는 가중치 투표로 결정
- **Human-in-the-loop 개입점**: 에이전트 간 합의 불가, 비용 초과, 롤백 필요 시 사용자에게 개입 요청


### 개발 가이드 (Implementation Guide)
- **대상 파일**: `WsConversationMemoryDispatcher.cs`
- **신규 파일**: `MultiAgentTraceBroadcaster.cs`
- **구현 방향**: 백엔드에서 돌아가는 여러 에이전트들의 상태(Plan, Critique, Code)를 구조화된 JSON으로 변환해 `MultiAgentTraceBroadcaster`로 실시간 웹소켓 브로드캐스팅을 합니다. 프론트엔드는 이 데이터를 받아 슬랙 스레드나 칸반 보드 애니메이션으로 멋지게 렌더링합니다.

---

## Phase 6-9: AI 코어 지능 고도화 (AST + RAG + 워크플로우)

### develop.md 원문

> 의미론적 청킹(Semantic Chunking) 및 AST 기반 컨텍스트 최적화 적용, Vector DB를 활용한 완벽한 RAG 검색 고도화, LangGraph 등 최신 에이전틱 워크플로우 전면 도입.

### 관련 기능 (이미 문서에 포함)

- **기능 1**: 컨텍스트 적응형 압축
- **기능 16**: Tree-sitter(AST) 기반 지식 그래프 및 지능형 청킹
- **기능 11**: 계층적 메모리

> **아키텍처 확정 (2026-06-04)**: Vector DB 기반의 RAG는 보류하고, **Tree-sitter(AST) + FTS5 하이브리드 RAG** 구조로 전면 선회합니다. 다언어 지원(C#, TS, Python)을 위해 Tree-sitter 바인딩이 필수적입니다.

### 발전 방향 (AST의 전방위적 활용)

- **AST-aware 트리밍**: 기존의 무식한 `TrimForOutput` 2200자 문자열 자르기를 폐기. AST 노드 단위(함수/클래스 단위)로 트리밍하여 JSON/코드 문법 파괴 원천 차단.
- **Tree-sitter 청킹 (기능 16 연동)**: 파일을 줄 단위가 아닌 함수/클래스/메서드 단위로 정확히 분할.
- **검색 증강 프롬프트**: RAG 결과를 무조건 포함하지 않고, Self-RAG 패턴으로 "검색이 필요한가?"를 LLM이 먼저 판단.
- **LangGraph-style 그래프 실행**: 기존 로직 그래프 런타임을 확장하여, LangGraph의 conditional edge, state channel 개념 도입.


### 개발 가이드 (Implementation Guide)
- **비고**: *상단 추천 기능 1, 11, 16(AST, 계층 메모리, 컨텍스트 압축)의 가이드를 참조하여 통합 구현합니다.*

---



### Phase 6 분석 근거

#### 터미널 자율 디버깅

- Coder agent-tty (2026): https://github.com/coder/agent-tty — PTY-backed inspectable terminal automation
- PiloTY (2025): https://github.com/yiwenlu66/PiloTY — MCP-based PTY control for AI agents
- tttt (2026): https://github.com/ayourtch-llm/tttt — AI agent orchestration harness with PTY sessions
- Dagger Self-Healing CI: https://dagger.io/blog/automate-your-ci-fixes-self-healing-pipelines-with-ai-agents/
- Velo (2026): https://github.com/knoxiboy/Velo — Autonomous CI/CD healing, MTTR 30-60min → 3min
- PhantomRun (arXiv 2602.20284): CI 컴파일 실패 자동 수리, 최대 45% 성공률
- EvidenT (Microsoft 2026): 시스템 레벨 빌드 실패 수리, 53.88% 성공률

#### 오프라인 모드

- offcode (2026): https://github.com/trufae/offcode — 100% 오프라인 Rust 코딩 에이전트
- Sovereign (2026): https://github.com/BrayansStivens/sovereign-sdlc — 하드웨어 적응 + SafeLoad
- nexus-dispatch (2026): https://github.com/tzone85/nexus-dispatch — 오프라인 멀티 에이전트 오케스트레이션
- OllamaDev (2026): https://github.com/kennethyork/ollamadev — 153KB 바이너리, Ollama/LM Studio

#### Vision 클립보드

- screenshot-to-code: https://github.com/abi/screenshot-to-code — 스크린샷 → 코드 변환
- One-Click Clone (2026): https://github.com/CloveSVG/One-Click-Clone — 브라우저 자동화 클론, 70-80% 충실도
- ui-from-image (2026): https://github.com/Ixe1/ui-from-image — 고충실도 UI 복원 Codex 스킬
- UI2Code^N (2025): https://github.com/zai-org/UI2Code_N — VLM 기반 UI-to-code, 생성/편집/폴리싱 루프
- AgentLens (2026): https://github.com/P2K0/agentlens — 브라우저 어노테이션 → MCP → 자동 수정
- ClonePage (2026): Chrome 확장으로 DESIGN.md 자동 생성

#### 멀티 에이전트 오케스트레이션

- SPOQ (arXiv 2606.03115): Human-as-Agent, 3-tier 에이전트 계층
- Windsurf Agent Command Center: https://docs.windsurf.com/windsurf/agent-command-center
- amux (2026): https://amux.io/guides/ai-agent-orchestration-2026/
