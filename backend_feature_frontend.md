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

## WebSocket 이벤트

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

- 활동/에이전트 패널에서 `agent_bus_get`을 주기 조회하거나 수동 새로고침한다.
- 보드 영역은 `payload.board`를 `groupId/runId` 기준으로 묶어 표시한다.
- 타임라인은 `payload.lifecycle`와 `payload.messages`를 시간순으로 합쳐 표시한다.
- 그룹 제어 버튼은 우선 `agent_group_command`만 호출하고, 실제 강제 중단은 추후 백엔드 제어 훅이 추가된 뒤 연결한다.

## 보류한 후보

- 컨텍스트 적응형 압축: 기존 채팅 경로의 토큰 사용량/대화 압축 정책과 직접 맞물려 회귀 범위가 크다. 별도 턴에서 `ConversationStore` 압축 경로와 스트리밍 응답 계약을 함께 다뤄야 한다.
- Durable Workflow 체크포인트: 로직 그래프 런타임 재개 정책과 중복 실행 방지 규칙이 필요하다. 현재 기능과 독립된 저장소만 추가하면 실효성이 낮다.
- MCP 서버 지원: 프로세스 생명주기와 JSON-RPC 스펙 구현이 필요해 높은 위험 작업이다.
- 자동 커밋/PR 생성: 현재 워크트리가 대규모 변경 상태라 자동 커밋 계열 기능을 바로 붙이면 사용자 변경과 충돌할 수 있다.
- Git Worktree 격리: 스폰 실행 경로와 롤백 정책을 함께 바꿔야 한다.
- 시맨틱 검색/Ollama embed: 후보 문서 결론대로 코드 검색용 우선순위는 낮다.
