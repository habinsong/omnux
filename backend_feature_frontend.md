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
- 개인정보/컨텍스트 안전 정책:
  - 프롬프트 원문과 응답 원문은 저장하지 않는다.
  - 실패 상태일 때만 짧은 error 문자열을 저장한다.
  - 최근 2,000개 이벤트만 파일에 유지한다.

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
- 실패 목록은 `status != ok` 필터로 조회하고, `error`는 짧은 기술 메시지로만 표시한다.
- 에이전트 상태 패널은 `sessions_spawn action=status`의 `watchdog` 필드를 보고 timeout/stale 이벤트를 표시한다.
- 활동/에이전트 패널에서 `agent_bus_get`을 주기 조회하거나 수동 새로고침한다.
- 보드 영역은 `payload.board`를 `groupId/runId` 기준으로 묶어 표시한다.
- 타임라인은 `payload.lifecycle`와 `payload.messages`를 시간순으로 합쳐 표시한다.
- 그룹 제어 버튼은 우선 `agent_group_command`만 호출하고, 실제 강제 중단은 추후 백엔드 제어 훅이 추가된 뒤 연결한다.

## 보류한 후보

- OpenTelemetry OTLP exporter: 현재는 `ActivitySource`와 로컬 스냅샷까지 구현했다. Jaeger/Grafana Tempo/Datadog export는 외부 패키지와 운영 설정이 필요하므로 별도 단계로 둔다.
- 셀프 힐링 자동 kill/restart: 현재는 timeout/stale 감지와 상태 종료까지만 구현했다. 실제 프로세스 종료와 자동 재시작은 백엔드별 안전 정책이 필요해 별도 단계로 둔다.
- Durable Workflow 체크포인트: 로직 그래프 런타임 재개 정책과 중복 실행 방지 규칙이 필요하다. 현재 기능과 독립된 저장소만 추가하면 실효성이 낮다.
- MCP 서버 지원: 프로세스 생명주기와 JSON-RPC 스펙 구현이 필요해 높은 위험 작업이다.
- 자동 커밋/PR 생성: 현재 워크트리가 대규모 변경 상태라 자동 커밋 계열 기능을 바로 붙이면 사용자 변경과 충돌할 수 있다.
- Git Worktree 격리: 스폰 실행 경로와 롤백 정책을 함께 바꿔야 한다.
- 시맨틱 검색/Ollama embed: 후보 문서 결론대로 코드 검색용 우선순위는 낮다.
