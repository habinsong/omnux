# omnux desktop

Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 데스크톱 셸이다. 6개 영역 18개 화면이 여기 있다.

## 명령

| 명령 | 동작 |
|---|---|
| `omnux` (저장소 루트) | vite(1420)와 Tauri 셸 실행. 셸이 .NET 미들웨어(41880)를 함께 띄운다 |
| `npm run dev` | vite 개발 서버만 실행 |
| `npm run build` | 타입 검사와 프로덕션 빌드 (`dist/`) |
| `npm run tauri dev` | Tauri 개발 모드 |
| `npm run build:sidecar` | 배포용 미들웨어 sidecar 빌드 |

## 원본 위치

| 경로 | 내용 |
|---|---|
| `src/App.tsx` | 화면 레지스트리 |
| `src/features/shell/nav-areas.ts` | 영역과 소속 화면 정의 |
| `src/features/` | 화면별 디렉터리 |
| `src/features/middleware/` | WebSocket gateway 헬퍼 |
| `src/components/` | 공용 UI (`ui/primitives.tsx`, `screen/`, `capsule/`) |
| `src-tauri/` | Rust 셸. 창 관리, 자동 시작, 미디어 정보, 미들웨어 bootstrap |

Rust 셸은 앱 셸만 맡는다. LLM, 코딩, 루틴, 라우팅, `~/.omnux` 접근은 .NET 미들웨어가 소유한다.

## 화면 규칙

- Tailwind CSS v4 토큰을 쓴다. 테마는 Light(기본), Glass, Dark다.
- `window.alert`, `window.confirm`, `window.prompt` 대신 커스텀 Dialog를 쓴다.
- `dangerouslySetInnerHTML` 대신 `react-markdown`으로 렌더링한다.
- 인라인 스타일 대신 Tailwind 클래스를 쓴다.
- 화면의 한글 라벨은 `scripts/check-*-screen.mjs`와 UI 검사가 문자열 그대로 비교한다. 문구를 바꾸면 해당 검사도 같이 고친다.

## Linux

GTK/WebKitGTK 개발 패키지가 필요하다. `./scripts/omnux setup`이 확인하고 설치한다.

설치와 실행은 [docs/QUICKSTART.md](../../docs/QUICKSTART.md), 구조는 [docs/아키텍처_흐름.md](../../docs/아키텍처_흐름.md)를 본다.
