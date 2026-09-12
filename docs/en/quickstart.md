# Quickstart

[한국어](../QUICKSTART.md) · [English](./quickstart.md)

Updated: 2026-09-12

Only what you need to get from a fresh clone to a running app. Screen-by-screen details are in [usage.md](./usage.md).

## 1. setup

```bash
./scripts/omnux setup
```

macOS uses Homebrew; Linux uses the distribution package manager (apt/dnf/yum/pacman/zypper/apk). It runs in this order.

| Step | What it does |
|---|---|
| Required tools | Checks `node`, `npm`, `python3`, `sqlite3`, `curl`, `cc`, `make` and installs what is missing |
| .NET SDK 9 | On Linux, installs into `~/.dotnet` with the official `dotnet-install.sh` when missing. No sudo needed |
| Desktop dependencies | On Linux, checks and installs the GTK/WebKitGTK development packages |
| Extra Python modules | tkinter, pygame, matplotlib, numpy, requests, and others |
| Rust | Installs into `~/.cargo` with rustup when `cargo` is missing |
| Launcher | Links the `omnux` command into `~/.local/bin` or a similar directory |
| Node dependencies | `npm ci`, then Playwright Chromium |
| Verification | Middleware build, sandbox smoke, `npm test` |

Linux package installs ask for your sudo password. Optional Python modules are skipped when sudo is unavailable, and setup continues. The `omnux` command puts `~/.dotnet` and `~/.cargo` on PATH by itself.

On Windows, use `.\scripts\omnux.ps1 setup`.

## 2. Run

| Command | What it does |
|---|---|
| `omnux` | Starts the desktop app, which starts the .NET middleware with it (same as `omnux desktop`) |
| `omnux start` | Starts only the middleware, in the background |
| `omnux status` | Shows middleware status |
| `omnux shutdown` | Stops the desktop app and the middleware (same as `omnux stop`) |

If setup has never finished, `omnux` and `omnux start` run setup first. On Linux, run the desktop app from a graphical session (Wayland/X11).

## 3. Addresses

| Target | Address |
|---|---|
| Desktop UI (dev mode) | `http://127.0.0.1:1420/` |
| Middleware API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `http://127.0.0.1:41880/readyz` |
| Remote UI | `http://<LAN-IP>:1420/` |

## 4. Authentication

The first WebSocket session starts pending an OTP. With Telegram configured, the OTP goes there. The local OTP fallback is on by default: started with `omnux`, the OTP prints in the terminal; started with `omnux start`, it lands in `~/.omnux/cli/middleware.log`.

## 5. First check

```bash
curl -s http://127.0.0.1:41880/readyz
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
npm test
```

One LLM key is enough to start. Save it under **Settings > Models > API keys**, or point a `*_FILE` environment variable at it.

## 6. Remote access

Remote access is off by default. Turn it on under **Settings > Security > Remote access** and other devices on the same LAN can connect. Remote clients enter limited mode without an OTP prompt, with read queries, routing policy, and model selection only. Chat, coding, routine, and logic graph execution, OTP/CLI auth, Telegram and LLM key storage, and the remote-access toggle itself are blocked.
