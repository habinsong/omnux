# Settings Language i18n 구현 계획

기준일: 2026-06-05

대상:

- 현재 앱 대시보드: `apps/desktop/src`
- 설정 화면: `apps/desktop/src/features/settings/SettingsPage.tsx`
- 전역 선호도 store: `apps/desktop/src/features/shell/preference-store.ts`
- 제외: 구 웹/레거시 대시보드, `apps/omnux-dashboard`

이 문서는 `Settings Language i18n`을 실제 개발하기 전, 어떤 범위와 순서로 구현할지 정리한 계획서다.
이번 문서 작성 단계에서는 앱 코드, 미들웨어 코드, 기존 누락 문서 상태를 변경하지 않는다.

## 1. 목표

Settings의 `Language` 설정을 단순 버튼 하나로 끝내지 않고, 앱 대시보드 전체가 선택 언어에 따라 일관되게 렌더링되는 구조로 만든다.

최종 완료 기준:

- Settings `일반` 그룹에 `언어` 카드가 생긴다.
- 사용자는 `한국어`와 `English` 중 하나를 선택할 수 있다.
- 선택값은 앱 재시작 후에도 유지된다.
- Sidebar, TopBar, Command Palette, Settings, Home, Ask, Build, Automate, Projects, Activity, Logic, Insights, Notebooks, Skills, Routing, Planning, Refactor, Agents, Operations의 주요 정적 UI 문자열이 선택 언어로 바뀐다.
- 날짜/시간/숫자 포맷은 선택 언어의 locale을 따른다.
- 백엔드에서 온 사용자 데이터, 파일 경로, 모델명, provider명, 로그 원문, 코드, 명령어, JSON key는 번역하지 않는다.
- TTS의 음성 언어 설정과 UI 언어 설정은 서로 다른 설정으로 유지하되, Settings 화면에서 혼동되지 않게 설명한다.

## 2. 비목표

이번 i18n 작업에서 하지 않을 것:

- 백엔드 메시지 전체를 즉시 다국어화하지 않는다.
- 미들웨어의 모든 에러 문자열을 일괄 번역하지 않는다.
- 레거시 웹 대시보드의 `window.t()` 구조를 그대로 이식하지 않는다.
- 런타임에 임의 JSON 번역 파일을 네트워크로 내려받지 않는다.
- 브라우저 기본 `window.alert`, `confirm`, `prompt`를 추가하지 않는다.
- raw JSON 덤프를 번역 검증 UI로 노출하지 않는다.
- 영어 외 제3언어를 이번 범위에 넣지 않는다.
- 사용자 작성 콘텐츠, 노트북 본문, 메모리 노트 본문, 루틴 요청문, 실행 로그 원문은 자동 번역하지 않는다.

## 3. 현재 상태 요약

### 3.1 앱 대시보드

현재 `apps/desktop/src`는 한국어 고정 UI다.

읽기 전용 점검 결과, 한글 UI 문자열은 Settings에만 있지 않고 여러 파일에 분산되어 있다.

상위 문자열 분포:

| 파일 | 한글 문자열 출현 수 성격 |
|---|---|
| `features/build/BuildPage.tsx` | Build 화면 라벨, 버튼, 상태, 빈 화면 |
| `features/ask/AskPage.tsx` | Ask 대화 UI, composer, 응답 액션 |
| `features/automate/AutomatePage.tsx` | 루틴 목록, 필터, 상태, 액션 |
| `features/settings/SettingsPage.tsx` | 설정 그룹, 카드, 설명, 버튼 |
| `features/ops/OperationsPage.tsx` | 운영 도구, 경고, 실행 상태 |
| `features/shell/CommandPalette.tsx` | 팔레트 명령, 키워드, 설명 |
| `features/shell/DesktopTopBar.tsx` | 검색, 알림, 런타임 상태 |
| `App.tsx` | 사이드바 페이지명, 사용자/워크스페이스 chip |

따라서 `SettingsPage.tsx`에 언어 셀렉트만 추가하면 기능은 미완성이다.
Language i18n은 전역 선호도, 번역 함수, 주요 화면 문자열 치환, 포맷터 정리까지 묶어야 완료로 판단한다.

### 3.2 프로토타입

프로토타입 `docs/archive/omnux-prototype/i18n.jsx`는 다음 구조를 사용했다.

- 영어 문자열을 key로 사용
- 한국어 override map 사용
- `window.OMNUX_I18N.lang`
- `window.t()`
- `omnux-lang` 저장

이 방식은 빠른 프로토타입에는 적합하지만 현재 React/Tauri 앱에는 그대로 쓰지 않는다.
현재 앱은 TypeScript, Zustand, Tailwind 기반이므로 타입이 있는 `t()`/`useI18n()` 구조로 재설계해야 한다.

### 3.3 현재 선호도 저장 방식

`preference-store.ts`는 이미 아래 설정을 localStorage에 저장한다.

- `omnux-theme`
- `omnux-detail-level`
- `omnux-start-on-launch-preference`
- `omnux-model-provider-priority-v1`
- `omnux-desktop-shortcuts-v1`

Language도 같은 계층의 전역 앱 선호도로 두는 것이 현재 구조와 가장 잘 맞는다.

권장 저장 키:

- `omnux-language`

권장 값:

- `ko`
- `en`

기본값:

- 1차 구현은 `ko`
- `system` 모드는 이번 범위에서 제외하거나 후속 옵션으로 설계만 둔다

## 4. 제품 정책

### 4.1 지원 언어

1차 지원 언어:

| 코드 | 표시명 | Locale | 비고 |
|---|---|---|---|
| `ko` | 한국어 | `ko-KR` | 현재 기본 UI 언어 |
| `en` | English | `en-US` | 프로토타입에 있던 대응 언어 |

`system` 옵션은 1차에서 넣지 않는 편이 안전하다.
이유는 `navigator.language`가 `en-KR`, `ko-US`처럼 애매한 조합일 때 화면과 날짜 포맷 정책을 별도로 정해야 하고, 사용자가 명시적으로 바꾼 값과 시스템 추종 값을 구분해야 하기 때문이다.

후속에서 `시스템 기본`을 넣는다면 저장값을 `system`으로 두고 실제 resolved language를 `ko` 또는 `en`으로 계산한다.

### 4.2 기본 언어

기존 앱이 한국어 고정이므로 기본값은 `ko`다.

신규 사용자에게도 한국어가 기본으로 보이는 것이 현재 저장소 문서와 사용자 지침에 맞다.
영어 UI는 사용자가 Settings에서 명시적으로 선택했을 때만 활성화한다.

### 4.3 번역 대상

번역한다:

- 페이지 제목
- 탭/그룹/카드 제목
- 버튼 라벨
- placeholder
- empty state 제목과 설명
- 상태 badge 중 UI가 만든 상태값
- tooltip/title/aria-label
- Command Palette 명령명, 설명, 검색 키워드
- 권한 결정 라벨
- Settings 설명문
- 날짜/시간 포맷의 locale

번역하지 않는다:

- 파일 경로
- provider id, model id
- 코드 언어명 값 자체
- 명령어
- 로그 원문
- 백엔드 raw error detail
- 사용자 입력
- 메모리 노트/노트북/대화 본문
- JSON key
- WebSocket request/response type

부분 가공한다:

- 백엔드 error는 원문을 숨기지 않고, 앞에 사용자 친화적 요약만 언어별로 붙인다.
- `Groq · llama-3.3` 같은 조합은 UI 접두사만 번역하고 모델명은 그대로 둔다.
- 날짜는 선택 locale로 포맷하되, 절대 시각 데이터는 바꾸지 않는다.

## 5. UX 설계

### 5.1 Settings 위치

위치:

- Settings
- `일반`
- `앱 표시` 바로 아래 또는 `앱 표시` 카드 내부의 독립 섹션

권장 구조:

- `앱 표시`: 테마, 상세도
- `언어`: 인터페이스 언어
- `시작 시 실행`
- `음성 출력`
- `단축키`
- `전역 권한`

언어는 TTS 언어와 혼동되기 쉬우므로 `음성 출력` 카드와 분리한다.

### 5.2 카드 구성

카드 제목:

- 한국어: `언어`
- English: `Language`

설명:

- 한국어: `앱 메뉴, 버튼, 상태 메시지에 사용할 인터페이스 언어입니다.`
- English: `Interface language for menus, buttons, and app status text.`

컨트롤:

- segmented control 2개
- `한국어`
- `English`

상태 표시:

- 저장됨: `저장됨` / `Saved`
- 현재 세션 적용: 선택 즉시 전체 앱 반영

주의 문구:

- 한국어: `대화 내용, 파일 경로, 실행 로그 원문은 번역하지 않습니다.`
- English: `Conversation content, file paths, and raw run logs are not translated.`

### 5.3 UIUX_design.md 준수

구현 시 지켜야 할 UI 원칙:

- Tailwind class만 사용한다.
- 새 CSS 파일, CSS module, inline style을 만들지 않는다.
- `Button`, `Badge`, `CardBoundary`, 기존 primitive를 재사용한다.
- 텍스트는 `truncate`, `min-w-0`, `shrink-0` 방어를 적용한다.
- segmented button은 `rounded-md`, `border`, `transition-colors duration-200`, `active:scale-[0.98]` 패턴을 따른다.
- 아이콘이 필요하면 Lucide의 `Languages` 또는 `Globe2`를 쓴다.
- 언어 선택 변경에 native alert를 쓰지 않는다.
- 저장 실패가 생긴다면 전역 toast 또는 카드 내 inline 상태로 표시한다.
- JSON translation map을 화면에 그대로 보여주지 않는다.

### 5.4 접근성

필수:

- 언어 컨트롤에 명확한 label 제공
- 현재 선택 버튼에 `aria-pressed`
- 설정 카드의 설명문과 컨트롤 관계가 명확해야 함
- 키보드 Tab으로 진입 가능
- Enter/Space로 선택 가능
- 포커스 링 유지

권장:

- `<html lang="ko">` 또는 `<html lang="en">` 갱신
- `document.documentElement.lang`를 설정 변경 즉시 반영

## 6. 기술 설계

### 6.1 파일 구조

권장 신규 파일:

| 파일 | 역할 |
|---|---|
| `apps/desktop/src/features/i18n/i18n-store.ts` | 언어 상태, 저장, locale 계산 |
| `apps/desktop/src/features/i18n/messages.ts` | 번역 catalog export |
| `apps/desktop/src/features/i18n/format.ts` | 날짜/시간/숫자 포맷 helper |
| `apps/desktop/src/features/i18n/types.ts` | `LanguageCode`, message key 타입 |

대안:

- `preference-store.ts`에 language까지 넣을 수 있다.
- 다만 번역 catalog와 포맷터까지 들어가면 `preference-store.ts`가 비대해진다.
- 따라서 상태 저장은 `preference-store.ts`와 같은 패턴을 따르되, i18n 전용 폴더를 두는 편이 유지보수에 유리하다.

권장 결론:

- `features/i18n` 전용 모듈을 만든다.
- `preference-store.ts`에는 언어를 넣지 않는다.
- 단, 저장 키와 normalize 패턴은 `preference-store.ts`와 동일하게 작성한다.

### 6.2 상태 모델

권장 타입:

- `LanguageCode = "ko" | "en"`
- `LocaleCode = "ko-KR" | "en-US"`

상태:

- `language`
- `locale`
- `setLanguage(language)`
- `t(key, params?)`
- `formatDateTime(value, options?)`
- `formatDate(value, options?)`
- `formatNumber(value, options?)`

저장:

- localStorage key: `omnux-language`
- invalid value는 `ko`로 normalize
- localStorage 실패 시 화면 상태만 유지

부수효과:

- `document.documentElement.lang = language`
- 필요 시 `<html data-language="ko">` 같은 data attribute 추가 가능

### 6.3 번역 key 전략

권장 방식:

- 안정적인 dot key 사용
- 예: `settings.title`, `settings.general.language.title`, `shell.search.placeholder`

피해야 할 방식:

- 프로토타입처럼 영어 원문 전체를 key로 쓰는 방식
- 이유: 문구를 조금만 바꿔도 key가 깨지고, TypeScript에서 누락 검출이 어렵다.

예시 key 범위:

- `app.nav.home`
- `app.nav.ask`
- `app.nav.build`
- `shell.commandSearch`
- `shell.notifications.title`
- `settings.title`
- `settings.subtitle`
- `settings.group.general`
- `settings.language.title`
- `settings.language.description`
- `settings.language.ko`
- `settings.language.en`
- `settings.language.rawContentNotice`

### 6.4 번역 catalog 형태

권장:

- `messages.ts`에서 `const ko = {...} as const`, `const en: Messages = {...}` 형태
- `ko`를 기준 catalog로 둔다.
- `en`은 `satisfies typeof ko` 또는 명시 타입으로 누락을 컴파일 시점에 잡는다.

중요:

- 모든 key가 양쪽 언어에 있어야 한다.
- fallback은 개발 중 누락 방어용으로만 사용한다.
- 운영 UI에서 key 문자열이 그대로 보이면 실패로 본다.

### 6.5 `t()` 사용 방식

컴포넌트:

- `const t = useI18n((state) => state.t)` 또는 `const { t } = useI18n()`
- JSX 문자열은 `t("...")`로 렌더링

컴포넌트 밖 상수:

- 페이지 정의, Command Palette action, shortcut definitions처럼 모듈 상단 상수에 문자열이 있는 파일은 함수형 builder로 바꾼다.
- 예: `buildSettingsActions(t)` 형태
- 단순히 store를 import해서 모듈 초기화 시 번역하면 언어 변경 후 재렌더링되지 않을 수 있다.

store 내부 메시지:

- Zustand store 안에서 사용자에게 보이는 error/status를 직접 한국어로 저장하지 않는 방향이 좋다.
- 가능한 경우 store는 `errorCode` 또는 원문 `detail`을 저장하고, 컴포넌트가 `t()`로 표시한다.
- 이미 store에 문자열을 저장하는 곳은 1차에서 화면 표시 직전 번역으로 처리하고, 2차에서 error code화한다.

### 6.6 interpolation

필요한 케이스:

- `{count}개`
- `{provider} 모델`
- `{time} 전`
- `{path} 열기`

권장:

- 단순 interpolation helper를 만든다.
- 복잡한 plural rule은 1차에서 최소화한다.
- 영어 plural은 자주 쓰이는 count 문자열부터 별도 helper로 처리한다.

예:

- `t("activity.alertCount", { count })`
- ko: `알림 {count}개`
- en: `{count} alerts`

### 6.7 날짜/시간/숫자 포맷

현재 코드에는 `toLocaleString("ko-KR")`, `toLocaleDateString("ko-KR")`, `toLocaleTimeString("ko-KR")`가 직접 박혀 있다.

계획:

1. i18n format helper를 만든다.
2. `formatNotificationTime`, `formatPermissionTime`, `formatAccessTime`, run time 표시 helper부터 교체한다.
3. 화면별 포맷터를 점진적으로 공통 helper로 이동한다.

규칙:

- 선택 언어가 `ko`면 `ko-KR`
- 선택 언어가 `en`이면 `en-US`
- 시간대는 시스템 기본을 유지한다.
- 날짜 값을 변경하거나 UTC/local 변환 정책을 새로 만들지 않는다.

### 6.8 검색 키워드와 Command Palette

Command Palette는 label/description뿐 아니라 keywords도 중요하다.

정책:

- UI 언어가 한국어일 때도 영어 keyword를 유지한다.
- UI 언어가 영어일 때도 한국어 keyword를 유지한다.
- 사용자는 어떤 언어로 검색해도 명령을 찾을 수 있어야 한다.

예:

- label은 `Settings` 또는 `설정`으로 바뀐다.
- keywords는 `["settings", "설정", "preferences", "환경설정"]`처럼 양쪽 언어를 모두 포함한다.

## 7. 구현 단계

### Phase 0. 사전 감사

목표:

- 실제 문자열 범위를 더 정확히 잡는다.

작업:

1. `rg -n "[가-힣]" apps/desktop/src --glob '*.ts' --glob '*.tsx'` 결과를 파일별로 분류한다.
2. 사용자에게 보이는 문자열과 내부 로그/개발자 문자열을 분리한다.
3. 각 파일을 아래 그룹으로 태깅한다.

그룹:

- Shell: `App.tsx`, `DesktopTopBar.tsx`, `DesktopNavigation.tsx`, `CommandPalette.tsx`
- Settings: `SettingsPage.tsx`, Settings 하위 panel/store
- Core pages: Home, Ask, Build, Automate, Projects, Activity
- Advanced pages: Logic, Insights, Notebooks, Skills, Routing, Planning, Refactor, Agents, Operations
- Shared: dialog, toast, ui-log, primitives
- Store status: 각 feature store의 사용자 노출 error/status

완료 기준:

- 번역 대상 문자열 목록이 파일별로 정리된다.
- 개발 대상 우선순위가 확정된다.

### Phase 1. i18n 기반 모듈 추가

목표:

- 앱 전체에서 쓸 수 있는 언어 상태와 번역 함수를 만든다.

작업:

1. `features/i18n` 폴더를 만든다.
2. `LanguageCode`, `LocaleCode`, message catalog 타입을 정의한다.
3. `omnux-language` localStorage read/write/normalize를 만든다.
4. Zustand 기반 i18n store를 만든다.
5. `setLanguage()`가 localStorage 저장과 `document.documentElement.lang` 갱신을 수행하게 한다.
6. `t()`가 key와 params를 받아 문자열을 반환하게 한다.
7. 누락 key는 개발 중 console warning 또는 UI log로만 남기고, 운영 화면에는 기준 언어 문자열을 fallback한다.

완료 기준:

- 언어 상태가 앱 재시작 후 유지된다.
- `document.documentElement.lang`가 변경된다.
- `ko`와 `en` catalog 누락이 TypeScript에서 잡힌다.

### Phase 2. Settings Language 카드 추가

목표:

- 사용자가 Settings에서 UI 언어를 바꿀 수 있게 한다.

작업:

1. `SettingsPage.tsx`의 `일반` 그룹에 `general-language` item을 추가한다.
2. `LanguageSettingsCard`를 만든다.
3. segmented control로 `한국어`, `English` 선택을 제공한다.
4. 현재 선택 상태 badge와 raw content 미번역 안내를 표시한다.
5. route payload focus alias에 `language`, `lang`, `i18n`, `언어`를 추가한다.
6. Command Palette Settings deep link에 `언어 설정` / `Language settings` 액션을 추가한다.

완료 기준:

- Settings에서 언어 선택이 가능하다.
- Settings를 나갔다 들어와도 선택 상태가 유지된다.
- 앱 재시작 후에도 선택 상태가 유지된다.
- 아직 전체 화면이 번역되지 않은 상태를 완료로 보지 않는다.

### Phase 3. Shell과 Settings 전체 문자열 전환

목표:

- 언어 변경 직후 사용자가 가장 먼저 보는 Shell과 Settings가 즉시 바뀌게 한다.

대상:

- `App.tsx`
- `DesktopTopBar.tsx`
- `DesktopNavigation.tsx`
- `CommandPalette.tsx`
- `SettingsPage.tsx`
- Settings 하위 panel
- `preference-store.ts`의 label/description 상수
- `permission-policy-store.ts`의 사용자 노출 label/description

작업:

1. 사이드바 page label/description을 `t()`로 전환한다.
2. TopBar 검색 placeholder, 런타임 상태, 알림 팝오버 문구를 전환한다.
3. Command Palette action builder가 `t()`를 받아 label/description을 만들게 한다.
4. Settings group/item/card title, desc, button, empty state를 전환한다.
5. shortcut definition label/description을 정적 상수에서 번역 가능한 builder로 바꾼다.
6. permission action label/description도 번역 가능한 구조로 바꾼다.

완료 기준:

- Settings에서 English 선택 시 Shell과 Settings에 남는 한국어 정적 문자열이 없어야 한다.
- 한국어 선택 시 기존 UX 의미가 유지된다.
- Command Palette 검색은 한국어/영어 키워드 모두 작동한다.

### Phase 4. 주요 업무 화면 전환

목표:

- 매일 쓰는 화면에서 언어 설정이 반쪽짜리로 보이지 않게 한다.

대상 순서:

1. Home
2. Ask
3. Build
4. Automate
5. Projects
6. Activity

작업:

- 페이지 제목, 설명, 버튼, 탭, placeholder, empty state를 번역한다.
- 날짜/시간 포맷을 i18n helper로 바꾼다.
- response action label을 번역한다.
- Ask/Build composer placeholder와 mode label을 번역한다.
- Automate trigger, schedule, permission, Telegram command preview의 UI 설명을 번역한다.
- Projects의 main project, path, action label을 번역한다.
- Activity의 filter, log level label, detail modal, Build handoff action을 번역한다.

완료 기준:

- `rg -n "[가-힣]"`에서 위 파일의 사용자 노출 정적 문자열이 의도된 예외만 남는다.
- 영어 UI에서도 사용자 데이터와 로그 원문은 원문 그대로 보인다.

### Phase 5. 고급 화면 전환

목표:

- 앱 전체에서 선택 언어가 일관되게 적용되게 한다.

대상:

- Logic
- Insights
- Notebooks
- Skills
- Routing
- Planning
- Refactor
- Agents
- Operations
- Explore
- Context Picker
- Dialog/Toast/UI Log

작업:

- Logic 노드 라이브러리 label/description 번역 구조를 만든다.
- Logic의 노드 타입 id는 번역하지 않고, 표시명만 번역한다.
- Insights metric label, sandbox/route/repair panel 문구를 번역한다.
- Notebooks kind label, template 버튼, 체크리스트 문구를 번역한다.
- Skills validation 안내와 기본 SKILL.md 삽입 안내를 번역한다.
- Routing policy UI label을 번역하되 provider/model id는 유지한다.
- Operations의 위험 작업 경고는 의미가 변하지 않도록 번역 검토를 강화한다.
- Dialog/Toast는 `kind`별 message key를 우선 사용하고, raw detail은 접어서 보여준다.

완료 기준:

- 앱 전체 주요 정적 UI가 `ko`/`en` 전환을 지원한다.
- 위험 작업 경고의 의미가 언어별로 동일하다.
- 의도적 예외 목록 외 한글 고정 UI가 없다.

### Phase 6. Store message 정리

목표:

- store가 사용자 노출 문자열을 직접 고정하지 않도록 줄인다.

작업:

1. 각 store의 `lastError`, `lastMessage`, `status` 중 UI 표시용 문자열을 조사한다.
2. 즉시 바꾸면 위험한 곳은 그대로 두고 예외 목록에 기록한다.
3. 신규 store 메시지는 `messageKey`, `messageParams`, `rawDetail` 구조로 저장한다.
4. 컴포넌트에서 `t(messageKey, params)`로 표시한다.

우선 대상:

- `settings-store.ts`
- `ask-store.ts`
- `build-store.ts`
- `automate-store.ts`
- `ops-store.ts`
- `logic-store.ts`
- `planning-store.ts`

완료 기준:

- 새로 작성되는 사용자 노출 메시지는 하드코딩 한국어로 store에 들어가지 않는다.
- 기존 백엔드 원문 detail은 잃지 않는다.

### Phase 7. 문서와 회귀 체크리스트 반영

목표:

- 완료 후 추적 문서와 검증 기준을 업데이트한다.

대상:

- `docs/desktop_app_dashboard_missing.md`
- `docs/desktop_legacy_dashboard_gap.md`
- 필요 시 `docs/backend_frontend_unconnected_features.md`
- 수동 회귀 체크리스트 문서

작업:

- Language 상태를 `누락`에서 `반영됨` 또는 `부분 반영`으로 변경한다.
- 부분 반영으로 남길 경우 어떤 화면이 아직 한국어 고정인지 명시한다.
- Settings Language 수동 QA 항목을 추가한다.

완료 기준:

- 문서 상태와 실제 UI 상태가 일치한다.

## 8. 우선순위

권장 우선순위:

1. i18n store와 catalog 타입
2. Settings Language 카드
3. Shell, Settings, Command Palette
4. Home, Ask, Build, Automate
5. Projects, Activity
6. Logic, Operations, Insights
7. Notebooks, Skills, Routing, Planning, Refactor, Agents, Explore
8. store message key 구조 정리
9. 문서 상태 업데이트

이 순서가 적절한 이유:

- 사용자는 언어를 Settings에서 바꾸므로 Settings와 Shell이 먼저 반응해야 한다.
- Ask/Build/Automate는 사용 빈도가 높다.
- Operations/Logic/Insights는 고급 화면이라 번역 정확성과 위험 경고 검토가 더 중요하다.
- store message 구조 정리는 영향 범위가 커서 UI catalog가 안정된 뒤 진행하는 편이 안전하다.

## 9. 검증 계획

### 9.1 정적 검증

필수:

- `npm run build` in `apps/desktop`
- `git diff --check`

권장:

- `rg -n "[가-힣]" apps/desktop/src --glob '*.ts' --glob '*.tsx'`
- `rg -n "toLocale(DateString|TimeString|String)\\(\"ko-KR\"" apps/desktop/src`
- `rg -n "window\\.alert|window\\.confirm|window\\.prompt" apps/desktop/src`

판정:

- 한글 문자열 검색 결과가 0일 필요는 없다.
- 예외 목록에 있는 사용자 콘텐츠 샘플, 한국어 keyword, 한국어 언어명, 테스트용 문구만 남아야 한다.

### 9.2 브라우저 수동 QA

확인 항목:

1. 앱 실행 후 기본 언어가 한국어다.
2. Settings `언어`에서 English를 선택한다.
3. Sidebar page label이 영어로 바뀐다.
4. TopBar 검색 문구와 알림 팝오버가 영어로 바뀐다.
5. Settings 그룹/카드/버튼이 영어로 바뀐다.
6. Command Palette가 영어 label을 보여준다.
7. Command Palette에서 `settings`, `설정`, `language`, `언어` 검색이 모두 작동한다.
8. 앱을 새로고침하거나 재시작해도 English가 유지된다.
9. 다시 한국어를 선택하면 UI가 한국어로 복귀한다.
10. 파일 경로, provider id, model id, 로그 원문은 번역되지 않는다.

### 9.3 화면별 회귀

최소 확인 화면:

- Home
- Ask
- Build
- Automate
- Settings
- Operations

확인 기준:

- 텍스트가 버튼 밖으로 넘치지 않는다.
- 좁은 폭에서 label이 세로로 찌그러지지 않는다.
- Settings nav와 nested item이 truncate된다.
- segmented control의 긴 영어 문구가 레이아웃을 깨지 않는다.
- empty state가 번역 후에도 dead end가 아니다.

### 9.4 접근성 확인

확인 항목:

- Tab으로 언어 카드에 접근 가능
- Space/Enter로 선택 가능
- `aria-pressed`가 현재 선택과 일치
- `<html lang>`가 선택 언어와 일치
- title/aria-label도 번역됨

## 10. 위험과 대응

| 위험 | 설명 | 대응 |
|---|---|---|
| 반쪽짜리 번역 | Settings만 영어가 되고 나머지는 한국어로 남을 수 있음 | Phase 3까지 완료 전에는 `부분 반영`으로만 표시 |
| key 누락 | 영어 catalog에 key가 빠질 수 있음 | TypeScript `satisfies`로 catalog shape 고정 |
| 모듈 상단 상수 문제 | language 변경 후 상수가 재계산되지 않음 | action/definition builder 함수로 전환 |
| store 문자열 고정 | store에 한국어 message가 저장되어 언어 변경 후 그대로 보임 | UI 표시 직전 번역, 장기적으로 messageKey 구조 |
| 날짜 locale 누락 | `ko-KR`이 직접 남아 영어 UI에서 한국식 날짜 표시 | i18n format helper로 교체 |
| 검색성 저하 | 영어 UI에서 한국어 검색이 안 되거나 반대 상황 발생 | Command Palette keywords는 양쪽 언어 모두 유지 |
| TTS 언어와 혼동 | UI Language와 Speech language를 같은 설정으로 오해 | Settings 카드 분리와 설명문 명시 |
| 위험 경고 의미 변질 | Operations/Permission 문구 번역 중 의미가 약해짐 | 위험 작업 문구는 별도 리뷰 목록으로 관리 |
| 레이아웃 붕괴 | 영어 문장이 길어져 버튼/카드 overflow 발생 | `truncate`, `min-w-0`, `shrink-0`, responsive wrapping 적용 |

## 11. 완료 판정

`Settings Language i18n 완료`라고 말할 수 있는 조건:

- Settings에서 언어 선택 가능
- 저장 지속성 확인
- Shell과 Command Palette 번역 완료
- Settings 전체 번역 완료
- Home/Ask/Build/Automate 주요 화면 번역 완료
- 고급 화면의 주요 정적 문자열 번역 완료
- 날짜/시간 포맷 locale 반영
- `npm run build` 통과
- 브라우저에서 한국어↔영어 전환 확인
- 문서의 Language 항목 상태 업데이트 완료

아직 완료로 말하면 안 되는 상태:

- Settings 카드만 추가됨
- 일부 화면만 영어로 바뀜
- 새로고침 후 언어 선택이 사라짐
- Command Palette가 한 언어로만 검색됨
- 위험 작업 경고가 한 언어에만 존재함
- raw key가 화면에 노출됨

## 12. 구현 전 최종 체크리스트

개발 착수 전에 확인할 것:

- `features/i18n` 전용 모듈로 갈지, `preference-store.ts` 통합으로 갈지 최종 결정
- 기본값 `ko` 확정
- 1차 지원 언어를 `ko`, `en`으로 고정
- `system` 언어 옵션은 후속으로 보류
- 번역 대상과 비대상 기준 공유
- Phase 3까지를 최소 사용자 가치 단위로 잡기
- 문서 상태는 Phase별 실제 완료 수준에 맞게만 갱신

## 13. 제안 작업 단위

실제 개발은 아래 단위로 나눠 진행한다.

1. `i18n-store/messages/format` 기반 추가
2. Settings Language 카드와 저장 persistence
3. Shell/App/TopBar/Navigation 번역
4. Command Palette 번역과 양언어 검색 유지
5. Settings 전체 번역
6. Home/Ask/Build/Automate 번역
7. Projects/Activity 번역
8. Logic/Operations/Insights 번역
9. 나머지 고급 화면 번역
10. store message key 정리
11. 검증과 문서 상태 업데이트

각 단위는 `npm run build`가 통과하는 상태로 끝내야 한다.
