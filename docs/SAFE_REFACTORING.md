# Safe Refactor

[한국어](./SAFE_REFACTORING.md) · [English](./en/safe-refactoring.md)

업데이트 기준: 2026-09-12

Safe Refactor는 대상 소스 코드를 즉시 덮어쓰지 않고 변경 위험을 단계적으로 통제하는 리팩터링 파이프라인입니다. 먼저 변경 미리보기(preview)를 생성한 뒤, 적용(apply) 직전에 파일의 변경 여부를 재검증합니다. 데스크톱 앱에서는 **리뷰** 화면에서 진행합니다.

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

리뷰 화면의 단계별 탭 순서에 따라 안전하게 진행합니다.

1. **1. 파일**: 수정할 대상 파일을 선택하고 내용을 로드합니다.
2. **2. 바꿀 내용**: 리팩터링 방식(줄 범위/패턴/이름)을 지정하고 preview를 생성합니다.
3. **3. 확인·적용**: 계산된 diff를 검토한 뒤 패치를 적용합니다. 적용 직전 파일 해시가 변경되었으면 덮어쓰기를 자동 차단하고 preview 재구성을 요구합니다.

preview는 `workspace/.runtime/refactor-preview/`에 저장되고 기본 120분 뒤 만료된다(`OMNUX_REFACTOR_PREVIEW_TTL_MINUTES`, 5~1440분). 영속 설정이 아닌 작업 산출물 취급이라, 지워도 설정에 영향이 없다.

텔레그램에서도 `/refactor read`, `/refactor preview`, `/refactor apply`를 쓴다. 대형 diff는 전체를 풀지 않고 요약과 handoff만 보낸다.
