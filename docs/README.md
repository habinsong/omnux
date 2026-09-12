# omnux 문서

[한국어](./README.md) · [English](./en/README.md)

업데이트 기준: 2026-09-12

필요한 문서부터 바로 열 수 있게 주제별로 나눴다. v1.0.6 기준이며 Tauri 데스크톱 앱 6개 영역 18개 화면, .NET 9 미들웨어, provider 7개, 외부접속 제한 모드, macOS/Linux/Windows setup을 다룬다.

```mermaid
flowchart LR
    A["설치하고 써 보고 싶다"] --> S["시작"]
    B["코드와 데이터 흐름이 궁금하다"] --> T["구조"]
    C["운영하다 막혔다"] --> O["운영"]
```

## 시작

| 문서 | 언제 보나 | English |
|---|---|---|
| [5분 시작](./QUICKSTART.md) | setup부터 첫 실행까지 순서대로 할 때 | [Open](./en/quickstart.md) |
| [사용법](./사용법_빠른시작.md) | 어느 화면에서 무엇을 누르는지 알고 싶을 때 | [Open](./en/usage.md) |
| [텔레그램 봇](./텔레그램_봇_가이드.md) | 밖에서 봇으로 omnux를 사용할 때 | [Open](./en/telegram-bot.md) |

## 구조

| 문서 | 다루는 내용 | English |
|---|---|---|
| [아키텍처](./아키텍처_흐름.md) | 요청이 지나는 경로, 명령 라우팅, 안전 경계 | [Open](./en/architecture.md) |
| [기술 스택](./기술스택_정리.md) | 언어별 책임, 원본 위치, 새 런타임 승인 기준 | [Open](./en/tech-stack.md) |
| [디렉터리 가이드](./디렉터리_가이드.md) | 어느 폴더에 무엇이 있는지 | [Open](./en/directory-guide.md) |
| [AGENTS와 스킬](./AGENTS_AND_SKILLS.md) | 지침 파일을 읽는 순서, 스킬 활성화 규칙 | [Open](./en/agents-and-skills.md) |

## 기능

| 문서 | 다루는 내용 | English |
|---|---|---|
| [계획과 Task Graph](./PLANNING_AND_TASKS.md) | 작업 화면의 계획 생성·승인·실행과 복구 | [Open](./en/planning-and-tasks.md) |
| [노트와 이어보기](./NOTEBOOKS_AND_HANDOFF.md) | 작업 기록 네 종류와 handoff 문서 | [Open](./en/notebooks-and-handoff.md) |
| [Safe Refactor](./SAFE_REFACTORING.md) | 미리 보기 세 가지 방식과 적용 직전 재확인 | [Open](./en/safe-refactoring.md) |
| [NVIDIA NIM](./nvidia-nim-provider.md) | `nvidia` provider의 기본값과 환경변수 | [Open](./en/nvidia-nim-provider.md) |

## 운영

| 문서 | 언제 보나 | English |
|---|---|---|
| [환경변수와 상태 파일](./환경변수_및_상태파일.md) | `OMNUX_*` 변수와 저장 위치를 확인할 때 | [Open](./en/environment-and-state.md) |
| [Doctor](./DOCTOR.md) | 무언가 안 될 때 먼저 돌려 볼 진단 | [Open](./en/doctor.md) |
| [검증 가이드](./검증_가이드.md) | 기능을 바꾼 뒤 무엇을 돌려야 하는지 | [Open](./en/validation.md) |
| [토큰과 메모리 초기화](./토큰_메모리_초기화_가이드.md) | 답변이 옛 문맥에 끌려갈 때 | [Open](./en/token-memory-reset.md) |
| [정리 기준](./CLEANUP.md) | 지워도 되는 것과 안 되는 것을 가를 때 | [Open](./en/cleanup.md) |
| [수동 회귀 체크리스트](./OMNUX_실환경_수동_최종회귀_체크리스트.md) | 릴리스 직전 사람이 직접 눌러 볼 때 | [Open](./en/manual-regression-checklist.md) |

## 저장소에 없는 문서

2026-09-07에 시작한 전면 리뉴얼의 조사·감사·이행 기록은 `docs/RENEWAL_2026-09-07.md`와 `docs/renewal/`에 있다. 작업 당시 상태를 그대로 남긴 자료라 현재 동작과 다를 수 있어서 `.gitignore`로 제외했고, 클론한 저장소에는 들어 있지 않다.

## 읽는 법

- 사용 문서에는 지금 화면에 보이는 동작만 적는다.
- 구조 문서에는 책임과 데이터 이동을 적는다.
- 환경변수 이름, 파일 경로, 명령 문자열은 코드와 같은 표기를 그대로 쓴다.
- 검증 문서는 통과한 것과 아직 확인하지 않은 것을 나눠 적는다.
- 담백한 문장으로 쓴다. 마케팅 형용사, 마무리 요약 문단, 부정 대구를 쓰지 않는다.
- 한국어 문서에 있는 절은 영어 문서에도 둔다.

화면 스크린샷은 `node scripts/audit-all-screens.mjs`로 `output/playwright/audit/all/`에 찍는다. `assets/readme/social-preview.png`는 GitHub 소셜 카드용이다.
