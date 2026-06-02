# omnux Quickstart

[한국어](../QUICKSTART.md) · [English](./quickstart.md)

Updated: 2026-05-21

This is the shortest path from clone to dashboard.

![Dashboard](../assets/readme/dashboard-desktop-1920x1080.png)

## Requirements

| Tool | Purpose |
|---|---|
| `.NET SDK 9` | Middleware build and run |
| `python3` | Sandbox and coding validation |
| `node`, `npm` | Dashboard checks and regression scripts |
| Optional: `gh`, `copilot`, `codex` | Copilot/Codex CLI integration |

## Run

macOS/Linux launcher:

```bash
omnux setup
omnux
omnux shutdown
```

From a fresh checkout, run `./scripts/omnux setup` first. Setup checks or installs required tools, builds the middleware, runs `npm test`, and registers the launcher. If the setup marker is missing, the first `omnux` start also attempts automatic setup.

Manual run:

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj
```

Windows:

```powershell
.\scripts\omnux.ps1 setup
dotnet run --project apps\omnux-middleware\Omnux.Middleware.csproj
```

Open `http://127.0.0.1:8080/`. Health endpoints are `/healthz` and `/readyz`.

The first WebSocket session starts in an OTP-pending state. If Telegram is configured, the OTP is sent there; local development can use the console fallback OTP when enabled.

Remote dashboard access is off by default. When enabled from Settings, LAN clients enter limited mode without an OTP prompt. Limited mode allows read-oriented views, routing policy, and model selection; chat, coding, routine, logic graph, task, refactor, and tool execution actions are blocked along with OTP/CLI auth, Telegram/LLM keys, and external-access toggle changes.
