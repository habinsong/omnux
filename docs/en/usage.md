# omnux Usage

[한국어](../사용법_빠른시작.md) · [English](./usage.md)

Updated: 2026-09-12

A short tour of the desktop screens you use most. For install and run, see [quickstart.md](./quickstart.md). The Telegram guide is Korean only: [텔레그램_봇_가이드.md](../텔레그램_봇_가이드.md).

## Layout

Pick an area on the left rail, then a screen in the sub-panel. On narrow widths, open navigation with the top menu button. ⌘K (Ctrl+K on Windows/Linux) opens the command palette.

| Area | Screens |
|---|---|
| Home | Home |
| Workspace | Ask, Build, Automate, Explore, Review |
| Projects | Projects, Tasks, Notes |
| Engine | Agents, Tools, Extensions, Routing, Rules |
| Monitor | Activity, Logs, Status |
| Settings | Settings |

## Home

Type a request straight into the input. Shortcuts below it (Automate, Logic, Skills, Plan, Notes) create new items, and the bottom **Continue work** and **Active projects** panels bring you back to recent work.

## Ask

Tabs: Chat · Models · References · History

- Modes are single, orchestration, and multi. Multi compares several provider answers side by side.
- Enter sends and Shift+Enter adds a line. Enter during Korean IME composition does not send.
- Attach files and images. Images are checked for format and model support first.
- Answers can be handed off to Notes, Tasks, Build, or Automate.
- Requests like `open naver` or `close the browser` are handled as browser commands before any LLM call.
- Naming a skill turns it on, and it stays on in the same conversation until you stop it.

## Build

Tabs: Build · Settings · References · History

A request gets its own execution folder (`workspace/coding/runs/`) with generated files, run output, and validation results. Single, orchestration, and multi modes are available, and a rollback snapshot is taken from the workspace baseline before the run. Reopen past work from the **History** tab.

Build also handles requests like `open naver` or `close the browser` as browser commands before any coding run.

## Automate

Create routines in natural language and run them immediately or on a schedule (cron/interval). Results go to Telegram according to each routine's setting.

## Explore

Tabs: Web · Browser · Canvas · History

Web search, URL fetch, browser control, and canvas display in one screen. The browser opens in a fresh temporary context using the Playwright Chromium that setup installed.

## Review

The Safe Refactor screen. Follow the tabs in order: 1. Files → 2. Changes → 3. Check & apply. File state is re-checked right before apply.

## Projects · Tasks · Notes

| Screen | Tabs | Purpose |
|---|---|---|
| Projects | List · Add | Register and manage local projects (`~/.omnux/projects.json`) |
| Tasks | List · New plan | Plan create, review, approve, run |
| Notes | Log · Decisions · Checks · Memo · Handoff | Learnings, decisions, verification records, and handoff |

## Engine

| Screen | Tabs |
|---|---|
| Agents | Running · Flow · Shared log · Work folders · Record |
| Tools | All · Project · Global skills (`.omni/skills/`, `~/.omnux/skills/`) |
| Extensions | Hooks · Approvals · Rules · Plugins |
| Routing | Per-task routes · Recent choices · Local models |
| Rules | Logic graph list · Diagram · Properties · Run |

## Monitor

| Screen | Tabs |
|---|---|
| Activity | This session · Session timeline |
| Logs | Model calls · Diagnostics |
| Status | Connection · Checks · Jobs · Tools |

## Settings

Tabs: General · Integrations · Models & keys · Memory · About

The Models & keys tab manages per-provider model selection, integration keys, CLI auth, priority, and usage. The Memory tab handles notes and portable backup. The external-access toggle is also in Settings.

## Theme

Light (default), Glass, and Dark. Switch with the theme button in the top bar.
