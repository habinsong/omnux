# Safe Refactor

[한국어](./SAFE_REFACTORING.md) · [English](./en/safe-refactoring.md)

업데이트 기준: 2026-09-12

Safe Refactor는 파일을 바로 덮어쓰지 않는다. 먼저 preview를 만들고, apply 직전에 파일 상태를 다시 확인한다. 데스크톱은 **리뷰** 화면이다.

## 방식

| 화면 표시 | 방식 | 하는 일 |
|---|---|---|
| 줄 범위 | Anchor Edit | 줄 범위와 line hash를 기준으로 교체 |
| 패턴 | AST Replace | ast-grep pattern·rewrite 결과를 적용 |
| 이름 | LSP Rename | 언어 서버가 계산한 rename edit를 적용 |

줄 범위는 항상 쓸 수 있다. 패턴과 이름 모드는 기본으로 꺼져 있어서 환경변수로 켜고, 해당 도구가 PATH에 있어야 한다.

| 변수 | 기본값 | 필요한 도구 |
|---|---|---|
| `OMNUX_REFACTOR_ENABLE_AST_GREP` | `false` | `ast-grep` |
| `OMNUX_REFACTOR_ENABLE_LSP` | `false` | 해당 언어의 language server |

## 흐름

리뷰 화면 탭 순서대로 진행한다.

1. **1. 파일**: 대상 파일을 읽는다.
2. **2. 바꿀 내용**: 방식을 고르고 범위나 symbol·pattern을 정한 뒤 preview를 만든다.
3. **3. 확인·적용**: diff를 보고 적용한다. 적용 직전에 파일이 바뀌었으면 막고 preview를 다시 만들게 한다.

preview는 `workspace/.runtime/refactor-preview/`에 저장되고 기본 120분 뒤 만료된다(`OMNUX_REFACTOR_PREVIEW_TTL_MINUTES`, 5~1440분). 영속 설정이 아닌 작업 산출물 취급이라, 지워도 설정에 영향이 없다.

텔레그램에서도 `/refactor read`, `/refactor preview`, `/refactor apply`를 쓴다. 대형 diff는 전체를 풀지 않고 요약과 handoff만 보낸다.
