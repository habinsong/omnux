# Quickstart

[한국어](../QUICKSTART.md) · [English](./quickstart.md)

Updated: 2026-09-12

Steps to take a clean clone to a running application. For screen-by-screen interactions, see [usage.md](./usage.md).

## 1. setup

```bash
./scripts/omnux setup
```

On macOS, setup uses Homebrew; on Linux, it detects your package manager (apt/dnf/yum/pacman/zypper/apk). Setup proceeds in this sequence:

| Step | What it does |
|---|---|
| Required tools | Checks `node`, `npm`, `python3`, `sqlite3`, `curl`, `cc`, `make` and installs what is missing |
| .NET SDK 9 | On Linux, installs into `~/.dotnet` via the official `dotnet-install.sh` if missing (no sudo required) |
| Desktop dependencies | On Linux, verifies and installs GTK/WebKitGTK development headers |
| Extra Python modules | Verifies optional packages (tkinter, pygame, matplotlib, numpy, requests) |
| Rust | Installs into `~/.cargo` via rustup if `cargo` is missing |
| Launcher | Links the `omnux` CLI binary into `~/.local/bin` |
| Node dependencies | Executes `npm ci` and provisions Playwright Chromium |
| Verification | Compiles middleware, runs sandbox smoke tests, and executes `npm test` |

Linux system packages require sudo privileges. Optional Python modules are skipped if sudo is unavailable. The `omnux` launcher automatically prepends `~/.dotnet` and `~/.cargo` to PATH.

On Windows, run `.\scripts\omnux.ps1 setup`.

## 2. Run

| Command | What it does |
|---|---|
| `omnux` | Launches the desktop shell, which spawns the .NET middleware (equivalent to `omnux desktop`) |
| `omnux start` | Spawns the .NET middleware as a standalone background service |
| `omnux status` | Inspects current middleware process status |
| `omnux shutdown` | Gracefully terminates both desktop and middleware processes (equivalent to `omnux stop`) |

If setup has not completed, `omnux` and `omnux start` will run setup automatically. On Linux, run the desktop app inside an active graphical display session (Wayland or X11).

## 3. Addresses

| Target | Address |
|---|---|
| Desktop UI (dev mode) | `http://127.0.0.1:1420/` |
| Middleware API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `http://127.0.0.1:41880/readyz` |
| Remote UI | `http://<LAN-IP>:1420/` |

## 4. Authentication

The initial WebSocket session enters an OTP challenge state. When Telegram is configured, the OTP is sent to your Telegram bot. Local OTP fallback is enabled by default: running `omnux` outputs the OTP in the active terminal, while running `omnux start` logs it to `~/.omnux/cli/middleware.log`.

## 5. First check

```bash
curl -s http://127.0.0.1:41880/readyz
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
npm test
```

Only one LLM provider key is required to begin. Register keys under **Settings > Models > API keys**, or export `*_FILE` environment variables.

## 6. Remote access

Remote access is disabled by default. Enabling it under **Settings > Security > Remote access** allows devices on the same LAN to connect. Remote clients connect in restricted mode without OTP challenges, permitting read queries, routing inspection, and model selection. Conversational chat, coding runs, routine and logic execution, token authentication, credential modification, and toggling remote access remain strictly forbidden.
