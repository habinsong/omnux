# Cleanup Guide

[한국어](../CLEANUP.md) · [English](./cleanup.md)

Updated: 2026-09-12

omnux produces a lot of artifacts. Separate regenerable caches from state you must keep.

The desktop **Status > Tools > Cleanup** panel lists candidates first (`cleanup_preview`) and deletes only with a selected preview (`cleanup_apply`). Candidates are `apps/.runtime`, `workspace/.runtime`, `bin`/`obj`/`.runtime` under `apps/`, and `.DS_Store`.

## Usually safe to delete

| Path | Why |
|---|---|
| `node_modules/` | Restored by `npm ci` |
| `apps/omnux-middleware/bin/`, `obj/` | .NET build output |
| `apps/desktop/dist/`, `apps/desktop/src-tauri/target/` | Desktop build output |
| `workspace/coding/venv/` | Recreatable virtualenv |
| `output/` | Check screenshots and fixtures (`npm test` recreates them) |

## Check first

| Path | Why |
|---|---|
| `workspace/coding/runs/` | Build result files |
| `workspace/coding/routines/` | Automation results and downloaded assets |
| `workspace/.runtime/logic/` | Logic run traces |
| `workspace/.runtime/tasks/` | Task graph logs |

## Never delete casually

Everything under `~/.omnux` is the source of settings and history: conversations, plans, notebooks, routing policy, and the Telegram offset. Don't delete it without a backup. On Linux, `~/.dotnet` and `~/.cargo` installed by setup are tools `omnux` uses.
