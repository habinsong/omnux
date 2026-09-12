# 플러그인 디렉터리

이 디렉터리의 각 하위 폴더는 하나의 omnux 플러그인에 해당합니다. 하위 디렉터리에 `omnux-plugin.json` 매니페스트가 있으면 자동으로 인식해 로드합니다.

기본 탐색 경로는 `~/.omnux/plugins`입니다. 데스크톱 앱의 **엔진 > 확장 > 플러그인** 메뉴에서 추가 경로를 등록하거나, `OMNUX_PLUGINS_ROOT` 환경변수로 경로를 지정할 수 있습니다.

저장소에는 기본 예시로 `safety-basics` 플러그인이 포함되어 있습니다. 보안 민감 파일 쓰기를 차단하고 위험 명령 실행 시 사용자 승인을 요청하는 훅 2개와 규칙 1개로 구성됩니다.

## 매니페스트

| 필드 | 필수 | 설명 |
|---|---|---|
| `id` | 예 | 영숫자와 `-`, `_`, `.`만 쓴다. 1~64자. 기여한 훅과 규칙 id 앞에 `id:`로 붙는다 |
| `version` | 예 | 표시용 버전 문자열 |
| `name` | 아니오 | 표시 이름. 없으면 `id`를 쓴다 |
| `description`, `author`, `license`, `homepage` | 아니오 | 목록에 그대로 표시한다 |
| `hooks` | 아니오 | 훅 정의 배열. 최대 64개 |
| `rules` | 아니오 | 규칙 정의 배열. 최대 64개 |

`id`나 `version`이 누락되었거나 유효하지 않은 훅 `event`가 지정되면 플러그인 로드 실패로 표시하고 확장을 등록하지 않습니다. 상세 오류 내용은 데스크톱 확장 화면에서 확인할 수 있습니다.

## 훅 정의

| 필드 | 설명 |
|---|---|
| `id` | 플러그인 안에서 고유한 이름 |
| `event` | 훅 시점. 아래 목록의 값만 쓴다 |
| `handler` | `builtin` 또는 `command`. `prompt`와 `agent`는 아직 실행 경로가 없다 |
| `builtinId`, `builtinArgument` | `builtin`일 때의 검사 종류와 인자 |
| `command` | `command`일 때 실행할 셸 명령 |
| `toolPattern` | 도구 이름 조건. 세로줄로 나눈 목록과 `*`를 쓴다. 부분 문자열 일치는 하지 않는다 |
| `pathGlob` | 경로 조건. `*`는 구분자를 넘지 않고, `**`는 넘는다. `?`도 쓴다 |
| `timeoutMs` | 200~120000. 벗어나면 범위 안으로 조정된다 |
| `failureMode` | `open`이면 실패해도 통과하고, `closed`면 실패가 차단이 된다. 차단할 수 있는 시점에서만 `closed`를 쓴다 |

`builtinId`는 두 가지를 지원합니다. `deny-path`는 `builtinArgument`에 지정된 glob 패턴과 일치하는 경로 접근을 차단하며, `ask-command`는 해당 패턴과 일치하는 명령 실행 시 사용자 확인을 요청합니다. 여러 패턴은 세로줄(`|`)로 구분합니다.

### 훅 시점

| id | 차단 | 입력 재작성 | 문맥 추가 |
|---|---|---|---|
| `session.start` | 아니오 | 아니오 | 예 |
| `session.end` | 아니오 | 아니오 | 아니오 |
| `prompt.submit` | 예 | 아니오 | 예 |
| `tool.pre` | 예 | 예 | 아니오 |
| `tool.post` | 아니오 | 아니오 | 예 |
| `tool.error` | 아니오 | 아니오 | 예 |
| `response.complete` | 아니오 | 아니오 | 아니오 |
| `coding.plan` | 예 | 아니오 | 예 |
| `coding.file.pre` | 예 | 예 | 아니오 |
| `coding.file.post` | 아니오 | 아니오 | 예 |
| `coding.command.pre` | 예 | 예 | 아니오 |
| `coding.verify` | 예 | 아니오 | 예 |
| `routine.pre` | 예 | 아니오 | 아니오 |
| `routine.post` | 아니오 | 아니오 | 아니오 |

아직 호출 지점이 구현되지 않은 이벤트는 확장 화면에 `미연결`로 표시됩니다.

## 명령 훅 계약

표준 입력으로 이벤트 JSON이 들어온다.

```json
{ "event": "coding.file.pre", "sessionId": "", "cwd": "/작업/폴더", "filePath": "/repo/a.ts" }
```

프로세스 종료 코드로 실행 상태를 판정합니다.

| 종료 코드 | 의미 |
|---|---|
| `0` | 정상 실행. 표준 출력이 JSON 객체면 판정 결과로 해석합니다. JSON이 아니면 별도 판정 없음으로 처리하며 정상 완료됩니다. |
| `2` | 차단. 표준 에러(stderr) 출력을 차단 사유로 사용합니다. |
| 기타 | 실행 실패. `failureMode`가 `closed`로 설정된 경우 차단으로 승격합니다. |

표준 출력 JSON 형식은 이렇다.

```json
{
  "decision": "allow | ask | deny | defer",
  "reason": "사용자에게 보일 사유",
  "updatedInput": { "command": "바꾼 입력" },
  "additionalContext": "덧붙일 문장"
}
```

`updatedInput`은 재작성이 허용된 시점에서만 반영된다. 거부된 호출에는 전달하지 않는다.

## 규칙 정의

| 필드 | 설명 |
|---|---|
| `id`, `title`, `body` | 본문은 최대 4,000자 |
| `scope` | `global` 또는 `project` |
| `pathGlob` | 특정 경로에서만 적용할 때 쓴다 |
| `priority` | 작을수록 먼저 붙는다 |

프롬프트 주입 예산을 초과하는 규칙은 일부만 잘라 넣지 않고 전체를 안전하게 제외하며, 제외된 규칙은 로그 목록으로 보고합니다.
