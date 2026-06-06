# Directory Guide

[한국어](../디렉터리_가이드.md) · [English](./directory-guide.md)

Updated: 2026-06-05

The canonical layout uses `apps/`, `docs/`, and `workspace/`. Old alias paths at the root may still exist, but new code goes in canonical paths only.

## Root

| Path | Description |
|---|---|
| `apps/omnux-middleware/` | .NET 9 middleware. WebSocket/HTTP, Telegram, routing, domain orchestration |
| `apps/desktop/` | Tauri v2 desktop app. React 19 + TypeScript + Tailwind CSS v4 |
| `apps/omnux-dashboard/` | Static web dashboard (legacy) |
| `apps/omnux-sandbox/` | Python executor (`executor.py`) |
| `apps/omnux-middleware-tests/` | .NET unit tests (148 files) |
| `apps/.runtime/` | App runtime state |
| `docs/` | Korean docs and `docs/en/` English docs |
| `docs/assets/readme/` | Screenshots for README and feature docs |
| `workspace/` | Work artifacts |
| `scripts/` | `omnux setup/start/shutdown`, Windows `omnux.ps1`, contract check scripts (16) |
| `deploy/` | macOS/Linux deployment templates |
| `.omni/skills/` | User-defined AI skills (`SKILL.md` files) |

## Middleware Internal Structure

| Path | Description |
|---|---|
| `apps/omnux-middleware/src/` | Main source (229 files) |
| `apps/omnux-middleware/src/Application/` | Domain services (75 files). Coding, Routine, Doctor, Plan, TaskGraph, etc. |
| `apps/omnux-middleware/src/CommandDispatch/` | Slash command router + 12 domain handlers (16 files) |
| `apps/omnux-middleware/src/Infrastructure/` | Persistence, Paths, Refactor, Search, Telegram substructure |

## Desktop Internal Structure

| Path | Description |
|---|---|
| `apps/desktop/src/` | React/TypeScript source |
| `apps/desktop/src/features/` | 24 domain screen directories (ask, build, logic, explore, automate, projects, settings, ops, insights, agents, home, activity, routing, etc.) |
| `apps/desktop/src/features/middleware/` | WebSocket gateway helpers (ask, rag, vision, agents, git, telegram, memory, ops, etc.) |
| `apps/desktop/src/components/ui/` | Shared UI primitives (`primitives.tsx`) |
| `apps/desktop/src-tauri/` | Tauri Rust shell (window management only) |
| `apps/desktop/dist/` | Build output |

## Work Artifacts

| Path | Contents |
|---|---|
| `workspace/coding/runs/` | Per-run coding execution folders |
| `workspace/coding/routines/` | Routine execution results and browser agent assets |
| `workspace/.runtime/logic/` | Logic graph execution logs and snapshots |
| `workspace/.runtime/tasks/` | Task graph execution logs |
| `workspace/.runtime/refactor-preview/` | Safe Refactor previews |
| `workspace/coding/` | Coding-related auxiliary files |
| `workspace/runtime/` | Runtime auxiliary files |

## Preservation Criteria

`~/.omnux` is the persistent state original. It contains conversations, plans, notebooks, routing policies, session info, project definitions, agent communications, telemetry tracking, and memory notes — always confirm preservation before deletion.

## Launchers

- `./scripts/omnux setup`: checks or installs dependencies, builds the middleware, validates, and registers the launcher on macOS/Linux.
- `./scripts/omnux`: starts the server; if the setup marker is missing, it attempts automatic setup first.
- `./scripts/omnux shutdown`: stops running omnux processes.
- `.\scripts\omnux.ps1 setup`: Windows setup, build, and validation.
