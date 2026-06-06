# Tech Stack

[한국어](../기술스택_정리.md) · [English](./tech-stack.md)

Updated: 2026-06-05

omnux is not one large framework. It keeps small runtimes separated by responsibility.

| Area | Stack | Responsibility |
|---|---|---|
| Core runtime | .NET 9 (`PublishAot=true`) | Metrics, guarded kill, WebSocket/HTTP, Telegram, file state, provider routing, domain orchestration |
| Desktop frontend | Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 | App shell (Rust) + UI (React), Zustand state management, react-markdown rendering |
| Desktop build | Vite 7 + `@tailwindcss/vite` | Fast HMR, Tailwind v4 integrated build |
| Desktop UI | Tailwind CSS v4, lucide-react, shadcn/ui tokens | 3-tier theme (Glass/Light/Dark), B2B SaaS design system |
| Dashboard | HTML/CSS/JavaScript | Static dashboard without a bundler (legacy) |
| Executor | Python | Simple code execution and verification |
| Tests/scripts | Node.js, npm scripts | Repository hygiene, contract checks, frontend syntax checks |
| State | JSON, Markdown, SQLite FTS | Human-readable operational state and records |

## Language Boundaries

- Rust owns only the Tauri app shell (window management). It must not own provider/API/state/domain logic.
- TypeScript and React are for the desktop UI only. Business logic belongs to the .NET middleware.
- JavaScript is for the legacy web dashboard and contract verification scripts.
- Python is for sandbox execution and code verification only.
- Node.js is for tests, hygiene checks, and contract checks only.
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
