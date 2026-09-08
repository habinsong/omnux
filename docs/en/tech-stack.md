# Tech Stack

[한국어](../기술스택_정리.md) · [English](./tech-stack.md)

Updated: 2026-09-07

omnux is not one large framework. It keeps small runtimes separated by responsibility.

| Area | Stack | Responsibility |
|---|---|---|
| Core runtime | .NET 9 (`PublishAot=true`) | Metrics, guarded kill, WebSocket/HTTP, Telegram, file state, provider routing, domain orchestration |
| Desktop shell | Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 | App shell (Rust) + UI (React), Zustand state management, react-markdown rendering |
| Desktop build | Vite 7 + `@tailwindcss/vite` | Fast HMR, Tailwind v4 integrated build |
| Desktop UI | Tailwind CSS v4, lucide-react, shadcn/ui tokens | 기존 3-tier 토큰(Glass/Light/Dark), 반응형·접이식 도구 화면 |
| Dashboard | HTML/CSS/JavaScript | Static dashboard without a bundler (legacy) |
| Executor | Python | Simple code execution and verification |
| Tests/scripts | Node.js, npm scripts | Repository hygiene, contract checks, frontend syntax checks |
| State | JSON, Markdown, SQLite FTS | Human-readable operational state and records |

## Language Boundaries

- Rust owns only the app shell and window lifecycle. It must not own provider/API/state/domain logic.
- TypeScript and React are for the desktop UI only. Business logic belongs to the .NET middleware.
- JavaScript: 레거시 웹 화면, 계약 검사, Playwright 브라우저 실행 리소스.
- Python is for sandbox execution and code verification only.
- Node.js: 테스트·계약 검사와 기존 Playwright 브라우저 실행 어댑터. 프로세스 수명과 권한은 .NET이 소유한다.
- New business logic and state orchestration belong to the .NET 9 middleware by default.

## Canonical Source Homes

- .NET 9 runtime, business logic, and policy code belong only under `apps/omnux-middleware/src/`.
- Desktop React/TypeScript shell code belongs under `apps/desktop/src/`, and Rust shell code belongs under `apps/desktop/src-tauri/src/`.
- Python code belongs only in `apps/omnux-sandbox/executor.py`.
- Node.js contract checks and runners belong under `scripts/`.
- The repository root must not keep Electron/Codex bundle artifacts such as `main.js`, `preload.js`, or `worker.js`.
- The middleware root must not keep coding-smoke generated artifacts such as `main.py`, `main.js`, or `main.c`.
- New code must not cross these boundaries.

## New Language / Runtime Approval Criteria

- New languages, runtimes, frameworks, and bundlers are denied by default. Review an exception only when the current stack cannot meet the requirement or an official platform requirement forces it.
- An approval change must update this document, the Korean document, and `scripts/check-tech-stack-contract.mjs` in the same change.
- The approval record must name the owner, canonical source home, state-file location, secret handling, build/verification commands, and removal/rollback plan.
- A new runtime is not a reason to move business logic, provider routing, or state orchestration out of the `.NET 9` middleware.
- Experimental spike artifacts belong only in `workspace/` and must not be kept under `apps/` or the repository root before promotion to product code.

## Phase 5 Stack Ingress Gate

- Phase 5 screen migration uses only the existing `apps/desktop/` Tauri/Vite/React/TypeScript shell and the `apps/omnux-dashboard/` static dashboard source.
- Run `npm test` before and after Phase 5 changes. For scoped checks, run at least `node scripts/check-tech-stack-contract.mjs` and `node scripts/check-repo-hygiene.mjs` together.
- Do not create new root app directories, new source homes, new bundlers, new package managers, or new runtime shortcuts until the new language/runtime approval criteria pass.
- The existing root `omnux/` prototype is not an active source home. Freeze its file list until deletion or migration is confirmed, and do not add runtime, package, or build artifacts under it.

## Brand And Compatibility Alias Boundary

- The canonical product name, package name, launcher name, state directory, and new user-facing copy use `omnux`.
- The previous brand name may remain only in historical context or migration examples.
- Old-prefix root aliases, Electron/Codex legacy aliases, and new runtime shortcuts must not be recreated.
- If a compatibility alias is required, add it only as a temporary shim and document the removal condition plus contract check in the same change.
- New product copy in the dashboard, desktop shell, README, and package metadata uses `omnux`.

## LLM Providers

- Gemini: API and grounding search
- Groq: OpenAI-compatible HTTP
- Cerebras: HTTP API
- NVIDIA NIM: OpenAI-compatible chat completions
- Copilot: CLI wrapper
- Codex: CLI/API path

## 브라우저 실행 리소스 (2026-09-07)

- `apps/omnux-middleware/resources/browser/PlaywrightHost.cjs`, `A2UiRenderer.cjs`는 기존 Node/Playwright 실행 코드를 분리한 embedded resource다. .NET 원본 영역은 C#만 유지한다.
- 소유자: `Infrastructure/Browser`의 .NET 실행기. 상태: 새 임시 브라우저 컨텍스트. 사용자 프로필·자격증명 파일은 읽지 않는다.
- 의존성: Node.js, Playwright, Chromium 또는 Chrome. 패키징에서 해당 의존성의 배포는 별도 검증한다.
- 검증: `npm test`, `node scripts/check-gateway-runtime-contract.mjs --explore-only`. 제거 시 리소스·Browser/Canvas 연결·런타임 검사를 함께 정리한다.
