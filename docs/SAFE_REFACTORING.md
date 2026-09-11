# Safe Refactor

[한국어](./SAFE_REFACTORING.md) · [English](./en/safe-refactoring.md)

업데이트 기준: 2026-09-12

Safe Refactor는 파일을 바로 덮어쓰지 않는다. 먼저 preview를 만들고, apply 직전에 파일 상태를 다시 확인한다. 데스크톱은 **리뷰** 화면이다.

## 모드

| 화면 표시 | 방식 | 설명 |
|---|---|---|
| 줄 범위 | Anchor Edit | 줄 범위와 line hash를 기준으로 교체 |
| 패턴 | AST Replace | ast-grep pattern/rewrite 결과를 적용 |
| 이름 | LSP Rename | 언어 서버가 계산한 rename edit를 적용 |

패턴과 이름 모드는 `ast-grep`과 해당 언어 서버가 PATH에 있어야 한다.

## 흐름

리뷰 화면 탭 순서대로 진행한다.

1. **파일**: 대상 파일을 읽는다.
2. **바꿀 내용**: 모드를 고르고 범위나 symbol/pattern을 정한 뒤 preview를 만든다.
3. **확인·적용**: diff를 보고 적용한다. 적용 직전에 파일이 바뀌었으면 막고 preview를 다시 만들게 한다.

preview는 `workspace/.runtime/refactor-preview/`에 저장된다. 영속 설정이 아니라 작업 산출물이다.
