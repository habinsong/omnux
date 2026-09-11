# Doctor

[한국어](../DOCTOR.md) · [English](./doctor.md)

Updated: 2026-09-12

Doctor is the first diagnostic to run. It checks the .NET core runtime, workspace, sandbox, SQLite, provider keys, Codex/Copilot CLIs, Telegram, and the search pipeline in one pass.

## Run

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
```

`--json` prints pure JSON only. Without it, the report is human-readable text.

In the desktop app, open **Status > Checks > Environment diagnostics** for the latest report. Fix preview (`doctor_fix_preview`) builds a repair plan from the latest report, and apply (`doctor_fix_apply`) runs only with that preview ID; the only automatic action is creating missing directories. API key entry, CLI auth, and destructive cleanup are never automatic.

## Reading It

- `ok`: healthy
- `warn`: works, but check it
- `fail`: fix before using that feature
- `skip`: not checked in this run

If a provider key is missing, add it in Settings or through a `*_FILE` environment variable. If Copilot/Codex needs CLI auth, check **Settings > Models & keys > CLI auth**.
