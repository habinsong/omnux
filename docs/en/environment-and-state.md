# Environment and State Files

[한국어](../환경변수_및_상태파일.md) · [English](./environment-and-state.md)

Updated: 2026-09-12

Settings and history live under `~/.omnux`; work output lives under `workspace/`. Only `OMNUX_*` variables are read. For secrets, prefer `*_FILE` or the secure store over raw keys in the environment.

## Common Variables

| Variable | Meaning |
|---|---|
| `OMNUX_WS_PORT` | Middleware HTTP/WebSocket port (default 41880) |
| `OMNUX_WORKSPACE_ROOT` | Workspace root override (default: the repo's `workspace/coding`) |
| `OMNUX_GEMINI_API_KEY_FILE`, `OMNUX_GROQ_API_KEY_FILE`, `OMNUX_CEREBRAS_API_KEY_FILE`, `OMNUX_NVIDIA_API_KEY_FILE`, `OMNUX_CODEX_API_KEY_FILE` | Provider key files |
| `OMNUX_GEMINI_MODEL` | Default Gemini model (model registry default, currently `gemini-3.5-flash-lite`) |
| `OMNUX_TELEGRAM_CHAT_ID`, `OMNUX_TELEGRAM_ALLOWED_USER_ID` | Telegram chat and allowed user IDs |
| `OMNUX_ENABLE_LOCAL_OTP_FALLBACK` | Local OTP fallback (on by default) |
| `OMNUX_BROWSER_TOOL_MODE`, `OMNUX_CANVAS_TOOL_MODE` | `auto` (default), `playwright`, or `off` |
| `OMNUX_BROWSER_HEADLESS` | Headless browser (default `true`) |
| `OMNUX_WS_COMMANDS_PER_MINUTE` | Per-session command rate limit (default 30) |
| `OMNUX_CLI_READY_TIMEOUT_SEC` | `omnux start` readiness wait (default 180s) |

## State Locations

| Location | Contents |
|---|---|
| `~/.omnux/conversations.json` | Conversations and the active skill |
| `~/.omnux/routines.json` | Automation definitions |
| `~/.omnux/plans/`, `~/.omnux/tasks/` | Plans and task graphs |
| `~/.omnux/notebooks/` | Notebooks and handoff documents |
| `~/.omnux/memory-notes/` | Memory notes |
| `~/.omnux/cli/` | `omnux` launcher state and middleware log |
| `workspace/coding/runs/`, `workspace/coding/routines/` | Build and automation results |

JSON state files are written atomically with a per-file `.lock` lease, and the previous valid file is kept as `.bak`. The Korean document has the full variable and state inventory.
