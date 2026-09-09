# omnux 플러그인 폴더

이 폴더의 각 하위 폴더가 플러그인 1개다. 하위 폴더에 `omnux-plugin.json` 이 있으면 읽는다.
확장 화면(엔진 → 확장 → 플러그인)에서 이 폴더 경로를 추가하면 목록에 나타난다.
기본 검사 폴더는 `~/.omnux/plugins` 이며, 여기에 추가로 등록할 수 있다.

## 매니페스트

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `id` | 예 | 영숫자와 `-` `_` `.` 만 쓴다. 1~64자. 기여한 훅/규칙 id 앞에 `id:` 로 붙는다. |
| `version` | 예 | 표시용 버전 문자열. |
| `name` | 아니오 | 표시 이름. 없으면 `id` 를 쓴다. |
| `description` `author` `license` `homepage` | 아니오 | 목록에 그대로 표시한다. |
| `hooks` | 아니오 | 훅 정의 배열. 최대 64개. |
| `rules` | 아니오 | 규칙 정의 배열. 최대 64개. |

`id` 나 `version` 이 없거나 훅의 `event` 를 모르면 플러그인을 **읽기 실패**로 표시하고
기여를 등록하지 않는다. 오류 문구는 확장 화면에 그대로 나온다.

## 훅 정의

| 필드 | 설명 |
| --- | --- |
| `id` | 플러그인 안에서 고유한 이름. |
| `event` | 훅 시점. 아래 목록의 값만 쓴다. |
| `handler` | `builtin` 또는 `command`. `prompt`/`agent` 는 아직 실행 경로가 없다. |
| `builtinId` `builtinArgument` | `builtin` 일 때의 검사 종류와 인자. |
| `command` | `command` 일 때 실행할 셸 명령. |
| `toolPattern` | 도구 이름 조건. `a|b` 목록과 `*` 를 쓴다. 부분 문자열 일치는 하지 않는다. |
| `pathGlob` | 경로 조건. `*`(구분자 제외), `**`(구분자 포함), `?` 를 쓴다. |
| `timeoutMs` | 200~120000. 벗어나면 조정된다. |
| `failureMode` | `open`(실패해도 통과) 또는 `closed`(실패하면 차단). 차단 가능한 시점에서만 `closed` 를 쓴다. |

### 훅 시점

| id | 차단 | 입력 재작성 | 문맥 추가 |
| --- | --- | --- | --- |
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

## 명령 훅 계약

표준 입력으로 이벤트 JSON 이 들어온다.

```json
{ "event": "coding.file.pre", "sessionId": "", "cwd": "/작업/폴더", "filePath": "/repo/a.ts" }
```

종료 코드로 상태를 판정한다.

- `0`: 정상. 표준 출력이 JSON 객체면 판정으로 읽는다. JSON 이 아니면 판정 없음이며 오류가 아니다.
- `2`: 차단. 표준 오류가 사유가 된다.
- 그 밖: 실패. `failureMode` 가 `closed` 면 차단으로 승격한다.

표준 출력 JSON 형식:

```json
{
  "decision": "allow | ask | deny | defer",
  "reason": "사용자에게 보일 사유",
  "updatedInput": { "command": "바꾼 입력" },
  "additionalContext": "덧붙일 문장"
}
```

`updatedInput` 은 재작성이 허용된 시점에서만 반영된다. 거부된 호출에는 전달하지 않는다.

## 규칙 정의

| 필드 | 설명 |
| --- | --- |
| `id` `title` `body` | 본문은 최대 4,000자. |
| `scope` | `global` 또는 `project`. |
| `pathGlob` | 특정 경로에서만 적용할 때 쓴다. |
| `priority` | 작을수록 먼저 붙는다. |

주입 예산을 넘는 규칙은 잘라 넣지 않고 통째로 제외한다. 제외된 규칙은 목록으로 보고한다.
