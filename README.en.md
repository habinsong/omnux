# omnux

<div align="center">

**A local-first AI workbench that connects chat, coding, runs, routines, refactoring, notes, Telegram, and provider routing into one practical workflow.**

[한국어](./README.md) · [English](./README.en.md)

[![local first](https://img.shields.io/badge/local--first-workflow-111111?style=for-the-badge)](./docs/en/architecture.md)
[![.NET 9](https://img.shields.io/badge/.NET-9-512BD4?style=for-the-badge)](./apps/omnux-middleware)
[![desktop](https://img.shields.io/badge/desktop-tauri-0A7EA4?style=for-the-badge)](./apps/desktop)
[![telegram](https://img.shields.io/badge/telegram-natural%20control-26A5E4?style=for-the-badge)](./docs/en/usage.md)
[![safe refactor](https://img.shields.io/badge/Safe%20Refactor-preview%20→%20apply-2E8B57?style=for-the-badge)](./docs/en/safe-refactoring.md)

</div>

Updated: 2026-09-12

omnux keeps conversations, build runs, generated files, validation logs, routines, logic graphs, notes, Safe Refactor previews, and Telegram control in one flow. Use Groq, Gemini, Cerebras, NVIDIA NIM, Copilot, Codex, and Grok from the same Tauri desktop app, and keep the results as files, logs, and run snapshots.

> Start here: [Quickstart](./docs/en/quickstart.md).

## Why it exists

| Common problem | omnux approach |
|---|---|
| Chat and execution are separate | Conversations, build results, and logs stay connected |
| Provider comparison is messy | Single, orchestration, and multi modes work in Ask and Build |
| Desktop and Telegram drift apart | Both use the same CommandService |
| Refactoring feels risky | Preview first, re-check right before apply |
| Ops state is unclear | `/healthz`, `/readyz`, and `doctor --json` |

## Screens

| Area | Screens |
|---|---|
| Home | Home |
| Workspace | Ask, Build, Automate, Explore, Review |
| Projects | Projects, Tasks, Notes |
| Engine | Agents, Tools, Extensions, Routing, Rules |
| Monitor | Activity, Logs, Status |
| Settings | Settings |

## Quick start

```bash
./scripts/omnux setup
omnux
omnux shutdown
```

On macOS (Homebrew) and Linux (apt/dnf/pacman/zypper/apk), setup prepares the required tools, .NET SDK 9, Rust, and Playwright Chromium, builds, runs `npm test`, and registers the `omnux` command. `omnux` opens the desktop app, which starts the middleware with it. Use `omnux start` for the middleware only. On Windows, use `.\scripts\omnux.ps1 setup`.

| Target | Address |
|---|---|
| Desktop UI (dev mode) | `http://127.0.0.1:1420/` |
| Remote UI | `http://<LAN-IP>:1420/` |
| Middleware API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `/readyz` |

## Providers

| provider key | Label | Integration |
|---|---|---|
| `gemini` | Gemini | Google API and grounded search |
| `groq` | Groq | OpenAI-compatible HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI-compatible `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh`/`copilot` CLI |
| `codex` | Codex | `codex` CLI or API key |
| `grok` | Grok | `grok` CLI |

## Documentation

See the [documentation index](./docs/en/README.md) for usage, architecture, tech stack, validation, and environment docs.
