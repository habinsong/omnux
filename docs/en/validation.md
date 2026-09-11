# Validation Guide

[한국어](../검증_가이드.md) · [English](./validation.md)

Updated: 2026-09-12

After changing a feature, check at least the following.

## Basic Checks

| Command | Expected result |
|---|---|
| `npm test` | Repository hygiene, contracts, middleware build/unit tests, gateway runtime, and sandbox pass (`[test] ok`) |
| `./scripts/omnux setup` | Dependency check/install, build, `npm test`, launcher registration |
| `curl -s http://127.0.0.1:41880/readyz` | `"ready":true` |
| `dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json` | Pure JSON doctor report |

On Windows, use `.\scripts\omnux.ps1 setup`.

## npm test Steps

`scripts/run-omnux-tests.mjs` runs these in order and stops at the first failure.

| Group | Scripts |
|---|---|
| Shared catalog | `apps/shared/audit-renewal.test.mjs`, `apps/shared/model-registry.test.mjs`, `apps/shared/generate-cs-registry.js --check` |
| Repository/boundaries | `check-repo-hygiene`, `check-core-daemon-boundary-contract`, `check-desktop-shell-boundary-contract`, `check-security-boundaries`, `check-extension-wiring-contract`, `check-tech-stack-contract` |
| Screen models | `check-activity-screen`, `check-insights-screen`, `check-operations-screen`, `check-routing-screen`, `check-agents-screen`, `check-review-screen`, `check-skills-screen` |
| Workspace sources | `check-build/chat/explore/automation/task-workspace-source`, `check-renewal-screens`, `check-ui-slop` |
| Runtime contracts | `check-coding-python-game-contract`, `check-browser-intent-contract`, `check-chat-telegram-contract` |
| .NET | Middleware build, `apps/omnux-middleware-tests` unit tests |
| Gateway | `check-gateway-runtime-contract` (isolated middleware + Playwright Chromium) |
| Sandbox | `apps/omnux-sandbox/executor.py` smoke |

Screen model checks import `.ts` files directly. On a Node build without TypeScript type stripping (such as Ubuntu's distribution package), the runner adds `scripts/typescript-loader.mjs` automatically.

## Desktop Checks

```bash
npm run build --prefix apps/desktop
omnux
```

`omnux` starts vite (1420) and the Tauri shell, and the shell starts the middleware (41880).

## Screen Checks (Playwright)

Run `npm test` once first (it creates the gateway fixtures), then run these while vite answers on `127.0.0.1:1420`. Start it with `omnux` or `OMNUX_DESKTOP_UI_HOST=127.0.0.1 npm run dev --prefix apps/desktop`. On macOS, the default `localhost` binds only to IPv6.

| Script | What it checks |
|---|---|
| `run-workspace-ui-checks.mjs` | Ask/Build/Automate/Explore/Tasks screen flows |
| `check-desktop-launch.mjs` | First launch and relaunch |
| `check-viewport-fit.mjs` | Fit at 1440/768/390/320 widths |
| `check-provider-model-defaults.mjs` | Model defaults in Settings |
| `audit-all-screens.mjs` | Horizontal overflow and screenshots for every screen |

Screenshots and logs are written under `output/playwright/`.

## Manual Regression

Before a release, follow the [manual regression checklist](./manual-regression-checklist.md).
