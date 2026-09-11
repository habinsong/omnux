# Directory Guide

[한국어](../디렉터리_가이드.md) · [English](./directory-guide.md)

Updated: 2026-09-12

The canonical layout is `apps/`, `docs/`, and `workspace/`. New code goes in canonical paths only.

## Root

| Path | Description |
|---|---|
| `apps/omnux-middleware/` | .NET 9 middleware. WebSocket/HTTP, Telegram, routing, domain orchestration |
| `apps/omnux-middleware-tests/` | .NET unit tests |
| `apps/desktop/` | Tauri v2 desktop app. React 19 + TypeScript + Tailwind CSS v4 |
| `apps/omnux-sandbox/` | Python executor (`executor.py`) |
| `apps/shared/` | Model registry (`model-registry.json`) and C# generator |
| `docs/` | Korean docs, `docs/en/` English docs |
| `scripts/` | `omnux` launcher, Windows `omnux.ps1`, contract/screen check scripts |
| `deploy/` | macOS/Linux deployment templates |
| `.omni/skills/` | Project skills (`SKILL.md`) |
| `workspace/` | Work artifacts (not tracked by git) |
| `output/` | Check screenshots and fixtures (not tracked by git) |

## Middleware

| Path | Description |
|---|---|
| `apps/omnux-middleware/src/` | C# source |
| `apps/omnux-middleware/src/Application/` | Domain services. Coding, Routine, Doctor, Plan, TaskGraph, etc. |
| `apps/omnux-middleware/src/CommandDispatch/` | Slash command router and domain handlers |
| `apps/omnux-middleware/src/Infrastructure/` | Browser, Paths, Persistence, Refactor, Search, Telegram, Workspace |
| `apps/omnux-middleware/resources/browser/` | Playwright browser execution resources (embedded) |

## Desktop

| Path | Description |
|---|---|
| `apps/desktop/src/App.tsx` | Screen registry |
| `apps/desktop/src/features/` | Per-screen directories (`*-workspace`, `shell`, `settings`, `middleware`, etc.) |
| `apps/desktop/src/features/middleware/` | WebSocket gateway helpers |
| `apps/desktop/src/components/` | Shared UI (`ui/primitives.tsx`, `screen/`, `capsule/`) |
| `apps/desktop/src-tauri/` | Tauri Rust shell (window management, middleware bootstrap) |

## Work Artifacts

| Path | Contents |
|---|---|
| `workspace/coding/runs/` | Per-run build folders |
| `workspace/coding/routines/` | Routine results and browser agent assets |
| `workspace/.runtime/logic/` | Logic graph run logs and snapshots |
| `workspace/.runtime/tasks/` | Task graph run logs |
| `workspace/.runtime/refactor-preview/` | Safe Refactor previews |

## Preservation

`~/.omnux` is the source of persistent state: conversations, plans, notebooks, routing policies, sessions, projects, agent communication, telemetry, and memory notes. Confirm before deleting anything there. The `omnux` launcher state lives in `~/.omnux/cli/`.

## Launchers

- `./scripts/omnux setup`: dependency check/install, build, `npm test`, launcher registration
- `omnux`: starts the desktop app (with the middleware)
- `omnux start` / `status` / `shutdown`: middleware only, status, stop everything
- `.\scripts\omnux.ps1 setup`: Windows setup
