# Quick Start

[한국어](../QUICKSTART.md) · [English](./quickstart.md)

Updated: 2026-09-12

The shortest path from clone to running app. For screen-by-screen details, see [usage.md](./usage.md).

## 1. Setup

```bash
./scripts/omnux setup
```

macOS uses Homebrew; Linux uses the distribution package manager (apt/dnf/yum/pacman/zypper/apk). Setup runs these steps in order.

| Step | What it does |
|---|---|
| Required tools | Checks/installs `node`, `npm`, `python3`, `sqlite3`, `curl`, `cc`, `make` |
| .NET SDK 9 | On Linux, installs into `~/.dotnet` with the official `dotnet-install.sh` when missing (no sudo) |
| Rust | Installs into `~/.cargo` with rustup when `cargo` is missing |
| Desktop dependencies | On Linux, checks/installs GTK/WebKitGTK development packages |
| Node dependencies | `npm ci`, Playwright Chromium |
| Verification | Middleware build, sandbox smoke, `npm test` |
| Launcher | Links the `omnux` command into `~/.local/bin` or similar |

Linux package installs ask for your sudo password. Optional Python modules (tkinter, pygame, flask, fastapi, uvicorn, and so on) are skipped when sudo is unavailable, and setup continues. The `omnux` command adds `~/.dotnet` and `~/.cargo` to PATH by itself.

On Windows, use `.\scripts\omnux.ps1 setup`.

## 2. Run

| Command | What it does |
|---|---|
| `omnux` | Starts the Tauri desktop app. The app starts the .NET middleware with it |
| `omnux start` | Starts only the middleware in the background |
| `omnux status` | Shows middleware status |
| `omnux shutdown` | Stops the desktop app and the middleware (same as `omnux stop`) |

If setup has never completed, `omnux` and `omnux start` run setup first. On Linux, run the desktop app from a graphical session (Wayland/X11).

## 3. Addresses

| Target | Address |
|---|---|
| Desktop UI (dev mode) | `http://127.0.0.1:1420/` |
| Middleware API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `http://127.0.0.1:41880/readyz` |
| Remote UI | `http://<LAN-IP>:1420/` |

## 4. Authentication

The first WebSocket session starts in an OTP-pending state. If Telegram is configured, the OTP is sent there. The local OTP fallback is on by default: with `omnux` the OTP is printed in the terminal, and with `omnux start` it is written to `~/.omnux/cli/middleware.log`.

## 5. First Check

```bash
curl -s http://127.0.0.1:41880/readyz
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
npm test
```

One LLM key is enough to start. Save it in Settings or point a `*_FILE` environment variable at it.

## 6. Remote Access

Remote access is off by default. When enabled in Settings, other devices on the same LAN can connect. Remote clients enter limited mode without an OTP prompt: read-oriented views, routing policy, and model selection are allowed; chat, coding, routine, and logic graph execution, OTP/CLI auth, Telegram/LLM keys, and external-access toggle changes are blocked.
