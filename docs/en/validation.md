# Validation Guide

[한국어](../검증_가이드.md) · [English](./validation.md)

Updated: 2026-06-05

If you changed functionality, verify at minimum with the following steps.

## Basic Validation

| Command | Expected Result |
|---|---|
| `python3 apps/omnux-sandbox/executor.py --code "print('ok')"` | Prints `ok` |
| `dotnet build apps/omnux-middleware/Omnux.Middleware.csproj` | Middleware build succeeds |
| `npm test` | Repository hygiene, security boundaries, screen/contract tests pass |
| `./scripts/omnux setup` | macOS/Linux dependency check/install, build, validation, launcher registration |
| `curl -s http://127.0.0.1:8080/readyz` | Ready status |
| `dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json` | Doctor JSON output |

Windows basic validation:

```powershell
.\scripts\omnux.ps1 setup
```

## Desktop App Validation

```bash
# Vite build
npm run build --prefix apps/desktop

# Tauri dev mode (middleware must be running first)
npm run tauri dev --prefix apps/desktop
```

The desktop app requires a middleware WebSocket connection (default `ws://127.0.0.1:8080`). Make sure the middleware is running first.

## Screenshot Validation

```bash
file docs/assets/readme/dashboard-desktop-1920x1080.png \
  docs/assets/readme/dashboard-chat-tab.png \
  docs/assets/readme/dashboard-coding-tab.png \
  docs/assets/readme/dashboard-mobile-closed-390x844.png \
  docs/assets/readme/dashboard-mobile-composer-390x844.png.png
```

There are currently 13 README PNGs under `docs/assets/readme/`. `social-preview.png` is for social preview only.

## Contract Check Scripts

There are 16 contract check scripts under `scripts/`. `npm test` runs them all, but you can run individual scripts when narrowing scope.

| Script | What it checks |
|---|---|
| `check-tech-stack-contract.mjs` | Tech stack contract |
| `check-repo-hygiene.mjs` | Repository hygiene |
| `check-security-boundaries.mjs` | Security boundary contract |
| `check-frontend-contracts.mjs` | Frontend type contracts |
| `check-ws-contracts.mjs` | WebSocket message contracts |
| `check-desktop-contracts.mjs` | Desktop screen contracts |
| `check-dashboard-contracts.mjs` | Dashboard screen contracts |
| `check-middleware-contracts.mjs` | Middleware internal contracts |

Before and after Phase 5 changes, pass `npm test`. When narrowing scope, run at minimum `check-tech-stack-contract` and `check-repo-hygiene` together.

## Manual Regression Checks

- **Home**: Active Projects, Continue, Recent Activity, Resource Usage cards
- **Ask**: Single/orchestration/multi LLM switching, markdown rendering, Think+ toggle, RAG preflight, Vision, Token usage
- **Build**: Execution folder creation, recent result restore, orchestration/multi mode, rollback snapshot
- **Logic**: Graph save/run/delete, output creation, recovery candidate lookup
- **Explore**: Web search, URL fetch, session management, agent spawn, Browser/Canvas
- **Automate**: Routine CRUD, immediate execution, scheduled status, creation wizard, Telegram delivery
- **Projects**: Project CRUD, representative project designation, Touch refresh
- **Settings**: Memory/Backup, Models/Services, remote access toggle, sensitive settings blocking, provider status
- **Operations**: Doctor diagnostics, Git Automation snapshot/preview/apply, Plan/Task read-only
- **Activity**: Event timeline, Session Replay
- **Insights**: Telemetry, Semantic Search Readiness, Local LLM, Git Time Machine, Commit Learning, Self Improvement, MCP, Terminal, Routing Policy
- **Agents**: Agent Bus, Multi-Agent Trace, Watchdog, Worktree
- **Theme**: Glass/Light/Dark switching
- **Security boundaries**: Unauthenticated WebSocket request rejection, remote limited mode auto-entry, remote OTP request blocking, remote auth/secret/external-access setting blocking with distinct messages, remote chat/coding/routine/logic graph execution blocking, remote read-oriented views and model/routing settings allowed, WebSocket Origin check, routine image preview path restriction, attachment count/size excess rejection, Markdown raw HTML blocking
