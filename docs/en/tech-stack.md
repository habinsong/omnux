# Tech Stack

[한국어](../기술스택_정리.md) · [English](./tech-stack.md)

Updated: 2026-06-02

omnux is not one large framework. It keeps small runtimes separated by responsibility.

| Area | Stack | Responsibility |
|---|---|---|
| Core runtime | .NET 9 | Metrics, guarded kill, WebSocket/HTTP, Telegram, file state, provider routing, domain orchestration |
| Dashboard | HTML/CSS/JavaScript | Static dashboard without a bundler |
| Desktop shell | Rust + TypeScript + React | Tauri app shell, window lifecycle, runtime bootstrap, UI boundary |
| Executor | Python | Simple code execution and verification |
| Tests/scripts | Node.js, npm scripts | Repository hygiene, contract checks, frontend syntax checks |
| State | JSON, Markdown, SQLite where useful | Human-readable local operational state and records |

## Language Boundaries

- Rust owns only the app shell and window lifecycle. It must not own provider/API/state/domain logic.
- TypeScript and JavaScript are for the desktop/dashboard UI shell and contract verification scripts.
- Python is for sandbox execution and code verification.
- Node.js is for tests, hygiene checks, and contract checks.
- New business logic and state orchestration belong to the .NET 9 middleware by default.

## Canonical Source Homes

- .NET 9 runtime, business logic, and policy code belong only under `apps/omnux-middleware/src/`.
- Desktop React/TypeScript shell code belongs under `apps/desktop/src/`, and Rust shell code belongs under `apps/desktop/src-tauri/src/`.
- Python code belongs only in `apps/omnux-sandbox/executor.py`.
- Node.js contract checks and runners belong under `scripts/`.
- The repository root must not keep Electron/Codex bundle artifacts such as `main.js`, `preload.js`, or `worker.js`.
- The middleware root must not keep coding-smoke generated artifacts such as `main.py`, `main.js`, or `main.c`.
- New code must not cross these boundaries.

## LLM Providers

- Gemini: API and grounding search
- Groq: OpenAI-compatible HTTP
- Cerebras: HTTP API
- NVIDIA NIM: OpenAI-compatible chat completions
- Copilot: CLI wrapper
- Codex: CLI/API path
