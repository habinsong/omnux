# Doctor

[한국어](../DOCTOR.md) · [English](./doctor.md)

Updated: 2026-09-12

When operational anomalies arise, run Doctor first to diagnose the state of 9 core subsystems in a single execution.

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

In the desktop app, navigate to **Status > Checks > Environment diagnostics** to inspect recent results. Fix preview (`doctor_fix_preview`) formulates a non-destructive remediation plan, which can only be executed via `doctor_fix_apply` when a matching preview ID is supplied. Automated repair is strictly limited to creating missing state directories; credential entry, CLI logins, and destructive purging must be performed manually.
