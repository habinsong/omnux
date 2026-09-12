# Tech Stack

[한국어](../기술스택_정리.md) · [English](./tech-stack.md)

Updated: 2026-09-12

Small runtimes split by responsibility. What each one owns, and what it does not, is below.

| Area | Stack | Responsibility |
|---|---|---|
| Core runtime | .NET 9 (`PublishAot=true`) | Metrics, guarded kill, WebSocket/HTTP, Telegram, file state, provider routing, domain orchestration |
| Desktop shell | Rust + TypeScript + React (Tauri v2 + React 19 + TypeScript + Tailwind CSS v4) | App shell (Rust) and UI (React), Zustand state management, react-markdown rendering |
| Desktop build | Vite 7 + `@tailwindcss/vite` | Fast HMR, Tailwind v4 integrated build |
| Desktop UI | Tailwind CSS v4, lucide-react | 3-tier tokens (Light/Glass/Dark), responsive collapsible tool screens |
| Executor | Python | Code execution and verification |
| Tests and scripts | Node.js, npm scripts | Repository hygiene, contract checks, frontend syntax checks |
| State | JSON, Markdown, SQLite FTS | Human-readable operational state and records |

## Language boundaries

- Rust owns only the app shell and window lifecycle. It must not own provider/API/state/domain logic.
- TypeScript and React are for the desktop UI only. Business logic belongs to the .NET middleware.
- JavaScript is for contract checks and the Playwright browser execution resources.
- Python is for sandbox execution and code verification only.
- Node.js is for tests, contract checks, and the Playwright browser adapter. .NET owns process lifetime and tool permissions.
- New business logic and state orchestration belong to the .NET 9 middleware by default.

## Canonical source homes

- .NET 9 runtime, business logic, and policy code belong only under `apps/omnux-middleware/src/`.
- Desktop React/TypeScript shell code belongs under `apps/desktop/src/`, and Rust shell code belongs under `apps/desktop/src-tauri/src/`.
- Python code belongs only in `apps/omnux-sandbox/executor.py`.
- Node.js contract checks and runners belong under `scripts/`.
- The repository root must not keep Electron/Codex bundle artifacts such as `main.js`, `preload.js`, or `worker.js`.
- The middleware root must not keep coding-smoke generated artifacts such as `main.py`, `main.js`, or `main.c`.
- New code must not cross these boundaries.

## New language / runtime approval criteria

- New languages, runtimes, frameworks, and bundlers are denied by default. Review an exception only when the current stack cannot meet the requirement or an official platform requirement forces it.
- An approval change must update this document, the Korean document, and `scripts/check-tech-stack-contract.mjs` in the same change.
- The approval record must name the owner, canonical source home, state-file location, secret handling, build/verification commands, and removal/rollback plan.
- A new runtime is not a reason to move business logic, provider routing, or state orchestration out of the `.NET 9` middleware.
- Experimental spike artifacts belong only in `workspace/` and must not be kept under `apps/` or the repository root before promotion to product code.

## Phase 5 stack ingress gate

- Phase 5 screen migration uses only the existing `apps/desktop/` Tauri/Vite/React/TypeScript shell. The legacy static dashboard (`apps/omnux-dashboard/`) has been removed.
- Run `npm test` before and after Phase 5 changes. For scoped checks, run at least `node scripts/check-tech-stack-contract.mjs` and `node scripts/check-repo-hygiene.mjs` together.
- Do not create new root app directories, new source homes, new bundlers, new package managers, or new runtime shortcuts until the new language/runtime approval criteria pass.
- The existing root `omnux/` prototype is not an active source home. Freeze its file list until deletion or migration is confirmed, and do not add runtime, package, or build artifacts under it.

## Brand and compatibility alias boundary

- The canonical product name, package name, launcher name, state directory, and new user-facing copy use `omnux`.
- The previous brand name may remain only in historical context or migration examples.
- Old-prefix root aliases, Electron/Codex legacy aliases, and new runtime shortcuts must not be recreated.
- If a compatibility alias is required, add it only as a temporary shim and document the removal condition plus contract check in the same change.
- New product copy in the desktop shell, README, and package metadata uses `omnux`.

## LLM providers

| provider key | Label | Integration |
|---|---|---|
| `gemini` | Gemini | Google API and grounded search |
| `groq` | Groq | OpenAI-compatible HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI-compatible `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh` / `copilot` CLI wrapper |
| `codex` | Codex | `codex` CLI or API path |
| `grok` | Grok | `grok` CLI wrapper |

Per-provider default models live in `apps/shared/model-registry.json`, and `apps/shared/generate-cs-registry.js` generates the C# registry from it. `npm test` checks that the two do not drift.

## Frontend principles

The desktop app is a tool surface, built for dense information, repeated use, and narrow windows. Conversations, run results, settings, and logs come up fast.

- Use the Tailwind CSS v4 tokens. Feature CSS stays scoped to its screen; no CSS-in-JS and no second design system.
- Use a custom Dialog instead of `window.alert`, `window.confirm`, or `window.prompt`.
- Render with `react-markdown` instead of `dangerouslySetInnerHTML`.
- Use Tailwind classes instead of inline styles.
- Support the 3-tier theme (Light/Glass/Dark), with Light as the default.

`scripts/check-ui-slop.mjs` checks for gradients, hover scale, glass effects, uppercase tracking, marketing adjectives, and negative parallelism.

## Browser execution resources (2026-09-07)

- `apps/omnux-middleware/resources/browser/PlaywrightHost.cjs` and `A2UiRenderer.cjs` are embedded resources split out of the existing Node/Playwright execution code. These two files are the only browser execution resources allowed.
- The .NET source home stays at `apps/omnux-middleware/src/`. `Infrastructure/Browser` owns execution, errors, and process teardown; the scripts handle the browser page and the declarative UI.
- Browser state lives in a fresh temporary context for that process. User browser profiles and OAuth or API credential files are not read.
- Requires Node.js, the Playwright package, and Playwright Chromium (installed by `omnux setup`) or Chrome. Whether a desktop package ships these dependencies is a separate packaging check.
- Verification: `npm test`, `node scripts/check-gateway-runtime-contract.mjs --explore-only`. When removing the feature, remove both embedded resources along with the Browser/Canvas wiring and runtime checks.
