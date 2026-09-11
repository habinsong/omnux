# omnux desktop

Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 데스크톱 셸이다.

| 명령 | 동작 |
|---|---|
| `omnux` (저장소 루트) | vite(1420)와 Tauri 셸 실행. 셸이 .NET 미들웨어(41880)를 함께 띄운다 |
| `npm run dev` | vite 개발 서버만 실행 |
| `npm run build` | 타입 검사와 프로덕션 빌드 (`dist/`) |
| `npm run tauri dev` | Tauri 개발 모드 |

- 화면 원본: `src/` (화면 레지스트리는 `src/App.tsx`, 영역 정의는 `src/features/shell/nav-areas.ts`)
- Rust 셸: `src-tauri/` (창 관리, 자동 시작, 미디어 정보, 미들웨어 bootstrap)
- Linux에서는 GTK/WebKitGTK 개발 패키지가 필요하다. `./scripts/omnux setup`이 확인/설치한다.

설치와 실행은 [docs/QUICKSTART.md](../../docs/QUICKSTART.md)를 본다.
