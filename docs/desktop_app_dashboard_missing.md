# omnux 앱 대시보드 고유 누락 목록

기준일: 2026-06-04

비교 대상:

- 앱 대시보드 프로토타입: `docs/archive/omnux-prototype`
- 현재 앱 대시보드: `apps/desktop/src`
- 제외: 레거시 정적 대시보드에서 온 항목. 구 대시보드 탭 누락은 `docs/desktop_legacy_dashboard_gap.md`에 따로 정리했다.

이 문서는 “omnux 앱 대시보드 자체에 있어야 하는 사용자 경험” 중 현재 구현에서 비어 있거나 와이어만 있는 항목을 정리한다.

## 개발 진행 현황

- 완료: route payload store, command palette 1차, Ask/Build provider·모델 ID 직접 전환, theme/detail level 전역 선호도, Settings 앱 표시/기본 프로젝트/전역 권한, Settings TTS 세부 설정, 사용자 단축키 커스터마이즈, Settings Start on launch, Models & services provider priority drag와 Ask/Build quick dropdown 정렬, Permission Always allow 정책 저장, Home intent/payload/resource rail, Ask suggested prompts/답변 액션, Ask/Build RAG 원문 미리보기, Ask/Build/Logic 공통 문맥 picker, Logic 노드 리사이즈/path browser/run I/O 상세, Build/Refactor Safe Refactor anchor preview/apply Permission Modal, Operations cleanup/git apply Permission Modal, Operations 자연어 명령 콘솔, Operations workspace 파일 브라우저/검색, Operations guard retry timeline, Operations guard alert dispatch 설정/테스트, Insights sandbox/route metrics/repair quality 패널, 전역 Toast host, Activity 알림 ping/팝오버/상세 모달/Build handoff, Activity 타입 필터/product history 요약, Automate 생성 템플릿/시작 방식 타일/루틴별 권한 세그먼트/Telegram 명령 미리보기, Projects compact options menu, Notebook 빠른 기록 가져오기.
- 남음: Language, Automate file-change trigger 계약, Build/Ask project context의 작업 경로 결합.
- 우선순위: P0은 권한·알림·자동화 생성처럼 사용자가 매일 누르는 앱 공통 흐름, P1은 Activity/Projects/Settings의 완성도 보강과 Language i18n처럼 저장 정책·전역 영향이 큰 설정이다.

## 현재 앱 페이지 전체 목록

현재 `apps/desktop/src/App.tsx` 기준 페이지:

- 홈 `home`
- 질문 `ask`
- 빌드 `build`
- 자동화 `automate`
- 탐색 `explore`
- 프로젝트 `projects`
- 활동 `activity`
- 로직 `logic`
- 인사이트 `insights`
- 노트북 `notebooks`
- 스킬 `skills`
- 라우팅 `routing`
- 계획 `planning`
- 리팩터 `refactor`
- 에이전트 `agents`
- 설정 `settings`
- 운영 `operations`
- 셸 `shell`

프로토타입 기준 앱 셸 페이지:

- Home, Ask, Build, Automate, Projects, Activity, Settings
- 전역 Command Palette, Permission Modal, Toasts
- Sidebar, TopBar, Simple/Advanced, Theme, Language

## 1. 앱 셸 / 전역 네비게이션

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/app.jsx`
- 프로토타입: `docs/archive/omnux-prototype/shell.jsx`
- 프로토타입: `docs/archive/omnux-prototype/palette.jsx`
- 현재: `apps/desktop/src/App.tsx`
- 현재: `apps/desktop/src/features/shell/DesktopTopBar.tsx`
- 현재: `apps/desktop/src/features/shell/navigation-store.ts`
- 현재: `apps/desktop/src/features/dialog/DesktopDialogHost.tsx`

누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 부분 구현 | `⌘K` command palette | `CommandPalette`가 추가되어 `⌘K`/`Ctrl+K`, 검색, 그룹별 명령, 선택 실행, 페이지 이동, theme/detail level 전환, Settings 세부 deep link, Ask/Build provider 직접 전환, Ask/Build 모델 ID 직접 선택을 처리한다. |
| 부분 구현 | command palette 명령 목록 | Ask, Build, Automate 생성, 모델 비교, 파일 분석, 프로젝트/활동/설정/운영 등 주요 이동, Ask/Build provider·모델 ID 전환, theme/detail level 전환, 모델 키/CLI/Telegram/백업 동기화/기본 프로젝트 설정 진입이 추가됐다. 대화 본문 검색/스킬 적용 명령은 남아 있다. |
| 부분 구현 | Simple/Advanced 전역 토글 | topbar와 Settings `앱 표시`가 같은 localStorage 기반 전역 선호도를 공유한다. 페이지별 UI 노출 수준 반응은 아직 일부 화면에만 적용된다. |
| 부분 구현 | Theme | glass/light/dark 순환과 Settings 명시 설정이 같은 전역 선호도를 공유한다. system theme 선택은 없다. |
| 누락 | Language | 프로토타입은 `omnux-lang`과 `window.t()` 기반 한국어/영어 전환을 가진다. 현재 앱은 한국어 고정 UI다. |
| 반영됨 | Permission Modal | `DesktopDialogHost`에 permission kind가 추가되어 실행 액션, 변경 파일, 실행 명령, approval token, `Allow once`, `Always allow here`, `Preview diff`를 표시한다. Safe Refactor apply와 Operations cleanup/git apply에 연결됐고, `Always allow here` grant와 전역 권한 기본값은 localStorage 정책으로 저장된다. |
| 반영됨 | Toast system | 전역 `DesktopToastHost`와 toast store가 추가됐다. UI log의 warn/error는 페이지 내 로그와 함께 전역 토스트로도 표시된다. |
| 반영됨 | 알림 버튼 | TopBar 알림 아이콘에 warn/error unread ping과 최근 알림 팝오버가 추가됐다. 팝오버에서 Activity로 이동하면 기존 Activity 상세 모달과 Build handoff로 이어진다. |
| 부분 구현 | 사용자/워크스페이스 chip | 현재 하단 chip은 settings 이동만 한다. 프로토타입처럼 workspace 메뉴/옵션은 없다. |
| 반영됨 | route payload 전달 | `navigation-store.ts`가 `routePayload/routeVersion`을 보관한다. Home/Palette/Projects/Activity에서 Ask/Build/Automate/Settings로 input/mode/create/project/log/focus payload를 넘기고 각 페이지가 소비한다. |

## 2. 홈

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/home.jsx`
- 현재: `apps/desktop/src/features/home/HomePage.tsx`

현재 반영됨:

- 인사말, hero 입력, 빠른 시작 카드, 이어서 작업하기, 활성 프로젝트.
- 프로젝트 실데이터 조회.
- 최근 UI log 기반 활동 표시.
- 오른쪽 Resource usage rail.

누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 부분 구현 | hero 입력 intent routing | 홈 hero 입력이 질문/빌드/자동화/모델 비교/파일 분석으로 분류되고 작은 intent 배지를 표시한다. 더 정교한 intent 설명/확신도 표시는 남아 있다. |
| 부분 구현 | hero 입력 payload 전달 | 입력 내용을 Ask/Build/Automate로 전달한다. 프로젝트/모델 선택 팝오버와 결합한 payload는 남아 있다. |
| 부분 구현 | Attach files/Choose model | 현재 버튼은 Ask/Projects/Settings 이동만 한다. 파일 선택기나 모델 선택 팝오버를 직접 열지 않는다. |
| 부분 구현 | Continue where you left off | 현재 UI log 기반이다. 프로토타입은 activity item을 열어 상세 모달로 이어진다. 현재 홈 항목 클릭은 Activity 이동만 한다. |
| 부분 구현 | Active projects card action | 현재 프로젝트 클릭은 Projects로 이동하고 touch한다. 프로토타입은 project를 열어 Build로 바로 연결하는 흐름이 있다. |
| 부분 구현 | 오른쪽 rail | 홈에 Resource usage rail이 추가됐다. Models & services rail은 아직 없다. |
| 부분 구현 | Resource usage | `get_metrics` 실제 응답에서 CPU/Memory/Tasks 관련 키를 찾아 표시한다. metrics에 해당 키가 없으면 `-`로 표시하며 값을 만들지 않는다. |

## 3. Ask

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/ask.jsx`
- 현재: `apps/desktop/src/features/ask/AskPage.tsx`

현재 앱은 프로토타입보다 백엔드 연결이 많다.

현재 반영됨:

- 대화 목록/검색/메타 저장.
- 모델/provider 선택.
- multi 결과 carousel.
- 첨부, 음성 입력, Think+, RAG/Vision preflight.
- suggested prompt chip.
- 답변별 Notebook/Plan/Build/Automate/Compare/읽기/복사 액션.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 부분 구현 | route payload 기반 compare/file mode 진입 | Ask가 `{ mode: "compare" }`를 multi 모드로, `{ mode: "file" }`/`openAttachmentPanel`을 첨부 패널 open으로 소비한다. 실제 파일 선택기 자동 open은 남아 있다. |
| 반영됨 | suggested prompts | EmptyState에서 요약/코드 리뷰/모델 비교/파일 분석 제안 프롬프트를 제공하고 입력창·모드·첨부 패널 상태를 채운다. |
| 반영됨 | 답변 액션 세트 | 답변마다 Notebook 저장, Plan 생성, Build 열기, Automate 초안, Compare 열기, 읽기, 복사를 제공한다. |
| 부분 구현 | 모델 quick dropdown | 현재 모델 dock은 강력하지만 프로토타입처럼 헤더의 간단 provider dropdown으로 빠르게 전환하는 흐름은 다르다. |

## 4. Build

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/build.jsx`
- 현재: `apps/desktop/src/features/build/BuildPage.tsx`

현재 앱은 프로토타입보다 실제 코딩 백엔드 연결이 많다.

현재 반영됨:

- 코딩 모드별 실행.
- 결과 도크, 진행률, 실행 로그, 파일 프리뷰, iframe preview.
- Safe Refactor dock.
- notebook/plan 연결.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 반영됨 | 홈/활동에서 Build 입력 payload 자동 주입 | 홈/팔레트/프로젝트에서 Build input/project payload를 전달한다. Activity 상세 모달에서도 로그 맥락을 Build 입력으로 전달한다. |
| 부분 구현 | plan → diff → permission modal → apply 흐름 | 현재 실제 코딩 결과/리팩터 preview는 있으나 프로토타입의 앱 공통 permission modal과 결합된 단순 plan/diff 승인 흐름은 없다. |
| 부분 구현 | Run check quick path | 현재 실행/재실행은 결과 기반이다. 프로토타입처럼 Build 첫 화면에서 “Run build check”를 독립 액션으로 시작하는 흐름은 명확하지 않다. |
| 부분 구현 | Advanced details 전역 토글 반응 | 현재 빌드 화면에 자체 상세 패널/도크가 많지만 topbar의 Advanced 값과 연결되어 자동으로 모델 route/log/console 노출 수준이 바뀌지는 않는다. |

## 5. Automate

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/automate.jsx`
- 현재: `apps/desktop/src/features/automate/AutomatePage.tsx`
- 현재: `apps/desktop/src/features/automate/RoutineCreateWizard.tsx`

현재 반영됨:

- 루틴 생성/수정/삭제/토글/실행/상세.
- 스케줄, Telegram 응답, browser agent, retry, notify policy.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 반영됨 | route payload `{ create: true }`로 생성 패널 열기 | 팔레트/홈/Ask 답변 액션에서 Automate 생성 패널을 열고 입력을 요청 초안으로 넣는다. |
| 부분 구현 | trigger tile 4종 | Schedule/Telegram/Manual 성격의 시작 방식 타일을 생성 1단계에 추가했다. File change 타일은 백엔드 계약이 없어 비활성 안내로 표시한다. |
| 반영됨 | 루틴별 권한 세그먼트 | 루틴 생성 마지막 단계에서 read/write/run/network/delete allow/ask/deny를 설정한다. 기본값은 Settings 전역 권한 정책에서 시작하며 생성/수정 payload의 `permissions`로 전달한다. |
| 반영됨 | Telegram command preview | 생성 1단계에서 현재 요청/브라우저 에이전트 설정 기준 `/routine create ...` 명령을 미리 보여준다. |
| 반영됨 | Start from a template | 아침 브리핑, 사이트 점검, 브라우저 작업, 주간 리포트 템플릿을 생성 1단계에 추가했다. |

## 6. Projects

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/projects.jsx`
- 현재: `apps/desktop/src/features/projects/ProjectsPage.tsx`

현재 반영됨:

- 프로젝트 목록 실데이터.
- 프로젝트 추가/수정/대표 지정/삭제.
- runs/automations/lastOpened 표시.
- Ask/Build 버튼.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 반영됨 | 프로젝트 옵션 메뉴 | 프로젝트 카드 우측 상단 옵션 메뉴에서 수정, 대표 지정, 삭제를 제공한다. 카드 하단은 Ask/Build 주 액션만 남겨 밀도를 낮췄다. |
| 부분 구현 | 프로젝트 열기 후 Build로 직접 이동 | 프로젝트 카드 클릭과 홈 활성 프로젝트 클릭이 Build로 이동하며 project payload를 넘긴다. Operations에는 workspace 파일 브라우저/검색이 있으나 Build 내부 작업 경로 고정과 직접 결합은 남아 있다. |
| 부분 구현 | Ask/Build에 프로젝트 컨텍스트 전달 | Projects의 Ask/Build 버튼이 project payload를 넘기고 Ask/Build 메타 project를 채운다. 백엔드 요청의 작업 cwd/path 정책과 완전 결합은 남아 있다. |

## 7. Activity

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/projects.jsx`의 `ActivityPage`, `ActivityDetail`
- 현재: `apps/desktop/src/features/activity/ActivityPage.tsx`
- 현재: `apps/desktop/src/features/activity/SessionReplayPanel.tsx`

현재 반영됨:

- 현재 세션 UI log.
- info/warn/error 필터.
- Ask/Build/Automate/Compare/Planning/Ops 타입 필터.
- UI log 기반 Product history 요약.
- Session replay panel.
- 로그 export/clear.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 반영됨 | 활동 타입 필터 | info/warn/error 로그 레벨 필터에 더해 Ask/Build/Automate/Compare/Planning/Ops 타입 필터를 제공한다. 타입은 실제 UI log의 source/message에서 추론한다. |
| 부분 구현 | ActivityDetail modal | Activity row 클릭 시 메시지/source/time/component stack 상세 모달을 연다. failed/warn은 `Build에서 수정`, 일반 항목은 `Build로 열기`를 제공한다. 프로토타입의 files/change detail은 아직 없다. |
| 부분 구현 | Activity as product history | UI log 기반 Product history 요약 패널을 추가했다. 다만 프로토타입의 runs/changes/automations처럼 파일·변경 상세를 가진 영속 작업 이력은 아직 아니다. |
| 반영됨 | 실패 항목 Build handoff | 실패/warn 활동 상세에서 Build 입력으로 로그 맥락을 전달한다. |

## 8. Settings

근거 파일:

- 프로토타입: `docs/archive/omnux-prototype/settings.jsx`
- 현재: `apps/desktop/src/features/settings/SettingsPage.tsx`

현재 앱은 실제 백엔드 설정이 더 많다.

현재 반영됨:

- OTP, Telegram, 외부접속.
- LLM API key/CLI auth/model/usage.
- memory notes/index/backup.
- TTS 자동 읽기/음성/속도/음높이/볼륨/markdown 제거.
- 사용자 단축키 캡처/충돌 표시/기본값 복원.

앱 고유 관점 누락/부분 구현:

| 상태 | 항목 | 현재 차이 |
|---|---|---|
| 부분 구현 | Appearance 명시 설정 | Settings `일반 > 앱 표시`에서 glass/light/dark를 명시 선택한다. system 선택은 없다. |
| 반영됨 | TTS 세부 설정 | Settings `일반 > 음성 출력`에서 자동 읽기, 언어, 시스템 음성, 속도/음높이/볼륨, markdown 제거, 샘플 재생/정지를 저장한다. Ask/Build 수동 읽기와 자동 읽기가 같은 설정을 사용한다. |
| 반영됨 | 사용자 단축키 | Settings `일반 > 단축키`에서 팔레트, 페이지 이동, 작성창 포커스/검색/새 대화, TTS 단축키를 캡처하고 충돌을 표시하며 기본값으로 복원한다. |
| 누락 | Language 설정 | English/한국어 전환이 없다. |
| 부분 구현 | Detail level 설정 | topbar와 Settings `앱 표시`가 간단히/고급 값을 공유하고 저장한다. 각 페이지가 이 값을 기준으로 상세 패널을 완전히 전환하지는 않는다. |
| 반영됨 | Default project 설정 | Settings `일반 > 기본 프로젝트`에서 Projects store의 대표 프로젝트를 조회하고 지정한다. |
| 반영됨 | Start on launch | Settings `일반 > 시작 시 실행`에서 Tauri command로 OS 로그인 자동 시작 상태를 조회·토글한다. macOS LaunchAgent, Linux autostart desktop entry, Windows Run registry를 사용하며 브라우저/Vite 검증 환경에서는 미지원 상태로 비활성화한다. |
| 반영됨 | Global permissions | Settings `일반 > 전역 권한`에서 read/write/run/network/delete 기본값을 allow/ask/deny로 저장한다. 저장된 `Always allow here` grant 목록 조회와 해제도 제공한다. |
| 반영됨 | Models & services priority drag | Settings `모델 · 키 > 우선순위`에서 Groq/Gemini/Codex/Copilot/Cerebras/NVIDIA provider 순서를 드래그와 위/아래 버튼으로 조정하고 localStorage에 저장한다. 저장된 순서는 Ask/Build provider quick dropdown과 모델 dock 정렬에 반영된다. intent별 provider chain override는 기존 `routing` 페이지가 계속 담당한다. |
| 부분 구현 | Integrations GitHub/Local shell 카드 | 현재 Telegram/외부접속/CLI auth는 있으나 GitHub 연동 카드와 Local shell 권한 관리 카드는 없다. |

## 9. 앱 고유 누락 우선순위

1. 보류: Automate file-change trigger — **백엔드에 파일 감시 trigger 계약이 없어 미구현**(grep 0). 백엔드 구현이 선행되어야 함. 생성 1단계 file-change 타일은 비활성 안내만 제공.
2. P1: Projects의 Build/Ask project context를 실제 작업 경로 정책과 더 강하게 결합.
3. P1: Settings의 Language i18n을 실제 저장소와 연결.
