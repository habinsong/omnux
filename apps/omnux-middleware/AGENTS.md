# 미들웨어 AGENTS

이 디렉터리는 C# 미들웨어 본체다. 루트 [`AGENTS.md`](../../AGENTS.md)에 더해 아래 규칙을 따른다.

## 구조 규칙

- `CommandService`는 기능별 partial 파일에 책임을 나눈다.
- WebSocket 명령은 `Ws*CommandDispatcher`에 추가하고, `WebSocketGateway`는 조립에 집중시킨다.
- 애플리케이션 계층은 `src/Application/` 아래 도메인 서비스나 얇은 wrapper로 둔다.
- 판정, 파싱, 프롬프트 조립은 `*Policy` 타입으로 빼고 `apps/omnux-middleware-tests`에 단위 테스트를 붙인다.
- 새 상태 파일이나 디렉터리를 도입하면 `Infrastructure/Persistence`, `Infrastructure/Paths`, [환경변수와 상태 파일](../../docs/환경변수_및_상태파일.md) 문서를 같은 변경에서 갱신한다.

## 변경 원칙

- 기존 검색 가드, 루틴, 텔레그램 흐름을 우회하지 않는다.
- `PublishAot=true`라서 리플렉션 기반 DI를 쓸 수 없다. 새 핸들러와 서비스는 `Program.cs`에서 직접 조립한다.
- 외부 도구 상태 점검과 CLI 분기도 `Program.cs`에서 명시적으로 처리한다.
- 직렬화 형식이 추가되면 WebSocket, CLI, 저장 파일 사이에서 형식을 일관되게 유지한다.
- JSON 상태를 쓸 때는 `AtomicFileStore`를 거쳐 `.lock` lease와 원자 교체를 지킨다.

## 검증

| 대상 | 명령 |
|---|---|
| 빌드 | `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj` |
| 단위 테스트 | `dotnet test apps/omnux-middleware-tests/Omnux.Middleware.Tests.csproj` |
| 전체 | `npm test` |
| 샌드박스 연계 | `python3 apps/omnux-sandbox/executor.py --code "print('ok')"` |

`scripts/check-security-boundaries.mjs`가 정책 클래스와 게이트웨이 계약을 소스 문자열로 검사한다. 정책을 옮기거나 이름을 바꾸면 이 검사도 같은 변경에서 고친다.
