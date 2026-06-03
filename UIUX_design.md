# OMNUX B2B SaaS Design System & UI/UX Architecture

최종 업데이트: 2026-06-04

**[🚨 빅뱅 재구축(Big Bang Overhaul) 및 Tailwind 아키텍처 절대 강제 선언]**
현재 프로젝트는 약 4천 줄에 달하는 거대한 모놀리식 레거시 CSS(`App.css`)를 전면 폐기합니다.
앞으로 OMNUX의 모든 프론트엔드 스타일링은 **오직 "Tailwind CSS 기반 컴포넌트 아키텍처(shadcn/ui 스타일)"로만 작성**되어야 합니다.
- **CSS-in-JS (Styled-Components 등), CSS Modules, 기타 커스텀 `.css` 파일 생성을 엄격히 금지합니다.**
- 이 결정은 AI 모델과의 극강의 협업 속도를 달성하고, Vercel/Linear 수준의 초정밀 B2B SaaS 미학을 완벽하게 통제하기 위한 유일한 표준 스택입니다.
- 구형 클래스와 커스텀 CSS의 끔찍한 혼용(프랑켄슈타인 뷰)을 단호히 거부하며, 단 한 번의 철저한 수술로 기술 부채를 완전히 날려버립니다.

이 문서는 OMNUX 데스크톱 및 웹 대시보드 프론트엔드를 구축하는 **모든 인간 개발자와 AI 에이전트가 반드시 준수해야 하는 절대적인 UI/UX 바이블**입니다.
Vercel, Linear, Stripe의 '가차없는 정밀도(Unforgiving Precision)'와 Google Material Design 3(M3)의 '견고한 토큰 시스템(Tonal Elevation & Semantic Color)'을 결합하여, 최고 수준의 상용 SaaS 대시보드(전문가용 Cockpit)를 구축합니다.

**👑 핵심 철학: Low Floor, High Ceiling (초보자에게 친절하게, 전문가에게 강력하게)**
전문가용(Professional) 툴이라고 해서 TUI(Terminal UI)나 CLI처럼 접근하기 어렵고 매니악하게 만들라는 뜻이 **절대** 아닙니다. 초보자가 처음 앱을 켰을 때 직관적이고 예쁘고 쉽게 쓸 수 있어야 하며, 동시에 점진적 노출(Progressive Disclosure)을 통해 열리는 **'전문가용 뎁스(Expert Depth)' 역시 철저히 인간(Human)을 위해 정제되어야 합니다.**
- "전문가용"이라는 단어를 핑계로 AI가 뱉어낸 가공되지 않은 raw JSON 덩어리나 가독성 떨어지는 텍스트 덤프를 사용자에게 던지지 마십시오.
- 전문가가 쓰는 심화 기능일수록 시각적 노이즈가 없어야 하며, 키보드 단축키와 깔끔한 데이터 그리드(Data Grid)를 통해 **가장 손쉽고 빠르게(Effortless) 제어**할 수 있어야 합니다.

---

## 1. 🎨 3-Tier Theme Architecture (3단계 테마 시스템)

기존의 칙칙하고 매니악한 개발자 툴(Geeky Terminal) 감성을 완벽히 버립니다. OMNUX는 다음 3가지의 아름답고 대중적인 프리미엄 테마를 제공합니다. 하드코딩된 HEX는 금지되며 철저히 토큰으로 관리됩니다.

### 1.1 🌞 Light Mode (Clean & Crisp)
- **배경**: 눈부신 순백색(#FFFFFF)을 피하고, 차분한 오프화이트(`bg-slate-50` 또는 `#fafafa`)를 베이스로 씁니다.
- **표면**: 화이트 카드 위에 Vercel 특유의 아주 섬세하고 다중적인 그림자(`shadow-sm`, `shadow-md`)를 사용하여 깨끗하고 정밀한 인상을 줍니다.

### 1.2 🪟 Glass Mode (Default / Aero) - **기본 설정**
- **배경**: 단색 배경 대신, 뒤에 은은한 메인 컬러(파스텔톤의 블루/퍼플 Blob)가 부드럽게 퍼져있는 동적인 배경을 사용합니다.
- **표면**: 카드의 배경색을 반투명하게(`bg-white/40` 또는 다크 기반 `bg-black/20`) 설정하고, 강력한 블러 효과(`backdrop-blur-xl`, `backdrop-saturate-150`)를 입힙니다.
- **느낌**: Arc 브라우저나 Apple macOS처럼 UI가 살아 숨 쉬는 듯한 트렌디하고 예쁜 감각을 주어 긱(Geek)스러움을 완벽히 탈피합니다.

### 1.3 🌙 Dark Mode (Stripe Elegance)
- **배경**: 차갑고 해커스러운 Zinc/Slate 계열을 버립니다. 대신 아주 미세하게 따뜻함이 도는 풍부한 다크 톤(Warm Dark, 예: `#111113`, `#1A1A1E`)을 베이스로 사용합니다.
- **표면**: 단순한 검은색이 아니라, 버튼이나 카드 위에 미세하고 우아한 그라데이션 빛반사(Glow)와 풍부한 색감을 살려 하이엔드 금융/SaaS 툴(Stripe 등)의 럭셔리한 느낌을 줍니다.

### 1.4 Action Colors (버튼 및 인터랙션)
- **Primary Brand**: 쨍한 파란색이 아닌, 깊고 세련된 인디고(`indigo-500`)나 부드러운 코발트 블루를 사용합니다.
- **Destructive / Error**: 강렬한 레드 (`#ef4444`). **반드시 2-step 확인(Double Confirm)과 결합할 것.**
- **Success / Warning**: 형광 에메랄드 (`#10b981`), 호박색 (`#f59e0b`).

---

## 2. 📏 Layout, Grid, and High Density (초고밀도 레이아웃)

OMNUX는 전문가용 툴입니다. 화면을 낭비하는 B2C 스타일의 거대한 여백을 금지합니다.

### 2.1 The 4px / 8px Baseline Grid
모든 마진(Margin)과 패딩(Padding)은 4의 배수로 떨어져야 합니다. (Tailwind의 spacing scale 완벽 준수)
- **Micro Spacing**: 4px (`gap-1`, `p-1`) - 아이콘과 텍스트 사이, 배지 내부 여백.
- **Component Spacing**: 8px (`gap-2`, `p-2`) - 리스트 아이템 내부, 폼 컨트롤 사이.
- **Layout Spacing**: 16px (`gap-4`, `p-4`) - 카드 내부 패딩, 섹션 간 간격.
- **Section Spacing**: 32px (`gap-8`) - 최상위 레이아웃(메인 컨테이너) 패딩.

### 2.2 Blueprint Grid (건축학적 정밀함)
- 화면의 최하단 배경(`bg-background`)에는 1px 두께의 아주 연한 십자선/점선 그리드(Grid) 패턴을 깔아 엔지니어링 도구로서의 아이덴티티를 줍니다. (예: `background-image: linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)`)

### 2.3 Split-View & Docking (다중 뷰 분할)
- 단일 컬럼으로 화면을 차지하는 레이아웃을 금지합니다.
- `Sidebar (Nav)` | `List View (Master)` | `Detail View & Terminal (Slave)` 형태로 화면을 분할하여 **수평적 스크롤 없이 한 화면에서 모든 컨텍스트를 파악**할 수 있게 설계합니다.

### 2.4 Legacy Dashboard Continuity (레거시 대시보드의 진화적 계승)
- OMNUX의 기존 사용자 경험을 존중합니다. 과거 레거시 웹 대시보드(vanilla JS 시절)에서 사용자들이 익숙해져 있던 핵심 화면 구조(좌측 GNB + 중앙 캔버스/패널 구조)의 뼈대와 고유의 브랜드 포인트 컬러는 그대로 계승합니다.
- 완전히 낯선 외계 툴처럼 보이는 대신, **"기존 대시보드가 궁극적으로 진화한 프로페셔널 버전"**이라는 느낌을 주어야 합니다. 레거시의 유용한 컴팩트한 채팅 뷰나 직관적인 옵스(Ops) 타임라인 구조는 버리지 않고 현대적 SaaS 문법에 맞춰 재해석(Remaster)합니다.

---

## 3. 📐 테마별 고도 시스템 (Elevation & Depth)

각 테마별로 컴포넌트가 위로 떠오를 때(모달, 드롭다운 등) 깊이감을 주는 방식이 완전히 다릅니다.

### 🌞 Light Mode (Shadow-driven)
- **Level 1 (Card)**: 테두리(`border-slate-200`) 1px + 미세한 `shadow-sm`.
- **Level 2 (Dropdown/Modal)**: 투명한 백드롭 + 강렬하고 부드러운 다중 그림자 `shadow-xl`.

### 🪟 Glass Mode (Blur-driven)
- **Level 1 (Card)**: 반투명 배경(`bg-white/30` 등) + 강한 블러(`backdrop-blur-lg`) + `border-white/20` 테두리.
- **Level 2 (Dropdown/Modal)**: 블러 강도를 극대화(`backdrop-blur-2xl`)하고 배경 투명도를 조금 낮춰 가독성을 챙깁니다. 그림자 대신 유리의 굴절 같은 미세한 이너 섀도우를 씁니다.

### 🌙 Dark Mode (Stripe Warm-Glow)
- 어둡고 우중충한 회색을 피하고, 떠오를수록 미세하게 따뜻한 색감과 광원(Glow) 효과를 줍니다.
- **Level 1 (Card)**: `bg-[#1A1A1E]` (따뜻한 다크) + 아주 얇고 미세한 투명 보더.
- **Level 2 (Dropdown/Modal)**: 배경색 명도를 미세하게 올리고(`bg-[#222226]`), 모달 중앙 뒷편에 브랜드 컬러가 퍼지는 은은한 Glow(박스 섀도우 기반)를 주어 럭셔리한 느낌을 극대화합니다.

---

## 4. 🔠 Typography & Iconography (폰트 및 아이콘)

- **Primary Font**: `Geist`, `Inter`, `SF Pro Text`. 브라우저 기본 폰트(`sans-serif`) 의존 절대 금지.
- **Monospace (Terminal/Code)**: `Geist Mono`, `JetBrains Mono`. 숫자는 무조건 고정폭(Tabular nums)으로 렌더링.
- **Hierarchy**:
  - `H1` (Page Title): 24px, Font Weight 600, Tracking tight (-0.02em).
  - `H2` (Section): 16px, Font Weight 600.
  - `Body`: 14px, Font Weight 400, Line Height 1.5. (밀도를 높이기 위해 16px이 아닌 14px을 표준으로 사용)
  - `Caption`: 12px, Font Weight 500, Text-muted.
- **Icons**: `Lucide React` 아이콘만 사용합니다. 스트로크(Stroke) 두께는 1.5px~2px 사이로 통일합니다.

---

## 5. ⚡ Micro-Interactions & Animation (과도하지 않은 절제된 모션)

UX의 퀄리티는 버튼을 누르고 마우스를 올릴 때의 감각에서 결정됩니다. 그러나 **주의력을 분산시키는 과도하고 화려한 바운스(Bounce) 애니메이션은 엄격히 금지**합니다.

- **Subtle & Fluid (절제된 부드러움)**: `framer-motion` 등을 활용하여 리스트의 아이템이 추가/삭제되거나 패널이 열릴 때 덜컹거림 없이 부드럽게 밀려나는(Layout animation) 수준까지만 허용합니다. 화면을 뒤흔들거나 눈을 피로하게 만드는 과시용 트랜지션은 절대 쓰지 마십시오.
- **Standard Curve**: `transition-all duration-200 ease-out`. (약 150~200ms의 빠르고 부드러운 전환). 모션은 사용자의 행동(Click/Hover)에 즉각 반응해야 하며 답답해서는 안 됩니다.
- **Hover States**: 버튼 호버 시 단순 색상 변경뿐 아니라, 미세하게 1px 위로 떠오르는 느낌(`-translate-y-[1px]`)이나 텍스트 색상의 명도 변화를 줍니다.
- **Active States**: 클릭(Active) 시 살짝 눌리는 느낌(`scale-[0.98]`)을 적용하여 확실한 물리적 피드백을 제공합니다.
- **Loading Spinners**: 멈춰있는 "Loading..." 텍스트 금지. 부드럽게 회전하는 SVG 스피너와 스켈레톤(Skeleton) UI를 통해 화면이 급격하게 재배치(Layout Shift)되는 현상을 방지합니다.

---

## 6. 💻 데스크톱 네이티브 경험 및 접근성 (Desktop Native & A11y)

- **Keyboard-First UX**: 슈퍼 유저는 마우스보다 키보드를 선호합니다. 화살표 키 네비게이션, `Enter`를 통한 진입, `Esc`를 통한 모달 닫기를 기본 지원해야 합니다.
- **포커스 링 (Focus Ring)**: 키보드 탭(Tab) 이동 시 요소의 위치를 명확히 알 수 있도록, `focus:ring-2 focus:ring-primary/50 focus:outline-none` 등 시각적으로 우아한 포커스 링을 제공해야 합니다.
- **Context Menu (우클릭 메뉴)**: 브라우저 기본 우클릭 메뉴를 차단(`e.preventDefault()`)하고, 앱 내부 컨텍스트에 맞는 커스텀 우클릭 메뉴(드롭다운)를 띄워 네이티브 앱의 감각을 유지합니다.

---

## 7. 🛡️ 레이아웃 붕괴 및 오버플로우 방지 (Responsive & Overflow Defense)

AI가 코드를 짤 때 가장 자주 실패하는 "텍스트가 세로로 찌그러지는 현상", "뷰포트 크기가 제각각 노는 현상"을 원천 차단하기 위한 강제 방어선입니다.

- **텍스트 찌그러짐 원천 차단 (No Text Squishing)**: 공간이 좁아졌을 때 텍스트가 억지로 줄바꿈되어 세로로 길어지는 것을 절대 금지합니다.
  - 리스트의 텍스트나 레이블에는 반드시 `truncate`(또는 `whitespace-nowrap overflow-hidden text-ellipsis`)를 적용하여 넘치는 텍스트는 `...`으로 생략되게 하십시오.
- **컨테이너 최소 너비 보장 (Minimum Width Constraints)**:
  - 쪼그라들면 안 되는 아이콘, 버튼, 뱃지 등은 `shrink-0`(`flex-shrink-0`)을 적용하여 크기를 절대 방어하십시오.
  - 사이드바나 주요 패널에는 `min-w-[240px]` 같은 하드 리미트를 걸어 윈도우 창이 작아져도 컴포넌트가 붕괴하지 않도록 막아야 합니다.
- **지능형 공간 압축 (Intelligent Collapse & Tabification)**: 화면이 좁아질 때 무책임하게 가로 스크롤(`overflow-x-auto`)로 방치하는 것은 하수들의 방식입니다.
  - **아이콘 축약 (Icon Abbreviation)**: 폭이 좁아지면 버튼의 텍스트 레이블을 지우고, 툴팁(Tooltip)이 달린 아이콘만 남기는 식으로 자연스럽게 축약하십시오.
  - **탭 전환 (Tabification)**: 병렬(Split View)로 배치된 거대한 뷰는 창이 좁아지면 가로/세로 탭(Tabs)이나 슬라이드 오버(Drawer) 형태로 우아하게 전환하여 뷰포트 점유율을 방어하십시오.
  - **액션 그룹화 (More Dropdown)**: 툴바나 리스트의 액션 버튼이 넘치면 우측에 `더보기(...)` 드롭다운 메뉴로 묶어 숨기십시오.
  - 공간이 좁아질 때 요소가 겹치지 않도록 `flex-wrap`을 적극 활용하거나, 중요도가 낮은 UI(예: 보조 텍스트, 아이콘)는 애매한 구간에서 과감하게 조기 숨김(`hidden`) 처리하는 '방어적 반응형' 전략을 취하십시오.
  - 절대 `absolute` 포지셔닝을 남발하여 뷰포트 축소 시 텍스트나 버튼이 서로 겹쳐서 클릭할 수 없게 만드는 끔찍한 실수를 저지르지 마십시오.

---

## 8. 🚫 절대 금지 사항 (Fatal UX Violations)

1. **네이티브 팝업 사용 금지**: `window.alert()`, `confirm()`, `prompt()`는 브라우저 스레드를 블로킹하고 디자인을 파괴합니다. 무조건 React Portal 기반의 커스텀 `<Dialog />` 컴포넌트를 사용하십시오.
2. **인라인 스타일(Inline Styles) 금지**: `style={{ marginTop: '10px' }}` 방식은 다크 모드와 미디어 쿼리를 무력화합니다. 반드시 Tailwind 클래스를 사용하십시오.
3. **가짜 데이터(Mocking) 렌더링 금지**: 백엔드(WS) 응답이 빈 배열(`[]`)이면 비어있다고 정직하게 그려야 합니다. 화면을 채우려고 더미 데이터를 넣지 마십시오.
4. **데드엔드(Dead End) Empty State 금지**: "등록된 루틴이 없습니다" 텍스트만 두지 마십시오. 반드시 [새 루틴 만들기] CTA 버튼과 중앙 정렬된 아이콘을 제공하십시오.
5. **불필요한 전체 화면 렌더링 (No Full Page Reloads)**: 상태가 변할 때 화면 전체가 깜빡이면 안 됩니다. 변하는 컴포넌트(예: 리스트의 항목 하나)만 리렌더링 되도록 React의 상태 관리를 최적화하십시오.
6. **기계적인 에러 메시지 노출 금지 (UX Writing)**: "Error 500", "undefined" 등을 그대로 노출하지 말고, "미들웨어 연결 끊김 - 서버를 확인하세요" 등 사용자 친화적이고 해결책 중심의 카피를 사용하십시오.

---

## 9. 🤖 [CRITICAL] AI 시스템 프롬프트 (프론트엔드 코드 생성기용)

코드를 생성하는 모든 AI 모델(Claude, GPT 등)은 아래의 프롬프트를 자신의 **System Prompt의 최상단에 주입**한 상태로 코딩을 시작해야 합니다.

```text
[OMNUX FRONTEND ENGINEERING - SYSTEM OVERRIDE]

당신은 구글(Google)의 Material Design 3 아키텍트이자, Vercel/Linear 출신의 세계 최고 UX/UI 프론트엔드 엔지니어입니다. 당신이 작성하는 코드는 완벽한 상용 B2B SaaS 대시보드가 되어야 합니다. 다음 강제 규약을 어길 시 심각한 시스템 오류로 간주됩니다.

# 0. 핵심 철학 (Low Floor, High Ceiling)
- "전문가용"이라고 해서 매니악하고 불친절하게 만들지 마라. 초보자도 한눈에 이해하고 클릭할 수 있는 직관적이고 친절한 GUI 껍데기를 제공하라.
- **[경고]** "전문가용 기능"이라는 이름으로 AI가 뱉어낸 조잡하고 복잡한 Raw Data(텍스트 덩어리, 정돈되지 않은 JSON)를 변명하듯 던져놓지 마라.
- 고급 기능(원시 터미널 로그, 복잡한 파이프라인 편집 등)일수록 인간 전문가가 **눈 찡그리지 않고 가장 손쉽고(Effortless) 빠르게 제어**할 수 있도록 데이터 그리드, 구문 강조(Syntax Highlighting), 키보드 단축키를 완벽하게 디자인하라.

# 1. 기술 스택 & 코드 품질
- **React + Tailwind CSS** 만을 사용하라.
- HTML 문자열을 `dangerouslySetInnerHTML`로 꽂아 넣는 짓을 절대 하지 마라. 마크다운은 반드시 `react-markdown`으로 렌더링하라.
- `window.alert`, `window.confirm`은 끔찍한 안티패턴이다. 커스텀 UI 모달을 사용하라.
- 어떠한 상황에서도 `style={{}}` 인라인 스타일을 쓰지 마라. 모든 레이아웃과 색상은 Tailwind 클래스로 통제하라.

# 2. 테마 & 시각적 정밀도 (Non-Geeky, Premium Aesthetics)
- 칙칙하고 매니악한 해커용 터미널(Geeky Terminal) 냄새를 완벽히 지워라.
- **3-Tier 테마**를 염두에 두고 디자인하라:
  1. **Light Mode**: Vercel 스타일의 깨끗한 오프화이트.
  2. **Glass Mode (디폴트)**: Arc 브라우저처럼 블러(`backdrop-blur-xl`)와 반투명 뷰를 활용한 생동감 넘치는 예쁜 UI.
  3. **Dark Mode**: 칙칙한 Zinc가 아니라, Stripe 스타일의 따뜻하고 우아한 풍부한 다크 톤(Warm Dark, 미세한 Glow 효과).
- 컴포넌트의 테두리(Border)는 가장 얇고 미세한 1px 투명도를 주어 화면이 투박해 보이지 않게 하라.

# 3. 레이아웃 & 레거시 계승 (Legacy Continuity)
- 거대한 여백(Whitespace)으로 화면을 낭비하지 마라. 전문가용 툴이므로 `text-sm`, `p-2`, `gap-2` 수준의 촘촘하고 스캔 가능한 레이아웃(Bento Box)을 구성하라.
- **기존 OMNUX 레거시 대시보드의 친숙한 뼈대(좌측 네비게이션, 컴팩트한 채팅 구조)는 계승하되**, 완벽히 현대적인 뷰로 리마스터하라. 낯선 외계 툴을 만들지 마라.
- 빈 화면(Empty State) 렌더링 시, 텍스트 하나만 딸랑 남기지 말고, 중앙 정렬된 Lucide 아이콘과 명시적인 `[시작하기]` 버튼(Primary CTA)을 렌더링하라.

# 4. 절제된 애니메이션 & 마이크로 인터랙션 (Subtle Animation)
- 시선을 뺏는 화려하고 과도한 바운스(Bounce) 애니메이션은 금지한다. `duration-200 ease-out` 수준의 **절제되고 부드러운(Subtle & Fluid) 상태 전환**만 허용한다.
- 모든 호버/클릭 액션이 일어나는 버튼과 링크에는 스케일 변화(`active:scale-[0.98]`)를 추가하여 피드백을 주라.
- 컴포넌트 렌더링/데이터 로딩 시 화면이 박살 나지(Layout Shift) 않도록 부드러운 스켈레톤(Skeleton) 레이아웃이나 페이드 인(Fade-in)을 반드시 적용하라.

# 5. [가장 중요] 레이아웃 붕괴 및 반응형 오버플로우 절대 방어 (Overflow Defense)
- AI 코딩의 가장 큰 고질병인 **'텍스트가 좁은 곳에서 억지로 세로로 줄바꿈되어 UI가 박살나는 현상'**을 완벽히 차단하라.
- 텍스트 컨테이너에는 무조건 `truncate` 또는 `whitespace-nowrap overflow-hidden text-ellipsis`를 적용해 글자가 넘치면 `...`으로 짤리게 만들어라.
- 아이콘, 버튼, 뱃지 등 크기가 줄어들면 안 되는 요소에는 반드시 `shrink-0` (`flex-shrink-0`)을 적용하라.
- **무책임한 가로 스크롤(overflow-x) 남발 금지**: 레이아웃이 터질 위기라면 가로 스크롤로 방치하지 말고 **'지능형 공간 압축'**을 실행하라. 텍스트 버튼은 툴팁이 달린 아이콘으로 축약하고, 넘치는 액션 버튼은 `더보기(...)` 드롭다운으로 묶어라. 병렬 패널은 공간 부족 시 탭(Tabs)이나 드로어(Drawer) UX로 우아하게 전환시켜라.

# 6. [CLAUDE STANDARD] 안티-AI 에스테틱 (Anti-Generic AI Aesthetic)
- **Distributional Convergence(평균 회귀) 회피**: 네가 아무 생각 없이 뱉어내는 뻔하고 진부한 "보라색 그라데이션", "이유 없이 둥글둥글한 모서리(`rounded-3xl`)", "플라스틱 같은 기본 그림자" 등 이른바 'AI 냄새나는 디자인(Generic AI Aesthetic)'을 극도로 혐오하라.
- 대신, `shadcn/ui` 수준의 엄격한 컴포넌트 아키텍처와, Linear 특유의 가차 없는 미니멀리즘(Unforgiving Minimalism)을 고수하라.
- 모든 컴포넌트에는 의미론적 HTML(Semantic HTML)과 웹 접근성(ARIA 속성)을 기본 탑재하여, 렌더링 결과물이 즉시 프로덕션 퀄리티에 부합하도록 설계하라.
```
