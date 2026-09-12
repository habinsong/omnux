# Environment and State Files

[한국어](../환경변수_및_상태파일.md) · [English](./environment-and-state.md)

Updated: 2026-09-12

Settings and conversation history live under `~/.omnux`; work output lives under `workspace/`. `~/.omnux` is the only state directory. Only `OMNUX_*` variables are read, and there are currently 159 of them. The tables below cover the ones you reach for.

## Secrets

| Variable | Meaning |
|---|---|
| `OMNUX_GEMINI_API_KEY_FILE` | Gemini key file |
| `OMNUX_GROQ_API_KEY_FILE` | Groq key file |
| `OMNUX_CEREBRAS_API_KEY_FILE` | Cerebras key file |
| `OMNUX_NVIDIA_API_KEY_FILE` | NVIDIA NIM key file |
| `OMNUX_CODEX_API_KEY_FILE` | Codex API key file |
| `OMNUX_TELEGRAM_BOT_TOKEN_FILE` | Telegram bot token file |
| `OMNUX_*_KEYCHAIN_SERVICE`, `OMNUX_*_KEYCHAIN_ACCOUNT` | Which macOS Keychain item to read |

A raw key in a variable such as `OMNUX_GROQ_API_KEY` works, but in operation use `*_FILE` or the secure store.

```bash
mkdir -p "$HOME/.omnux/keys"
printf 'YOUR_GROQ_KEY' > "$HOME/.omnux/keys/groq_api_key"
chmod 600 "$HOME/.omnux/keys/groq_api_key"
export OMNUX_GROQ_API_KEY_FILE="$HOME/.omnux/keys/groq_api_key"
```

## Models

| Variable | Default |
|---|---|
| `OMNUX_GEMINI_MODEL` | The model registry default, currently `gemini-3.5-flash-lite` |
| `OMNUX_GEMINI_FLASH_MODEL` | `gemini-3-flash-preview` |
| `OMNUX_GEMINI_FLASH_LITE_MODEL` | `gemini-3.1-flash-lite`, used for search support |
| `OMNUX_GROQ_MODEL`, `OMNUX_CEREBRAS_MODEL`, `OMNUX_NVIDIA_MODEL`, `OMNUX_COPILOT_MODEL`, `OMNUX_CODEX_MODEL`, `OMNUX_GROK_MODEL` | The per-provider default in `apps/shared/model-registry.json` |

## Timeouts

| Variable | Default |
|---|---|
| `OMNUX_NVIDIA_TIMEOUT_SEC` | 180s |
| `OMNUX_CEREBRAS_TIMEOUT_SEC` | 40s |
| `OMNUX_SINGLE_CHAT_DEFAULT_TIMEOUT_SEC` | 34s (clamped to 5–600) |
| `OMNUX_NVIDIA_MIN_SINGLE_CHAT_TIMEOUT_SEC` | 30s |
| `OMNUX_CEREBRAS_MIN_SINGLE_CHAT_TIMEOUT_SEC` | 40s |
| `OMNUX_CLI_READY_TIMEOUT_SEC` | 180s wait for `omnux start` readiness |

## Server and limits

| Variable | Default |
|---|---|
| `OMNUX_WS_PORT` | 41880, shared by HTTP and WebSocket |
| `OMNUX_WS_COMMANDS_PER_MINUTE` | 30, per authenticated session |
| `OMNUX_WS_MAX_CONNECTIONS` | 16 |
| `OMNUX_WS_MAX_MESSAGE_BYTES` | 16MiB (clamped to 64KiB–256MiB) |
| `OMNUX_HTTP_MAX_CONCURRENT_REQUESTS` | 64 |

## Paths and behavior

| Variable | Meaning |
|---|---|
| `OMNUX_STATE_DIR` | State root override (default `~/.omnux`) |
| `OMNUX_WORKSPACE_ROOT` | Workspace root override (default: the repo's `workspace/coding`) |
| `OMNUX_PROJECT_CONTEXT_FALLBACK_FILENAMES` | Instruction files to read when AGENTS is absent (default `TEAM_GUIDE.md,.agents.md`) |
| `OMNUX_ENABLE_DYNAMIC_CODE` | Whether local code execution is allowed |
| `OMNUX_ENABLE_LOCAL_OTP_FALLBACK` | Local OTP fallback (on by default) |
| `OMNUX_GATEWAY_STARTUP_PROBE` | Gateway startup probe |
| `OMNUX_TELEGRAM_CHAT_ID` | The single chat_id the bot answers |
| `OMNUX_TELEGRAM_ALLOWED_USER_ID` | Allowed user_ids, separated by comma, semicolon, or space (`"123,456"`) |
| `OMNUX_BROWSER_TOOL_MODE` | `auto` (default), `playwright`, or `off`. The old `stub` value returns a disabled error |
| `OMNUX_CANVAS_TOOL_MODE` | `auto` (default), `playwright`, or `off`. The old `stub` value returns a disabled error |
| `OMNUX_BROWSER_CHANNEL` | Chromium channel. Empty uses Playwright Chromium, falling back to an installed Chrome |
| `OMNUX_BROWSER_HEADLESS` | Headless Playwright (default `true`) |

## State locations

| Location | Contents |
|---|---|
| `~/.omnux/conversations.json` | Conversations, with the active skill in `ConversationThread.ActiveSkillName` |
| `~/.omnux/plans/` | Plan source |
| `~/.omnux/tasks/` | Task graph source |
| `~/.omnux/notebooks/` | Notebooks and handoff documents |
| `~/.omnux/memory-notes/` | Memory notes |
| `~/.omnux/routing-policy.json` | Provider fallback policy |
| `~/.omnux/projects.json` | Registered local projects |
| `~/.omnux/routines.json` | Automation definitions |
| `~/.omnux/llm_usage.json` | Groq and Gemini usage and rate limit state |
| `~/.omnux/copilot_usage.json` | Copilot model selection and local usage |
| `~/.omnux/guard_retry_timeline.json` | Guard retry timeline |
| `~/.omnux/skill_aliases.json` | `/skill quick` alias map (lowercase alias key, skill name value) |
| `~/.omnux/cli/` | `omnux` launcher state and `middleware.log` |
| `workspace/coding/runs/` | Coding run output |
| `workspace/coding/routines/` | Routine run results |
| `workspace/.runtime/logic/` | Logic graph run logs |
| `workspace/.runtime/tasks/` | Task graph run logs |
| `workspace/.runtime/refactor-preview/` | Safe Refactor previews |

## Persistence inventory

Where possible, JSON state stores go through `AtomicFileStore`: a per-file `.lock` lease and an atomic replace. The previous valid file stays as `.bak` next to it. "Atomic write + backup recovery" in the table below means the read path also validates `.bak` and restores the primary when the primary JSON is corrupt.

| State | Default location | Override | Handling |
|---|---|---|---|
| Conversations and active skill | `~/.omnux/conversations.json` | `OMNUX_CONVERSATION_STATE_PATH` | Atomic write + backup recovery |
| Auth sessions | `~/.omnux/auth_sessions.json` | `OMNUX_AUTH_SESSION_STATE_PATH` | Atomic write + backup recovery |
| Routine definitions | `~/.omnux/routines.json` | `OMNUX_ROUTINE_STATE_PATH` | Atomic write + backup recovery |
| LLM usage | `~/.omnux/llm_usage.json` | `OMNUX_LLM_USAGE_STATE_PATH` | Atomic write + backup recovery |
| Copilot usage | `~/.omnux/copilot_usage.json` | `OMNUX_COPILOT_USAGE_STATE_PATH` | Atomic write + backup recovery |
| Routing policy override | `~/.omnux/routing-policy.json` | none | Atomic write + backup recovery |
| Plan index, body, review, run record | `~/.omnux/plans/index.json`, `~/.omnux/plans/<planId>/*.json` | none | Atomic write + backup recovery |
| Task graph index and body | `~/.omnux/tasks/index.json`, `~/.omnux/tasks/<graphId>.json` | none | Atomic write + backup recovery |
| Telegram reply outbox | `~/.omnux/telegram_reply_outbox.json` | none | Atomic write + backup recovery |
| Guard retry timeline | `~/.omnux/guard_retry_timeline.json` | `OMNUX_GUARD_RETRY_TIMELINE_STATE_PATH` | Atomic write + backup recovery |
| Gateway health snapshot | `~/.omnux/gateway_health.json` | `OMNUX_GATEWAY_HEALTH_STATE_PATH` | Atomic write, no read recovery |
| Gateway startup probe snapshot | `~/.omnux/gateway_startup_probe.json` | `OMNUX_GATEWAY_STARTUP_PROBE_STATE_PATH` | Atomic write, no read recovery |
| Remote access setting | `~/.omnux/dashboard_access.json` | `OMNUX_DASHBOARD_ACCESS_STATE_PATH` | Atomic write, no read recovery |
| Doctor last report and history | `~/.omnux/doctor/last-report.json`, `~/.omnux/doctor/history/*.json` | none | Atomic write, no read recovery |
| Safe Refactor preview | `workspace/.runtime/refactor-preview/*.json` | none | Atomic write, TTL-bound temporary state |
| Logic graph run snapshot | `workspace/.runtime/logic/<graphId>/<runId>/snapshot.json` | none | Run output, no read recovery |
| Task graph run stdout/stderr/result | `workspace/.runtime/tasks/<graphId>/<taskId>/` | none | Run output, no read recovery |
| Notebook documents | `~/.omnux/notebooks/<projectKey>/*.md` | none | Atomic write, Markdown document |
| Memory notes | `~/.omnux/memory-notes/*.md` | `OMNUX_MEMORY_NOTES_DIR` | Atomic write, Markdown document |

The `workspace` check in `doctor --json` reports the JSON, `.bak`, `.lock`, and corrupt-JSON counts under the state root. When corrupt JSON is present it also reports whether a backup exists, as `corruptJsonFiles=<relative path>:backup=yes|no`.
