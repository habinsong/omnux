# Directory Guide

[한국어](../디렉터리_가이드.md) · [English](./directory-guide.md)

Updated: 2026-09-12

The canonical project layout is partitioned into `apps/`, `docs/`, `scripts/`, and `workspace/`. New code must reside within these canonical paths.

## Root

| Path | Contents |
|---|---|
| `apps/omnux-middleware/` | .NET 9 middleware. WebSocket/HTTP, Telegram, routing, domain orchestration |
| `apps/omnux-middleware-tests/` | .NET unit tests |
| `apps/desktop/` | Tauri v2 desktop app. React 19 + TypeScript + Tailwind CSS v4 |
| `apps/omnux-sandbox/` | Python executor (`executor.py`) |
| `apps/shared/` | Model registry (`model-registry.json`), C# generator, renewal inventory scripts |
| `docs/` | Korean documents. English documents are under `docs/en/` |
| `scripts/` | The `omnux` launcher, `omnux.ps1` and `omnux.cmd` for Windows, contract and screen checks |
| `plugins/` | Example plugin kept in the repository (`safety-basics`) |
| `deploy/` | macOS `launchd` plist, Linux `systemd` unit |
| `.github/workflows/` | Guard retry timeline and guard alert dispatch regression workflows |
| `.omni/skills/` | Project skills (`SKILL.md`) |
| `workspace/` | Work output (not tracked by git) |
| `output/` | Check screenshots and fixtures (not tracked by git) |

## Middleware

| Path | Contents |
|---|---|
| `src/` | C# source. `CommandService`, `LlmRouter`, 31 `Ws*CommandDispatcher` types, 100 `*Policy` types |
| `src/Application/` | Domain services: Coding, Routine, Doctor, Plan, TaskGraph, Extensions, Agents, and others |
| `src/CommandDispatch/` | Slash command router and domain handlers |
| `src/Infrastructure/` | Browser, Paths, Persistence, Refactor, Search, Telegram, Workspace |
| `resources/browser/` | Playwright browser execution resources (embedded in the assembly) |
| `tools/` | ACP adapters and the desktop control MCP script |

## Desktop

| Path | Contents |
|---|---|
| `src/App.tsx` | Screen registry |
| `src/features/shell/nav-areas.ts` | The 6 areas and the screens in each |
| `src/features/` | One directory per screen (`*-workspace`, `settings`, `middleware`, and so on) |
| `src/features/middleware/` | WebSocket gateway helpers |
| `src/components/` | Shared UI (`ui/primitives.tsx`, `screen/`, `capsule/`) |
| `src-tauri/` | Tauri Rust shell (window management, middleware bootstrap) |

## Work output

| Path | Contents |
|---|---|
| `workspace/coding/runs/` | One folder per build run |
| `workspace/coding/routines/` | Routine run results and browser agent assets |
| `workspace/.runtime/logic/` | Logic graph run logs and snapshots |
| `workspace/.runtime/tasks/` | Task graph run logs |
| `workspace/.runtime/refactor-preview/` | Safe Refactor previews |

## What to keep

The `~/.omnux` directory is the single source of truth for persistent system state: conversations, plans, notebooks, routing policies, sessions, projects, agent messaging logs, telemetry, and memory notes. Inspect its contents and understand dependencies before pruning. The `omnux` CLI launcher persists runtime state under `~/.omnux/cli/`.

Consult the [cleanup guide](./cleanup.md) for explicit retention and deletion policies.

## Launcher

| Command | What it does |
|---|---|
| `./scripts/omnux setup` | Checks and installs dependencies, builds, runs `npm test`, registers the launcher |
| `omnux` | Starts the desktop app, middleware included |
| `omnux start` / `status` / `shutdown` | Middleware only, status, stop everything |
| `.\scripts\omnux.ps1 setup` | Windows setup |
