# Tool Integration Panel

[한국어](../도구_통합_패널_사용_가이드.md) · [English](./tool-integration-panel.md)

Updated: 2026-06-05

![Settings tab](../assets/readme/dashboard-settings-tab.png)

The tool integration panel is an operations screen inside Settings. It's not for building features — it's for observing provider, tool, and RAG status, and sending control requests when needed.

## Viewing Order

1. Check status summary for problem domains.
2. Check Provider status for missing keys, CLI auth, recent errors.
3. Check Guard observations to understand why search/RAG responses were allowed or blocked.
4. Send control requests only for the needed domain/action.
5. Check results for status, duration, reason.

## Main Domains

| Domain | Examples |
|---|---|
| `sessions` | list, history, send |
| `cron` | status, create, toggle, delete |
| `browser` | status, start, stop, tabs, navigate, open, focus, close (default `auto`: Playwright real Chromium first, stub fallback on failure) |
| `telegram` | command simulation |
| `web` | search, fetch |
| `memory` | search, get, rebuild |
| `doctor` | fix preview, fix apply |
| `cleanup` | preview, apply |

## Browser Tool Usage

Typing natural language in the desktop Ask or Build screen automatically detects browser intent.

Examples:

- `Open Naver`
- `Open YouTube in a new tab`
- `Open github.com`
- `Open browser`
- `Close browser`

This input is detected as browser intent before reaching LLM or coding execution. In default `auto` mode, Playwright helper lazy-starts and opens a real Chromium instance.

Use the tool integration panel in Settings only for direct operator control. Send `browser.status`, `browser.navigate`, etc. via the control request section.

Environment variables are not part of normal usage. The default is `auto`, which uses real browser first when Playwright is available, falling back to stub on failure.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OMNUX_BROWSER_TOOL_MODE` | `auto` | `auto` (Playwright first, stub fallback), `stub`, `playwright`, `off` |
| `OMNUX_BROWSER_HEADLESS` | `true` | Playwright browser headless mode |
