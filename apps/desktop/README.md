# omnux desktop

Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 기반의 데스크톱 앱 셸입니다. 6개 영역 18개 화면으로 구성됩니다.

## 명령

| 명령 | 동작 |
|---|---|
| `omnux` (저장소 루트) | Vite(1420) 개발 서버 및 Tauri 셸 기동. 셸이 .NET 미들웨어(41880)를 함께 실행 |
| `npm run dev` | Vite 개발 서버 단독 실행 |
| `npm run build` | TypeScript 타입 검사 및 프로덕션 빌드 (`dist/`) |
| `npm run tauri dev` | Tauri 데스크톱 개발 모드 실행 |
| `npm run build:sidecar` | 배포용 .NET 미들웨어 사이드카 바이너리 빌드 |

## 원본 위치

| 경로 | 내용 |
|---|---|
| `src/App.tsx` | 화면 라우팅 및 컴포넌트 레지스트리 |
| `src/features/shell/nav-areas.ts` | 6개 내비게이션 영역 및 소속 화면 정의 |
| `src/features/` | 각 화면별 비즈니스 로직 및 UI 컴포넌트 |
| `src/features/middleware/` | WebSocket 게이트웨이 연동 헬퍼 |
| `src/components/` | 공용 UI 컴포넌트 (`ui/primitives.tsx`, `screen/`, `capsule/`) |
| `src-tauri/` | Rust 앱 셸 (창 관리, 자동 시작, 미디어 제어, 미들웨어 부트스트랩) |

Rust 셸은 애플리케이션 창 관리와 미들웨어 기동만 담당합니다. LLM 호출, 코드 생성, 루틴 스케줄링, 라우팅, `~/.omnux` 상태 관리는 전부 .NET 미들웨어가 소유합니다.

## 화면 규칙

- Tailwind CSS v4 디자인 토큰을 사용합니다. 테마는 Light(기본), Glass, Dark를 지원합니다.
- `window.alert`, `window.confirm`, `window.prompt` 같은 브라우저 기본 팝업 대신 커스텀 Dialog 컴포넌트를 사용합니다.
- `dangerouslySetInnerHTML`을 배제하고 `react-markdown`으로 안전하게 렌더링합니다.
- 인라인 스타일 대신 Tailwind CSS 유틸리티 클래스를 적용합니다.
- 화면의 한글 UI 라벨은 `scripts/check-*-screen.mjs` 및 UI 자동화 검사에서 문자열 단위로 엄격히 검증합니다. 문구 변경 시 해당 검사 스크립트도 함께 수정해야 합니다.

## Linux 환경

Linux 환경에서는 GTK 및 WebKitGTK 개발 패키지가 필요합니다. `./scripts/omnux setup` 스크립트가 의존성을 자동으로 감지해 설치합니다.

설치 및 실행 가이드는 [docs/QUICKSTART.md](../../docs/QUICKSTART.md), 아키텍처 상세는 [docs/아키텍처_흐름.md](../../docs/아키텍처_흐름.md)를 참고하세요.
