# Cleanup

[한국어](../CLEANUP.md) · [English](./cleanup.md)

Updated: 2026-09-12

Before cleaning up omnux files, separate caches you can regenerate from state you need to keep.

The desktop **Status > Tools > Cleanup** panel lists candidates first (`cleanup_preview`) and deletes only with a selected preview (`cleanup_apply`). Candidates are `apps/.runtime`, `workspace/.runtime`, `bin`/`obj`/`.runtime` under `apps/`, and `.DS_Store`. Files inside `.git` are excluded.

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

Everything under `~/.omnux` is the source of settings and history: conversations, plans, notebooks, routing policy, and the Telegram offset. Do not delete it without a backup. Export a portable backup package under **Settings > Data > Backup**.

On Linux, `~/.dotnet` and `~/.cargo` installed by setup are tools `omnux` uses.
