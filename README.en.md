<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="112" alt="omnux app icon">
</p>

<h1 align="center">omnux</h1>

<p align="center">Ask, build, run, and keep the record. All in one app, on your own machine.</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-1.0.6-EF8B26" alt="version 1.0.6"></a>
  <a href="apps/omnux-middleware"><img src="https://img.shields.io/badge/.NET-9-512BD4?logo=dotnet&logoColor=white" alt=".NET 9"></a>
  <a href="apps/desktop"><img src="https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white" alt="Tauri v2"></a>
  <a href="docs/en/quickstart.md"><img src="https://img.shields.io/badge/macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-000000" alt="macOS, Linux, Windows"></a>
</p>

<p align="center">
  <a href="README.md">한국어</a> ·
  <strong>English</strong>
</p>

---

**omnux** is a desktop app for asking an LLM, generating and running code, scheduling that work, and keeping what comes out of it. Conversations, build output, run logs, and notes all stay on your machine, under `~/.omnux` and `workspace/`.

Gemini, Groq, Cerebras, NVIDIA NIM, Copilot, Codex, and Grok are switchable from the same screen. Pick one, chain several in order, or put them side by side and compare the answers.

Attach the Telegram bot and you can send the same commands from your phone. The desktop app and the bot both go through `CommandService`, so neither side gets features the other lacks.

## What it does

| Screen | What it does |
|---|---|
| Ask | Chat. Single, orchestration, and multi modes; file and image attachments; skills |
| Build | Describe what you want, get code that runs. Each run keeps its own folder |
| Automate | Run a job daily, weekly, or monthly at a set time |
| Explore | Web search, URL fetch, real browser control, canvas |
| Review | Safe Refactor. Build a preview, re-check the file right before apply |
| Projects · Tasks · Notes | Register local projects, create and run plans, keep notes and handoffs |
| Agents · Tools · Extensions · Routing · Rules | Agent runs, skills, hooks and plugins, provider routes, logic graphs |
| Activity · Logs · Status | Session records, model call history, connection and diagnostics |
| Settings | Display, models and keys, security, integrations, data, about |

## Getting started

```bash
./scripts/omnux setup
omnux
```

`setup` checks the tools it needs, installs the missing ones, builds, runs `npm test`, and registers the `omnux` command. It uses Homebrew on macOS and the distro package manager on Linux (apt/dnf/yum/pacman/zypper/apk). On Windows, run `.\scripts\omnux.ps1 setup`.

`omnux` opens the desktop app, which starts the .NET middleware alongside it. Use `omnux start` for the middleware alone and `omnux shutdown` to stop everything.

| Target | Address |
|---|---|
| Desktop UI (dev mode) | `http://127.0.0.1:1420/` |
| Middleware API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `/readyz` |
| Remote UI | `http://<LAN-IP>:1420/` |

The [quickstart](docs/en/quickstart.md) covers install and first run in more detail.

## Available models

Only providers with an API key or a signed-in CLI show up in the list. One key is enough to start.

| provider key | Label | Connection |
|---|---|---|
| `gemini` | Gemini | Google API, grounded search |
| `groq` | Groq | OpenAI-compatible HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI-compatible `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh` / `copilot` CLI |
| `codex` | Codex | `codex` CLI or API key |
| `grok` | Grok | `grok` CLI |

## Layout

| Location | Stack | Responsibility |
|---|---|---|
| `apps/omnux-middleware` | .NET 9 (AOT) | WebSocket/HTTP server, provider routing, Telegram, state, domain orchestration |
| `apps/desktop` | Tauri v2 + React 19 + Tailwind CSS v4 | Desktop app. 6 areas, 18 screens |
| `apps/omnux-sandbox` | Python | Code executor |
| `~/.omnux` | JSON + Markdown | Settings, conversations, plans, notes, routing policy |
| `workspace/` | — | Build, automation, and logic run output |

The Rust shell manages windows and starts the middleware. LLM calls, coding, routines, and state files are the .NET middleware's job.

## Safety boundaries

- API keys come from environment variables, `*_FILE`, the secure store (`~/.config/omnux/secrets.json`, 0600), or the macOS Keychain.
- WebSocket enforces an Origin check, a pre-auth message allowlist, a command rate limit, and a 16MB message cap by default.
- Remote access is off by default. Turned on, devices on the same LAN enter in limited mode with read queries and model/routing selection only.
- Safe Refactor re-checks file state right before apply and leaves a rollback snapshot.
- Local code execution opens only when `OMNUX_ENABLE_DYNAMIC_CODE=true`.

## Documentation

- [Quickstart](docs/en/quickstart.md) | install, run, first checks
- [Usage](docs/en/usage.md) | what to click on each screen
- [Architecture](docs/en/architecture.md) | the path a request takes, and the safety boundaries
- [Environment and state files](docs/en/environment-and-state.md) | `OMNUX_*` variables and where things are stored
- [Telegram bot](docs/en/telegram-bot.md) | commands, attachments, mobile handoff
- [All documentation](docs/en/README.md) | Korean and English

## Verification

```bash
npm test
```

It runs repo hygiene, boundary contracts, screen models, the middleware build and unit tests, the gateway runtime contract, and the sandbox smoke in order, and stops at the first failure. The [validation guide](docs/en/validation.md) has the details.

## License

ISC, per the `license` field in `package.json`.
