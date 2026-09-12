# Cleanup

[한국어](../CLEANUP.md) · [English](./cleanup.md)

Updated: 2026-09-12

When reclaiming disk space in omnux environments, strictly distinguish disposable build caches and runtime fixtures from persistent operational state.

In the desktop app, the **Status > Tools > Cleanup** panel generates a dry-run candidate preview (`cleanup_preview`) and only executes removals when a confirmed preview ID is supplied (`cleanup_apply`). Search targets include `apps/.runtime`, `workspace/.runtime`, `bin`/`obj`/`.runtime` across subprojects, and temporary OS metadata (`.DS_Store`). The `.git` version control repository is always excluded.

## Usually safe to delete

| Path | Why |
|---|---|
| `node_modules/` | Restored by `npm ci` |
| `apps/omnux-middleware/bin/`, `obj/` | .NET build output |
| `apps/desktop/dist/`, `apps/desktop/src-tauri/target/` | Desktop build output |
| `workspace/coding/venv/` | A virtualenv you can recreate |
| `output/` | Check screenshots and fixtures. `npm test` recreates them |

## Check first

| Path | What is in it |
|---|---|
| `workspace/coding/runs/` | Build result files |
| `workspace/coding/routines/` | Automation results and downloaded assets |
| `workspace/.runtime/logic/` | Logic run traces |
| `workspace/.runtime/tasks/` | Task graph logs |

## Do not delete casually

Directories under `~/.omnux` constitute the single source of truth for persistent system state: conversations, plans, notebooks, routing policies, and Telegram offsets. Never delete this directory without a verified backup. Use **Settings > Data > Backup** to export portable packages.

On Linux, `~/.dotnet` and `~/.cargo` installed in user directories by `setup` are also core tools required by the `omnux` runtime.
