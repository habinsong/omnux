# Quick Start

[한국어](../QUICKSTART.md) · [English](./quickstart.md)

Updated: 2026-06-05

This is the shortest path from clone to running app.

![Dashboard](../assets/readme/dashboard-desktop-1920x1080.png)

## Requirements

| Tool | Purpose |
|---|---|
| `.NET SDK 9` | Middleware build and run |
| `python3` | Sandbox and coding validation |
| `node`, `npm` | Repository contracts and hygiene tests |
| Optional: `gh`, `copilot`, `codex` | Copilot/Codex CLI integration |

## Setup

```bash
./scripts/omnux setup
```

This single command checks dependencies, builds the middleware, runs `npm test`, and registers the launcher. If the setup marker is missing, the first `omnux` start also attempts automatic setup.

Windows:

```powershell
.\scripts\omnux.ps1 setup
```

## Start Middleware

```bash
./scripts/omnux
```

The middleware starts at `http://127.0.0.1:8080`. Health endpoints are `/healthz` and `/readyz`.

Manual run:

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj
```

## Desktop App

```bash
# Development mode (middleware must be running first)
npm run tauri dev --prefix apps/desktop
```

The desktop app (Tauri v2 + React 19 + TypeScript + Tailwind CSS v4) is the primary interface. It connects to the middleware WebSocket at `ws://127.0.0.1:8080`.

## Web Dashboard

Open `http://127.0.0.1:8080/` in a browser. The web dashboard is a legacy static interface.

The first WebSocket session starts in an OTP-pending state. If Telegram is configured, the OTP is sent there; local development can use the console fallback OTP when enabled.

## First Check

```bash
# Middleware health
curl -s http://127.0.0.1:8080/readyz

# Environment diagnostics
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json

# Repository contracts and hygiene
npm test
```

## Shutdown

```bash
./scripts/omnux shutdown
```

## Remote Access

Remote dashboard access is off by default. When enabled from Settings, LAN clients enter limited mode without an OTP prompt. Limited mode allows read-oriented views, routing policy, and model selection; chat, coding, routine, logic graph, task, refactor, and tool execution actions are blocked along with OTP/CLI auth, Telegram/LLM keys, and external-access toggle changes.
