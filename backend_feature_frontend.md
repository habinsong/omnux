# 백엔드 기능 프론트엔드 연결 메모

> 2026-06-04 기준. 프론트엔드에서 바로 연결할 수 있도록 새 백엔드 계약과 보류 판단을 기록한다.

## 구현됨: 에이전트 통신 버스

- 후보 문서 항목: 추천 기능 2 `인터-에이전트 메시지 패싱`
- 백엔드 구현:
  - `AgentCommunicationApplicationService`
  - `FileAgentCommunicationStore`
  - `WsAgentCommandDispatcher`
  - 상태 파일: `agent_communication.json`
- 저장 범위:
  - 에이전트 간 메시지
  - 공유 보드
  - 생명주기 이벤트
  - 부모/그룹 명령 메시지
- 현재 안전 정책:
  - `agent_group_command`는 실제 프로세스 정지나 작업 취소를 실행하지 않는다.
  - 명령을 `kind=command` 메시지로 저장해 프론트/상위 오케스트레이터가 확인할 수 있게 한다.

## 구현됨: 컨텍스트 적응형 압축 정책

- 후보 문서 항목: 추천 기능 1 `컨텍스트 적응형 압축`
- 백엔드 구현:
  - `AdaptiveContextCompressionPolicy`
  - 기존 `CommandService.Utils.MaybeCompressConversationAsync` 유지보수 훅 연동
- 트리거:
  - 추정 토큰이 보수적 컨텍스트 윈도우의 70% 이상
  - 또는 `ConversationCompressChars` 문자 임계치 이상
  - 또는 최근 유지 메시지 수 대비 장기 대화 메시지 수 초과
- 저장/노출:
  - 압축 요약은 기존 `MemoryNoteStore`에 저장된다.
  - 대화에는 `meta=auto-compress` 시스템 메시지가 남는다.
  - 시스템 메시지에는 `reason`, `estimated_tokens`, `threshold_tokens`가 포함된다.
  - 프론트는 `get_conversation` 또는 대화 갱신 결과의 `conversation.messages`와 `linkedMemoryNotes`를 보면 압축 여부를 표시할 수 있다.

## 구현됨: LLM telemetry / 토큰 옵저버빌리티

- 후보 문서 항목: 추천 기능 9 `OpenTelemetry 기반 옵저버빌리티`
- 백엔드 구현:
  - `TelemetryTracer`
  - `TelemetryApplicationService`
  - `FileTelemetryTraceStore`
  - `WsTelemetryCommandDispatcher`
  - 상태 파일: `telemetry_traces.json`
- 기록 범위:
  - `CommandService.ProviderRouting`를 통과하는 LLM 호출
  - provider/model/status
  - prompt/completion/total token
  - token usage source(`exact`, `estimated`, `unavailable`)
  - prompt/completion 문자 수
  - max output token
  - streaming 여부
  - durationMs
  - traceId/spanId
  - prompt cache eligibility/key/affinity/static prefix size
- 개인정보/컨텍스트 안전 정책:
  - 프롬프트 원문과 응답 원문은 저장하지 않는다.
  - 실패 상태일 때만 짧은 error 문자열을 저장한다.
  - 최근 2,000개 이벤트만 파일에 유지한다.

## 구현됨: 프롬프트 캐싱 readiness 1차

- 후보 문서 항목: 추천 기능 15 `프롬프트 캐싱 최적화`
- 백엔드 구현:
  - `PromptCachePolicy`
  - `TelemetryLlmCallRequest.PromptCache`
  - `TelemetryTraceEvent` prompt cache 필드
- 동작:
  - LLM 입력에서 `사용자 입력:` / `User request:` / `Current request:` marker 앞의 정적 프리픽스를 추출한다.
  - 정적 프리픽스 hash를 `promptCacheKey`로 기록한다.
  - provider/model/cacheKey 조합을 `promptCacheAffinityKey`로 기록한다.
  - 정적 프리픽스 추정 토큰이 256 토큰 이상이면 `promptCacheEligible=true`로 표시한다.
- 현재 안전 정책:
  - 실제 provider cache API나 요청 body 변경은 하지 않는다.
  - cache key는 hash만 저장하고 프리픽스 원문은 저장하지 않는다.
  - provider별 명시 cache API 적용은 별도 단계로 둔다.

## 구현됨: 스마트 모델 라우팅 readiness 1차

- 후보 문서 항목: 추천 기능 10 `스마트 모델 라우팅 게이트웨이`
- 백엔드 구현:
  - `ModelRoutingReadinessPolicy`
  - `TelemetryLlmCallRequest.ModelRouting`
  - `TelemetryTraceEvent` model routing 필드
- 동작:
  - LLM 입력의 추정 token 수와 키워드 signal을 기준으로 `simple`, `moderate`, `complex`를 산출한다.
  - 추천 tier는 `economy`, `balanced`, `frontier` 중 하나다.
  - `modelRoutingCascadeEligible=true`면 추후 저가 모델 우선 시도 후 escalation 후보로 볼 수 있다.
- 현재 안전 정책:
  - 실제 provider/model 선택은 변경하지 않는다.
  - cascade retry나 품질 판정 escalation도 아직 실행하지 않는다.
  - 프론트는 telemetry 패널에서 관찰/분석용으로만 사용한다.

## 구현됨: 에이전트 active-run watchdog 1차

- 후보 문서 항목: 추천 기능 6 `셀프 힐링 워치독`
- 백엔드 구현:
  - `FileAgentSpawnActiveRunStore.EvaluateWatchdog`
  - `SessionSpawnTool.GetQueueStatus` watchdog 평가/대화 로그 반영
  - `Program.RunAgentWatchdogLoopAsync` 60초 주기 백그라운드 평가
- 감지/전환:
  - `RunTimeoutSeconds`를 초과한 active run은 `state=timeout`으로 종료 처리한다.
  - heartbeat가 12시간 이상 갱신되지 않은 active run은 `state=stale`로 종료 처리한다.
  - 종료 처리 시 자식 세션에 `sessions_spawn_watchdog` / `sessions_spawn_watchdog_closed` 메시지를 남긴다.
- 현재 안전 정책:
  - 실제 OS 프로세스 kill/restart는 실행하지 않는다.
  - 프론트/운영자가 child session과 workspace rollback 정보를 보고 재시작 여부를 결정한다.

## 구현됨: 세션 리플레이 & 디버깅 1차

- 후보 문서 항목: 추천 기능 12 `에이전트 세션 리플레이 & 디버깅`
- 백엔드 구현:
  - `SessionReplayApplicationService`
  - `WsSessionReplayCommandDispatcher`
- 데이터 소스:
  - `ConversationStore` 메시지
  - `TelemetryApplicationService` LLM 호출 metadata
  - `AgentCommunicationApplicationService` agent message/lifecycle/board snapshot
  - conversation의 `LatestCodingResult`
- 안전 정책:
  - 원문 프롬프트/응답을 별도 리플레이 저장소에 중복 저장하지 않는다.
  - 기본 응답은 메시지 본문 전체를 제외하고 `summary`만 반환한다.
  - 프론트가 상세 재생이 필요할 때만 `includeText=true`를 요청한다.
  - telemetry는 현재 conversationId를 직접 저장하지 않으므로, conversation 시간창과 겹치는 LLM 호출을 `correlation=conversation_window`로 표시한다.

## 구현됨: 계층적 메모리 검색 metadata 1차

- 후보 문서 항목: 추천 기능 11 `계층적 메모리 아키텍처`
- 백엔드 구현:
  - `MemoryTierPolicy`
  - `MemoryIndexSchemaBootstrap`의 `chunks.last_accessed_at`, `chunks.memory_tier`
  - `MemoryIndexDocumentSync` 문서 mtime 기반 tier 저장
  - `MemorySearchTool` tier-aware score 보정
- 계층:
  - `working`: 1시간 미만
  - `short_term`: 24시간 미만
  - `episodic`: 7일 미만
  - `long_term`: 7일 이상 또는 timestamp 없음
- 현재 안전 정책:
  - 실제 파일 접근 이벤트를 추적해 `last_accessed_at`을 갱신하지는 않는다.
  - vector/semantic memory, cascading retrieval, ADR 저장소는 아직 붙이지 않았다.
  - 기존 `memory_search` 요청/응답 흐름은 유지하고 결과 item metadata만 확장했다.

## 구현됨: 구조 인식 메모리 청킹 1차

- 후보 문서 항목: 추천 기능 16 `Tree-sitter(AST) 기반 지식 그래프 및 지능형 청킹`
- 백엔드 구현:
  - `MemoryChunkingPolicy`
  - `MemoryIndexDocumentSync` chunk 생성 분리
- 동작:
  - 프로젝트 코드 파일은 C#/JS/MJS/TS/TSX/Python 선언 경계를 기준으로 chunk를 나눈다.
  - memory note와 conversation은 기존 sliding window chunk를 유지한다.
  - 큰 선언 블록은 기존 token/overlap 기준으로 다시 분할한다.
- 프론트 영향:
  - 새 요청 타입이나 응답 필드는 없다.
  - `memory_index_rebuild` 이후 `memory_search_result.results[].snippet/startLine/endLine`가 함수/클래스 경계에 더 가깝게 잡힌다.
- 현재 안전 정책:
  - 실제 Tree-sitter parser와 Repomap 주입은 아직 적용하지 않았다.
  - 외부 parser package 없이 deterministic fallback만 사용한다.

## 구현됨: Durable Workflow recovery 후보 조회 1차

- 후보 문서 항목: 추천 기능 3 `Durable Workflow 체크포인트`
- 백엔드 구현:
  - 기존 `LogicRunSnapshot` 지속 저장
  - `LogicRunRecoveryScanner`
  - `logic_graph_recovery_list` WebSocket 요청
- 동작:
  - `.runtime/logic/<graphId>/<runId>/snapshot.json`을 스캔한다.
  - `completed`, `error`, `canceled`가 아닌 run만 recovery 후보로 반환한다.
  - 후보에는 완료/실패/대기 노드 수와 마지막 이벤트 로그가 포함된다.
- 현재 안전 정책:
  - 자동 resume/retry는 하지 않는다.
  - 외부 side effect가 있는 노드의 중복 실행 정책이 정해진 뒤 재개 실행을 붙인다.

## 구현됨: 에이전트 권한 샌드박스 강화 1차

- 후보 문서 항목: 추천 기능 13 `에이전트 권한 샌드박스 강화`
- 백엔드 구현:
  - `UniversalCodeExecutionSafetyPolicy`
  - `UniversalCodeRunner` bash/unknown-language preflight 연동
- 동작:
  - `bash`, `sh`, `shell` 또는 알 수 없는 language fallback으로 실행되는 shell script를 실행 전에 검사한다.
  - 기존 코딩 루프 안전 정책과 같은 위험 패턴을 사용해 `rm -rf`, `curl|sh`, `wget|bash`, `/etc`/`/Users`/`/home` 등 워크스페이스 밖 절대경로 write를 차단한다.
  - 차단 시 script 파일은 run directory에 저장되지만 shell process는 시작하지 않는다.
- 프론트 영향:
  - 기존 실행 결과 객체에서 `status`가 `blocked`로 올 수 있다.
  - `exitCode`는 `126`이고, `stderr`에는 `execution blocked by safety policy: <reason>` 형태의 설명이 들어간다.
  - 별도 WebSocket 요청 타입 추가는 없다. 루틴/코딩 실행 결과 표시에서 `blocked`를 에러 계열 상태로 다루면 된다.
- 현재 안전 정책:
  - OS-level sandbox, 네트워크 namespace/cgroup, macOS `sandbox-exec` 적용은 아직 하지 않는다.
  - Python/Node/C/C++ 내부에서 직접 여는 네트워크나 파일 접근까지 정적 차단하지 않는다.
  - 이번 단계는 shell runner의 명백한 고위험 명령 차단에 한정한다.

## 구현됨: MCP 서버 설정 discovery + readiness audit 1차

- 후보 문서 항목: 추천 기능 4 `MCP 서버 지원`
- 백엔드 구현:
  - `McpConfigDiscoveryService`
  - `McpServerReadinessPolicy`
  - `WsMcpCommandDispatcher`
- 스캔 대상:
  - `.mcp.json`
  - `.omni/mcp.json`
  - `.cursor/mcp.json`
  - `.codeium/windsurf/mcp_config.json`
- 동작:
  - config의 `mcpServers` 또는 `servers` object를 읽는다.
  - 서버별 `name`, `transport`, `command`, `argsPreview`, `url`, `envKeys`, `enabled`, `status`, `readiness`를 반환한다.
  - `stdio` 서버는 command/cwd가 filesystem 또는 PATH에서 해석 가능한지만 검사한다.
  - remote 서버는 transport와 URL 문법만 검사하고 handshake는 `skipped`로 둔다.
  - env 값은 절대 반환하지 않는다.
  - token/api-key/password/secret 계열 args와 URL query 값은 `<redacted>`로 마스킹한다.
- 현재 안전 정책:
  - MCP 서버 프로세스를 시작하지 않는다.
  - JSON-RPC handshake와 MCP tool registry 동적 주입은 아직 하지 않는다.
  - discovery 응답은 프론트의 설정/상태 패널 표시용이다.

## 구현됨: 커밋 히스토리 기반 학습 스냅샷 1차

- 후보 문서 항목: 추천 기능 14 `커밋 히스토리 기반 학습`
- 백엔드 구현:
  - `GitCommitHistoryScanner`
  - `GitCommitIntentPolicy`
  - `WsCommitLearningCommandDispatcher`
- 동작:
  - `git log --numstat`를 읽기 전용으로 실행해 최근 커밋 metadata와 파일 변경량을 분석한다.
  - commit subject를 deterministic heuristic으로 `bug_fix`, `feature`, `refactor`, `test`, `docs`, `maintenance`, `performance`, `change` 중 하나로 분류한다.
  - intent rollup과 파일 hotspot을 반환한다.
- 현재 안전 정책:
  - git 저장소를 수정하지 않는다.
  - LLM으로 커밋 의도를 추론하지 않는다.
  - memory note, skill, 시스템 프롬프트에 자동 주입하지 않는다.

## WebSocket 이벤트

### `telemetry_snapshot_get`

LLM 호출 telemetry 스냅샷을 조회한다.

요청:

```json
{
  "type": "telemetry_snapshot_get",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "status": "ok",
  "source": "command_service",
  "sinceUtc": "2026-06-04T00:00:00Z",
  "limit": 100
}
```

응답:

```json
{
  "type": "telemetry_snapshot",
  "payload": {
    "events": [
      {
        "id": "telemetry_...",
        "operation": "llm.call",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "status": "ok",
        "source": "command_service",
        "traceId": "...",
        "spanId": "...",
        "promptTokens": 1200,
        "completionTokens": 300,
        "totalTokens": 1500,
        "tokenUsageSource": "exact",
        "promptChars": 4200,
        "completionChars": 1100,
        "maxOutputTokens": 2048,
        "streaming": false,
        "durationMs": 870,
        "promptCacheEligible": true,
        "promptCacheKey": "c4d7...",
        "promptCacheAffinityKey": "a91b...",
        "promptCacheStaticChars": 4200,
        "promptCacheStaticTokens": 1200,
        "promptCacheStrategy": "prefix_marker",
        "promptCacheReason": "eligible_static_prefix",
        "modelRoutingComplexity": "simple",
        "modelRoutingRecommendedTier": "economy",
        "modelRoutingCascadeEligible": true,
        "modelRoutingEstimatedInputTokens": 980,
        "modelRoutingSignals": "transform",
        "modelRoutingReason": "simple:tokens=980:transform",
        "error": "",
        "startedUtc": "...",
        "completedUtc": "..."
      }
    ],
    "providers": [
      {
        "provider": "gemini",
        "eventCount": 1,
        "promptTokens": 1200,
        "completionTokens": 300,
        "totalTokens": 1500,
        "averageDurationMs": 870,
        "maxDurationMs": 870
      }
    ],
    "total": {
      "eventCount": 1,
      "promptTokens": 1200,
      "completionTokens": 300,
      "totalTokens": 1500,
      "averageDurationMs": 870,
      "maxDurationMs": 870
    },
    "totalEvents": 1,
    "filteredEvents": 1,
    "snapshotUtc": "..."
  }
}
```

- 필터는 모두 선택 사항이다.
- `events`는 최근 N개를 시간순으로 반환한다.
- `providers`와 `total`은 필터 적용 후 전체 집계이며 `limit`으로 잘린 `events` 목록만의 집계가 아니다.
- `promptCacheKey`와 `promptCacheAffinityKey`는 원문이 아닌 hash다. 같은 정적 프리픽스면 같은 key가 나온다.
- `modelRouting*` 필드는 관찰용 readiness metadata다. 현재 백엔드는 이 값으로 실제 모델을 자동 교체하지 않는다.

### `sessions_spawn` + `action=status`

기존 에이전트 스폰 큐 상태 응답에 watchdog 결과가 추가됐다.

요청:

```json
{
  "type": "sessions_spawn",
  "action": "status"
}
```

응답 추가 필드:

```json
{
  "type": "sessions_spawn_result",
  "action": "status",
  "active": {
    "activeCount": 0,
    "oldestRunId": null,
    "completedHistoryCount": 1
  },
  "watchdog": {
    "activeCount": 0,
    "timedOutCount": 1,
    "staleCount": 0,
    "eventCount": 1,
    "checkedUtc": "2026-06-04T00:00:00Z",
    "events": [
      {
        "runId": "run-id",
        "childSessionKey": "conversation-id",
        "runtime": "acp",
        "mode": "run",
        "backend": "codex",
        "previousState": "dispatching",
        "state": "timeout",
        "reason": "run_timeout",
        "message": "active run exceeded run timeout (60 seconds)",
        "startedUtc": "...",
        "completedUtc": "...",
        "ageSeconds": 180,
        "heartbeatAgeSeconds": 120
      }
    ]
  }
}
```

- `watchdog.events`는 해당 평가에서 새로 종료 처리된 run만 담는다.
- 대시보드는 `eventCount > 0`이면 agent activity에 경고 카드나 타임라인 항목을 표시한다.

### `sessions_spawn` ACP worktree isolation

백엔드는 env opt-in일 때 ACP spawn을 별도 git worktree에서 실행할 수 있다.

활성화 조건:

```text
OMNUX_AGENT_SPAWN_WORKTREE_MODE=auto|on|enabled|true|1
```

프론트 요청 payload는 기존 `sessions_spawn`과 동일하다. 별도 필드는 추가되지 않았다.

응답/타임라인 확인 지점:

- `sessions_spawn_result.note`에 `worktree_isolation=created|reused worktree_path=<path>`가 붙는다.
- child session timeline에 `meta=sessions_spawn_worktree_ready`가 남는다.
- ACP dispatch trace인 `meta=sessions_spawn_acp_dispatch`에는 `acp.option.workspaceDirectory=<path>`와 `acp.worktree.status=created|reused`가 포함된다.
- worktree 생성 실패 시 메인 workspace fallback 없이 spawn 실패로 처리되고, child session에는 `meta=sessions_spawn_worktree_failed` 및 `sessions_spawn_acp_failed`가 남을 수 있다.

프론트 연결 기준:

- 기본 UI에서는 별도 입력을 만들 필요가 없다. 운영자가 env로 켠 경우에만 세션 상세/디버그 패널에서 worktree 상태와 경로를 표시한다.
- `worktree_path`는 로컬 절대 경로일 수 있으므로 일반 사용자용 카드에는 축약 표시하고, 복사 버튼은 디버그/개발자 화면에만 둔다.
- merge/cherry-pick/cleanup 버튼은 아직 연결하지 않는다.

### `session_replay_get`

세션 리플레이 타임라인을 조회한다.

요청:

```json
{
  "type": "session_replay_get",
  "conversationId": "conversation-id",
  "runId": "run-1",
  "agentId": "agent-a",
  "groupId": "group-1",
  "sinceUtc": "2026-06-04T00:00:00Z",
  "limit": 200,
  "includeText": false,
  "includeTelemetry": true,
  "includeAgentEvents": true
}
```

응답:

```json
{
  "type": "session_replay_snapshot",
  "payload": {
    "conversationId": "conversation-id",
    "runId": "run-1",
    "agentId": "agent-a",
    "groupId": "group-1",
    "events": [
      {
        "id": "conversation_conversation-id_0",
        "source": "conversation",
        "kind": "user_input",
        "severity": "info",
        "correlation": "exact",
        "conversationId": "conversation-id",
        "runId": "",
        "agentId": "",
        "groupId": "",
        "title": "user message",
        "summary": "요청 본문",
        "meta": "user",
        "promptTokens": 0,
        "completionTokens": 0,
        "totalTokens": 0,
        "durationMs": 0,
        "timestampUtc": "2026-06-04T00:00:00Z"
      },
      {
        "id": "telemetry_...",
        "source": "telemetry",
        "kind": "llm.call",
        "severity": "info",
        "correlation": "conversation_window",
        "conversationId": "conversation-id",
        "title": "gemini/gemini-2.5-flash",
        "summary": "ok 1500 tokens 870ms",
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "status": "ok",
        "traceId": "...",
        "spanId": "...",
        "promptTokens": 1200,
        "completionTokens": 300,
        "totalTokens": 1500,
        "durationMs": 870,
        "timestampUtc": "2026-06-04T00:00:01Z",
        "startedUtc": "2026-06-04T00:00:00Z",
        "completedUtc": "2026-06-04T00:00:01Z"
      }
    ],
    "summary": {
      "eventCount": 2,
      "conversationMessageCount": 1,
      "telemetryEventCount": 1,
      "agentEventCount": 0,
      "errorCount": 0,
      "warningCount": 0,
      "promptTokens": 1200,
      "completionTokens": 300,
      "totalTokens": 1500,
      "firstEventUtc": "2026-06-04T00:00:00Z",
      "lastEventUtc": "2026-06-04T00:00:01Z"
    },
    "totalEvents": 2,
    "returnedEvents": 2,
    "snapshotUtc": "2026-06-04T00:00:02Z"
  }
}
```

- `conversationId`, `runId`, `agentId`, `groupId` 중 하나는 필요하다.
- `includeText=false`가 기본값이며, 이때 conversation/agent 본문 전체는 `body`로 내려가지 않는다.
- `severity`는 `info`, `warning`, `error` 중 하나다. `auto-compress`, watchdog, breaker, failed lifecycle, timeout telemetry는 서버에서 자동 분류한다.
- telemetry 이벤트는 원문 prompt/response를 포함하지 않는다.

### `memory_search`

메모리/세션/프로젝트 FTS 검색 결과를 조회한다. 계층적 메모리 1차 구현 후 결과 item에 tier metadata가 추가됐다.

요청:

```json
{
  "type": "memory_search",
  "query": "MemorySearchTool tier score",
  "maxResults": 6,
  "minScore": 0.35
}
```

응답:

```json
{
  "type": "memory_search_result",
  "query": "MemorySearchTool tier score",
  "disabled": false,
  "results": [
    {
      "path": "apps/omnux-middleware/src/MemorySearchTool.cs",
      "startLine": 120,
      "endLine": 150,
      "snippet": "...",
      "score": 0.8123,
      "source": "project",
      "memoryTier": "short_term",
      "lastAccessedAtUnixMs": 1780500000000
    }
  ]
}
```

- `memoryTier`는 `working`, `short_term`, `episodic`, `long_term` 중 하나다.
- `lastAccessedAtUnixMs`는 현재 문서 mtime 기반 값이다. `0`이면 기존/미확인 row로 보면 된다.
- `score`는 BM25 변환 점수에 tier confidence를 적용한 최종 점수다.
- `disabled=true`면 `error`가 함께 올 수 있고, 이 경우 기존처럼 검색 비활성 상태로 처리한다.
- 구조 인식 청킹은 인덱스 재생성 이후 반영된다. 프론트에서 즉시 확인하려면 기존 `memory_index_rebuild`를 먼저 호출한다.

### `logic_graph_recovery_list`

미들웨어 재시작 후 디스크에 남은 미완료 로직 그래프 실행 snapshot을 조회한다.

요청:

```json
{
  "type": "logic_graph_recovery_list",
  "limit": 50
}
```

응답:

```json
{
  "type": "logic_graph_recovery_list_result",
  "payload": {
    "items": [
      {
        "runId": "logicrun-20260604000000-abcd1234",
        "graphId": "graph-id",
        "title": "Flow title",
        "status": "running",
        "source": "web",
        "startedAtUtc": "2026-06-04T00:00:00Z",
        "updatedAtUtc": "2026-06-04T00:01:00Z",
        "completedNodeCount": 3,
        "errorNodeCount": 0,
        "pendingNodeCount": 2,
        "lastEvent": "[2026-06-04T00:01:00Z] node_started n4 Step"
      }
    ],
    "total": 1,
    "scannedAtUtc": "2026-06-04T00:02:00Z"
  }
}
```

- 이 응답은 복구 후보 목록만 제공한다.
- 실제 재개 버튼은 아직 연결하지 않는다. 우선 `logic_graph_run_get`으로 snapshot 상세를 열어 상태를 확인한다.

### `mcp_servers_list`

워크스페이스 MCP 설정 파일을 스캔해 발견된 서버 설정을 조회한다. 서버 프로세스는 시작하지 않는다.

요청:

```json
{
  "type": "mcp_servers_list"
}
```

응답:

```json
{
  "type": "mcp_servers_snapshot",
  "payload": {
    "configFiles": [
      {
        "source": "workspace",
        "path": "/abs/path/.mcp.json",
        "exists": true,
        "status": "ok",
        "serverCount": 1
      }
    ],
    "servers": [
      {
        "serverId": "workspace:filesystem",
        "name": "filesystem",
        "source": "workspace",
        "configPath": "/abs/path/.mcp.json",
        "transport": "stdio",
        "command": "npx",
        "argsPreview": ["-y", "@modelcontextprotocol/server-filesystem", "."],
        "argumentCount": 3,
        "url": "",
        "workingDirectory": "",
        "envKeys": ["GITHUB_TOKEN"],
        "envKeyCount": 1,
        "enabled": true,
        "status": "discovered",
        "message": "stdio server config discovered; process launch is not enabled yet",
        "readiness": {
          "status": "ready_to_launch",
          "checks": [
            {
              "name": "working_directory",
              "status": "ok",
              "message": "no working directory override"
            },
            {
              "name": "command",
              "status": "ok",
              "message": "command is resolvable"
            }
          ]
        }
      }
    ],
    "errors": [],
    "totalServers": 1,
    "scannedAtUtc": "2026-06-04T00:00:00Z"
  }
}
```

- `status`는 `discovered`, `disabled`, `invalid` 중 하나다.
- `readiness.status`는 `ready_to_launch`, `remote_unverified`, `blocked`, `disabled` 중 하나다.
- `readiness.checks[].status`는 `ok`, `failed`, `skipped` 중 하나다.
- `configFiles[].status`는 `missing`, `ok`, `empty`, `invalid`, `error` 중 하나다.
- `envKeys`에는 key만 포함되며 값은 내려오지 않는다.
- `argsPreview`와 `url`은 민감값 redaction 후 내려온다.

### `commit_learning_snapshot_get`

최근 git commit metadata를 읽어 intent rollup과 파일 hotspot을 조회한다. 저장소를 수정하지 않는다.

요청:

```json
{
  "type": "commit_learning_snapshot_get",
  "limit": 30
}
```

응답:

```json
{
  "type": "commit_learning_snapshot",
  "payload": {
    "repositoryRoot": "/abs/path",
    "limit": 30,
    "commits": [
      {
        "hash": "abcdef...",
        "shortHash": "abcdef123456",
        "subject": "fix: handle app crash",
        "authorName": "Dev",
        "authorDateUtc": "2026-06-04T00:00:00Z",
        "intent": "bug_fix",
        "filesChanged": 2,
        "addedLines": 10,
        "deletedLines": 3,
        "topPaths": ["apps/omnux-middleware/src/Foo.cs"]
      }
    ],
    "intents": [
      {
        "intent": "bug_fix",
        "commitCount": 1,
        "addedLines": 10,
        "deletedLines": 3
      }
    ],
    "hotspots": [
      {
        "path": "apps/omnux-middleware/src/Foo.cs",
        "changeCount": 2,
        "lastCommitShortHash": "abcdef123456",
        "lastSubject": "fix: handle app crash"
      }
    ],
    "warnings": [],
    "totalCommits": 1,
    "scannedAtUtc": "2026-06-04T00:00:00Z"
  }
}
```

- `limit`은 1~200으로 clamp된다.
- `warnings`에 `git log` 실패, 저장소 아님, commit 없음 같은 읽기 실패 이유가 들어간다.
- `intent`는 LLM 추론이 아닌 제목 기반 heuristic이다.

### `git_automation_snapshot_get`

현재 워크트리 변경사항과 커밋/PR 준비 상태를 읽기 전용으로 조회한다.

요청:

```json
{
  "type": "git_automation_snapshot_get",
  "limit": 100
}
```

응답:

```json
{
  "type": "git_automation_snapshot",
  "payload": {
    "repositoryRoot": "/path/to/workspace",
    "branchName": "main",
    "headShortHash": "abcdef1",
    "readOnly": true,
    "hasChanges": true,
    "isClean": false,
    "changedFileCount": 3,
    "stagedFileCount": 1,
    "unstagedFileCount": 1,
    "untrackedFileCount": 1,
    "conflictedFileCount": 0,
    "limit": 100,
    "filesTruncated": false,
    "files": [
      {
        "path": "apps/omnux-middleware/src/Foo.cs",
        "indexStatus": " ",
        "worktreeStatus": "M",
        "category": "modified",
        "staged": false,
        "unstaged": true,
        "untracked": false,
        "addedLines": 4,
        "deletedLines": 1
      }
    ],
    "diffShortStat": "1 file changed, 4 insertions(+), 1 deletion(-)",
    "suggestedCommitMessage": "chore(middleware): update backend changes",
    "suggestedBranchName": "codex/middleware-changes",
    "readiness": {
      "status": "ready_for_review",
      "commitRecommended": true,
      "pullRequestRecommended": true,
      "requiresApproval": true,
      "blockers": []
    },
    "warnings": [],
    "scannedAtUtc": "2026-06-04T00:00:00Z"
  }
}
```

- `limit`은 1~300으로 clamp된다.
- `readOnly=true`가 현재 계약이다. 백엔드는 이 요청에서 `git add`, `git commit`, branch 생성, `gh pr create`를 실행하지 않는다.
- `stagedFileCount`, `unstagedFileCount`, `untrackedFileCount`는 겹치지 않는 카운트다.
- `changedFileCount`와 상태별 카운트는 전체 변경 기준이고, `files`만 `limit`으로 잘린다. 잘렸으면 `filesTruncated=true`다.
- `readiness.status=blocked`이면 `conflictedFileCount > 0`이거나 `blockers`에 이유가 들어간다.
- `suggestedCommitMessage`와 `suggestedBranchName`은 LLM이 아니라 파일 경로/status 기반 heuristic이다. 자동 실행 근거가 아니라 사용자 승인 UI의 초안으로만 사용한다.

### `self_improvement_snapshot_get`

Nightly/Adaptive Skills 후보의 1차 백엔드 계약이다. 현재는 읽기 전용 개선 제안만 반환한다.

요청:

```json
{
  "type": "self_improvement_snapshot_get",
  "limit": 30
}
```

응답:

```json
{
  "type": "self_improvement_snapshot",
  "payload": {
    "repositoryRoot": "/path/to/workspace",
    "status": "proposal_ready",
    "proposalCount": 2,
    "limit": 30,
    "proposals": [
      {
        "proposalId": "git-change-review",
        "kind": "workspace_hygiene",
        "priority": "medium",
        "title": "현재 변경사항 커밋 준비 검토",
        "rationale": "현재 워크트리에 변경 파일 3개가 있습니다.",
        "suggestedAction": "프론트에서 변경 파일과 커밋 메시지 초안을 검토하게 하고, 실제 커밋/PR 실행은 승인 API가 생긴 뒤 연결한다.",
        "source": "git_automation",
        "targetPath": "",
        "requiresApproval": true,
        "evidence": [
          "suggestedCommitMessage=chore(middleware): update backend changes"
        ]
      }
    ],
    "warnings": [],
    "scannedAtUtc": "2026-06-04T00:00:00Z"
  }
}
```

- `limit`은 1~100으로 clamp된다.
- `kind`는 현재 `workspace_hygiene`, `learning_review`, `hotspot_review` 중 하나다.
- `priority`는 `high`, `medium`, `low` 중 하나다.
- 모든 제안은 `requiresApproval=true`다. 백엔드는 이 요청에서 `SKILL.md`, memory note, 시스템 프롬프트, 루틴/크론을 생성하거나 수정하지 않는다.
- `status=no_proposals`이면 표시할 제안이 없다는 뜻이며 실패가 아니다. 읽기 실패는 `warnings`에 들어간다.

### `local_llm_snapshot_get`

Ollama/LM Studio 같은 로컬 LLM endpoint의 모델 discovery 스냅샷을 조회한다. 실제 LLM 라우팅은 바꾸지 않는다.

요청:

```json
{
  "type": "local_llm_snapshot_get"
}
```

응답:

```json
{
  "type": "local_llm_snapshot",
  "payload": {
    "endpoints": [
      {
        "name": "ollama",
        "kind": "ollama",
        "baseUrl": "http://127.0.0.1:11434",
        "status": "available",
        "modelCount": 1,
        "models": [
          {
            "id": "qwen2.5-coder:7b",
            "ownedBy": "ollama",
            "family": "qwen2",
            "parameterSize": "7B",
            "quantization": "Q4_K_M",
            "sizeBytes": 4683072000,
            "modifiedAtUtc": "2026-06-04T00:00:00Z"
          }
        ],
        "error": "",
        "elapsedMs": 12
      }
    ],
    "availableEndpointCount": 1,
    "totalModelCount": 1,
    "offlineReady": true,
    "warnings": [],
    "scannedAtUtc": "2026-06-04T00:00:00Z"
  }
}
```

- 기본 endpoint는 Ollama `http://127.0.0.1:11434`와 OpenAI-compatible `http://127.0.0.1:1234`다.
- `OMNUX_LOCAL_LLM_ENDPOINTS`가 있으면 comma-separated endpoint 목록을 사용한다. `11434`를 포함하면 `kind=ollama`, 그 외는 `openai_compatible`로 추정한다.
- `status`는 `available`, `unavailable`, `error` 중 하나다.
- `offlineReady=true`는 사용 가능한 endpoint가 있고 모델이 1개 이상 발견됐다는 뜻이다.
- 이 요청은 모델 discovery만 수행한다. provider 자동 전환, 외부 트래픽 차단, 모델 warmup은 아직 실행하지 않는다.

### `agent_bus_get`

에이전트 메시지/보드/생명주기 스냅샷 조회.

요청:

```json
{
  "type": "agent_bus_get",
  "agentId": "agent-1",
  "groupId": "group-1",
  "runId": "run-1",
  "sinceUtc": "2026-06-04T00:00:00Z",
  "limit": 100
}
```

응답:

```json
{
  "type": "agent_bus_snapshot",
  "payload": {
    "messages": [],
    "board": [],
    "lifecycle": [],
    "totalMessages": 0,
    "totalBoardEntries": 0,
    "totalLifecycleEvents": 0,
    "snapshotUtc": "..."
  }
}
```

### `agent_message_post`

에이전트 간 메시지 저장.

요청:

```json
{
  "type": "agent_message_post",
  "fromAgentId": "agent-a",
  "toAgentId": "agent-b",
  "groupId": "group-1",
  "runId": "run-1",
  "conversationId": "conversation-id",
  "kind": "message",
  "body": "검토 결과를 공유합니다.",
  "correlationId": "request-id"
}
```

응답 타입: `agent_message_result`

### `agent_board_put`

공유 상태 보드 upsert.

요청:

```json
{
  "type": "agent_board_put",
  "agentId": "agent-a",
  "key": "progress",
  "value": "파일 검색 완료",
  "runId": "run-1",
  "groupId": "group-1",
  "status": "running",
  "priority": "normal"
}
```

응답 타입: `agent_board_result`

### `agent_lifecycle_emit`

에이전트 생명주기 이벤트 저장.

요청:

```json
{
  "type": "agent_lifecycle_emit",
  "agentId": "agent-a",
  "runId": "run-1",
  "groupId": "group-1",
  "conversationId": "conversation-id",
  "state": "completed",
  "detail": "작업 완료"
}
```

응답 타입: `agent_lifecycle_result`

### `agent_group_command`

부모 에이전트가 그룹 또는 실행 단위에 명령 메시지를 남긴다.

요청:

```json
{
  "type": "agent_group_command",
  "fromAgentId": "parent",
  "groupId": "group-1",
  "runId": "run-1",
  "command": "stop",
  "body": "사용자 요청으로 중단",
  "correlationId": "request-id"
}
```

응답 타입: `agent_group_command_result`

## 공통 응답 payload

쓰기 계열 응답은 모두 아래 구조를 사용한다.

```json
{
  "ok": true,
  "message": "agent message posted",
  "snapshot": {
    "messages": [],
    "board": [],
    "lifecycle": []
  },
  "messageItem": null,
  "boardEntry": null,
  "lifecycleEvent": null
}
```

## 프론트엔드 연결 제안

- Telemetry/비용 패널은 `telemetry_snapshot_get`을 주기 조회해 provider별 토큰 합계와 평균 지연시간을 표시한다.
- Prompt cache readiness는 `promptCacheEligible=true` 비율과 `promptCacheAffinityKey`별 반복 횟수로 표시한다.
- Smart routing readiness는 `modelRoutingComplexity`, `modelRoutingRecommendedTier`, `modelRoutingCascadeEligible`을 기준으로 저가 모델 후보 비율과 frontier 필요 비율을 표시한다.
- 실패 목록은 `status != ok` 필터로 조회하고, `error`는 짧은 기술 메시지로만 표시한다.
- 에이전트 상태 패널은 `sessions_spawn action=status`의 `watchdog` 필드를 보고 timeout/stale 이벤트를 표시한다.
- 세션 상세/디버깅 패널은 `session_replay_get`을 호출해 대화, agent event, LLM 호출 metadata를 단일 타임라인으로 표시한다.
- 리플레이 타임라인의 `correlation=conversation_window` telemetry는 시간창 기반 추정이므로, UI에서는 "관련 LLM 호출 후보"처럼 표시한다.
- 메모리 검색 결과는 `memoryTier`를 배지로 표시하고, 오래된 `long_term` 결과도 score floor 정책으로 유지될 수 있음을 tooltip에 짧게 설명한다.
- 메모리 인덱스 rebuild 후에는 `memory_search` snippet이 기존 라인 window보다 선언 단위에 가까워지므로, 코드 미리보기는 기존 `startLine/endLine` 표시를 그대로 사용한다.
- 로직 그래프 화면은 시작 시 `logic_graph_recovery_list`를 호출해 재시작 후 남은 `running` 후보를 표시하고, 상세 확인은 기존 `logic_graph_run_get`으로 연다.
- 활동/에이전트 패널에서 `agent_bus_get`을 주기 조회하거나 수동 새로고침한다.
- 보드 영역은 `payload.board`를 `groupId/runId` 기준으로 묶어 표시한다.
- 타임라인은 `payload.lifecycle`와 `payload.messages`를 시간순으로 합쳐 표시한다.
- 그룹 제어 버튼은 우선 `agent_group_command`만 호출하고, 실제 강제 중단은 추후 백엔드 제어 훅이 추가된 뒤 연결한다.
- MCP 설정 패널은 `mcp_servers_list`를 호출해 발견된 서버와 invalid/error config를 표시한다. `status=discovered`는 "연결 가능 후보"이지 "실행 중"이 아니다. `readiness.status=blocked`는 command/cwd/transport/URL 설정 오류로 표시하고, `remote_unverified`는 handshake 미실행 상태로 표시한다.
- Commit learning 패널은 `commit_learning_snapshot_get`을 호출해 최근 커밋 intent 분포와 자주 바뀌는 파일 hotspot을 표시한다. intent는 heuristic이므로 자동 규칙 적용 근거가 아니라 관찰용으로 둔다.
- Worktree isolation은 새 WS 타입이 없다. 세션 결과 note와 child session timeline의 `sessions_spawn_worktree_*` / `sessions_spawn_acp_dispatch` metadata를 읽어 표시한다.
- Git automation 패널은 `git_automation_snapshot_get`으로 현재 변경 파일, readiness, 커밋 메시지 초안을 표시한다. 실제 커밋/PR 버튼은 아직 백엔드 실행 API가 없으므로 비활성 상태로 둔다.
- Self improvement 패널은 `self_improvement_snapshot_get`으로 workspace hygiene, 반복 bug_fix, hotspot review 제안을 표시한다. 모든 액션은 사용자 승인 UI가 생기기 전까지 보기 전용이다.
- Local LLM 패널은 `local_llm_snapshot_get`으로 Ollama/LM Studio endpoint availability와 모델 목록을 표시한다. 이 값은 라우팅 상태가 아니라 discovery/readiness로만 취급한다.

## 보류한 후보

- OpenTelemetry OTLP exporter: 현재는 `ActivitySource`와 로컬 스냅샷까지 구현했다. Jaeger/Grafana Tempo/Datadog export는 외부 패키지와 운영 설정이 필요하므로 별도 단계로 둔다.
- Provider별 실제 prompt cache API 적용: 현재는 readiness/hash/affinity telemetry만 기록한다. Gemini explicit cache, Anthropic cache control, OpenAI 자동 캐시 과금 확인은 provider adapter별 계약 검토 후 붙인다.
- 스마트 모델 라우팅 실제 적용: 현재는 telemetry readiness만 기록한다. provider/model 자동 교체, cascade retry, 품질 미달 escalation은 사용자 선택권과 실패 복구 정책을 먼저 정해야 한다.
- 셀프 힐링 자동 kill/restart: 현재는 timeout/stale 감지와 상태 종료까지만 구현했다. 실제 프로세스 종료와 자동 재시작은 백엔드별 안전 정책이 필요해 별도 단계로 둔다.
- Durable Workflow 자동 resume: 현재는 snapshot 저장과 recovery 후보 조회까지다. 중복 실행 방지와 side effect 정책이 정해진 뒤 재개 실행을 붙인다.
- 세션 리플레이 append-only 결정 트리: 1차는 기존 저장소 조합 타임라인이다. LLM raw input/output, tool stdout/stderr 전체 저장은 개인정보/용량 정책이 필요해 보류한다.
- Git worktree merge/cherry-pick/cleanup UI: 1차는 ACP 실행 CWD 격리까지만 구현했다. 완료 후 메인 브랜치 반영, 충돌 해결, 오래된 worktree 정리는 별도 백엔드 정책이 필요하다.
- 계층적 메모리 deep archive/cascading retrieval/ADR 저장소: 1차는 FTS score와 metadata 확장까지만 구현했다. 실제 접근 이벤트 수집과 ADR 데이터 모델은 별도 설계가 필요하다.
- Tree-sitter/Repomap 본도입: 1차는 외부 의존성 없는 선언 경계 청킹이다. 실제 AST parser, 언어별 grammar, Repomap 프롬프트 주입은 별도 검증 후 붙인다.
- MCP 서버 프로세스/JSON-RPC/tool registry 주입: 1차는 설정 discovery와 read-only readiness audit만 구현했다. 실제 실행은 서드파티 프로세스 권한/격리와 MCP handshake 정책이 필요해 보류한다.
- 커밋 히스토리 LLM 학습/자동 주입: 1차는 읽기 전용 snapshot이다. LLM 요약, memory/skill 자동 저장, nightly 자기 개선은 사용자 변경 오염 위험이 있어 보류한다.
- 자동 커밋/PR 실제 실행: 1차는 read-only snapshot만 제공한다. `git add`, `git commit`, branch 생성, `gh pr create`는 사용자 승인/충돌/권한 정책이 필요해 보류한다.
- Nightly 자기 개선 자동 실행: 1차는 read-only proposal snapshot만 제공한다. 실제 야간 루틴 등록, LLM 선호도 분석, `SKILL.md` 자동 갱신은 사용자 승인/충돌 정책이 필요하다.
- Local LLM 실제 라우팅/오프라인 차단: 1차는 endpoint/model discovery만 제공한다. `LocalLlmProvider`, cloud provider 차단, fallback 라우팅, 모델 warmup은 기존 LLM 호출 경로 영향이 커서 별도 단계로 둔다.
- 시맨틱 검색/Ollama embed: 후보 문서 결론대로 코드 검색용 우선순위는 낮다.
