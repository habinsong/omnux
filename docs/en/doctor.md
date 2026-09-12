# Doctor

[한국어](../DOCTOR.md) · [English](./doctor.md)

Updated: 2026-09-12

Doctor is the first diagnostic to run. It checks nine things in one pass.

## Run

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
```

`--json` prints pure JSON only. Without it, the report is human-readable text. In Telegram, it is `/doctor`.

## Checks

| id | What it checks |
|---|---|
| `core_runtime` | The .NET core runtime |
| `workspace` | JSON, `.bak`, `.lock`, and corrupt-JSON counts under the state root |
| `sandbox` | The Python executor |
| `sqlite` | SQLite |
| `provider_secrets` | Whether provider keys are present |
| `copilot` | Copilot CLI install and auth |
| `codex` | Codex CLI install and auth |
| `telegram` | Bot token and chat id |
| `search_pipeline` | The search path |

## Reading it

| Status | Meaning |
|---|---|
| `ok` | Healthy |
| `warn` | It works, but check it |
| `fail` | Fix it before using that feature |
| `skip` | Not checked in this run |

If a provider key is missing, add it under **Settings > Models > API keys** or through a `*_FILE` environment variable. If Copilot or Codex needs CLI auth, check **Settings > Models > CLI connections**.

## In the desktop app

**Status > Checks > Environment diagnostics** shows the latest report. Fix preview (`doctor_fix_preview`) builds a repair plan from that report, and apply (`doctor_fix_apply`) runs only with that preview ID. The only automatic action is creating missing directories. API key entry, CLI auth, and destructive cleanup are never automatic.
