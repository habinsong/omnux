# Validation Guide

[한국어](../검증_가이드.md) · [English](./validation.md)

Updated: 2026-09-12

When modifying code or architecture, execute these verification procedures sequentially.

## Basic checks

| Command | Expected result |
|---|---|
| `npm test` | The whole suite passes (`[test] ok`) |
| `./scripts/omnux setup` | Dependency check and install, build, `npm test`, launcher registration |
| `curl -s http://127.0.0.1:41880/readyz` | `"ready":true` |
| `dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json` | A pure JSON doctor report |

On Windows, use `.\scripts\omnux.ps1 setup`.

## npm test steps

The `scripts/run-omnux-tests.mjs` test runner executes the test suite in this sequence and aborts on the first error.

| Order | Group | Scripts |
|---|---|---|
| 1 | Shared catalog | `apps/shared/audit-renewal.test.mjs`, `apps/shared/model-registry.test.mjs` |
| 2 | Repository and boundaries | `check-repo-hygiene`, `check-core-daemon-boundary-contract`, `check-desktop-shell-boundary-contract`, `check-security-boundaries`, `check-extension-wiring-contract` |
| 3 | Screen models | `check-activity-screen`, `check-insights-screen`, `check-operations-screen`, `check-routing-screen`, `check-agents-screen`, `check-review-screen`, `check-skills-screen` |
| 4 | Workspace sources | `check-build-workspace-source`, `check-chat-workspace-source`, `check-explore-workspace-source`, `check-automation-workspace-source`, `check-task-workspace-source`, `check-renewal-screens`, `check-ui-slop` |
| 5 | Stack and registry | `check-tech-stack-contract`, `apps/shared/generate-cs-registry.js --check` |
| 6 | Runtime contracts | `check-coding-python-game-contract`, `check-browser-intent-contract`, `check-chat-telegram-contract` |
| 7 | .NET | Middleware build, `apps/omnux-middleware-tests` unit tests |
| 8 | Gateway | `check-gateway-runtime-contract` (isolated middleware + Playwright Chromium) |
| 9 | Sandbox | `apps/omnux-sandbox/executor.py` smoke |

Screen model checks import `.ts` files directly. On Node environments without native type stripping, the runner automatically attaches `scripts/typescript-loader.mjs`.

`check-ui-slop` analyzes desktop source files for gradients, hover scale, glass effects, excessive tracking, promotional adjectives, and negative parallelism, failing immediately upon policy violations.

## Desktop checks

```bash
npm run build --prefix apps/desktop
omnux
```

`omnux` starts Vite (1420) and the Tauri shell, which launches the .NET middleware (41880) concurrently.

## Screen checks (Playwright)

Execute `npm test` once to prepare gateway fixtures, then run screen checks while Vite responds at `127.0.0.1:1420`. Start the stack with `omnux`, or launch Vite standalone with `OMNUX_DESKTOP_UI_HOST=127.0.0.1 npm run dev --prefix apps/desktop`. (On macOS, `localhost` defaults to IPv6; binding explicitly to `127.0.0.1` ensures stable local resolution.)

| Script | What it checks |
|---|---|
| `run-workspace-ui-checks.mjs` | Ask, Build, Automate, Explore, and Tasks flows in order |
| `check-desktop-launch.mjs` | First launch and relaunch stability |
| `check-viewport-fit.mjs` | Layout responsiveness across 1440, 768, 390, and 320 widths |
| `check-provider-model-defaults.mjs` | Model defaults in Settings |
| `audit-all-screens.mjs` | Horizontal overflow and screenshots for every screen |

Screenshots and logs are saved under `output/playwright/`.

The UI test scripts enforce exact literal string matches against Korean UI labels. Any label modifications require synchronized updates to the corresponding test scripts.

## Live integration checks

These integration paths cannot be verified with offline local tests; they require live credentials and external accounts.

| Command | What it needs |
|---|---|
| `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180` | Bot token, chat id, a mobile Telegram client |
| `node scripts/gist-bridge-remote-qa.mjs --token <GITHUB_TOKEN>` | A GitHub token and a separate remote machine |

## Manual regression

Before a release, follow the [manual regression checklist](./manual-regression-checklist.md).
