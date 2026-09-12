# Usage

[한국어](../사용법_빠른시작.md) · [English](./usage.md)

Updated: 2026-09-12

What to press on each desktop screen. For install and run, see the [quickstart](./quickstart.md); for the bot, the [Telegram guide](./telegram-bot.md).

## Layout

Pick an area on the left rail, then a screen in the sub-panel. On narrow widths, open navigation with the top menu button. `⌘K` (`Ctrl+K` on Windows and Linux) opens the command palette.

| Area | Screens |
|---|---|
| Home | Home |
| Workspace | Ask, Build, Automate, Explore, Review |
| Projects | Projects, Tasks, Notes |
| Engine | Agents, Tools, Extensions, Routing, Rules |
| Monitor | Activity, Logs, Status |
| Settings | Settings |

## Home

Type a request straight into the input. The shortcuts below it (Automate, Logic, Skills, Plan, Notes) create new items, and **Continue work** and **Active projects** at the bottom take you back to recent work.

## Ask

Tabs: Chat · Models · References · History

- Modes are single, orchestration, and multi. Multi puts several provider answers side by side.
- Enter sends, Shift+Enter adds a line. Enter during Korean IME composition does not send.
- Attach files and images. Images are checked for format and model support first.
- Answers can be handed off to Notes, Tasks, Build, or Automate.
- Requests like "open naver" or "close the browser" run as browser commands before any LLM call.
- Naming a skill turns it on, and it stays on in that conversation until you stop it.

## Build

Tabs: Build · Settings · References · History

1. Describe what to build and press **만들기** (Build). `Cmd/Ctrl+Enter` also sends. Attach up to 6 files, 10MB total.
2. While it runs, **작업 중단** (Stop) halts it. You can type the next request in the meantime.
3. Read the summary, files, and program output. HTML opens with **미리 보기** (Preview).
4. **다시 실행하기** (Run again) re-runs the result with new input.
5. A stopped job comes back through **중단한 요청 이어 쓰기** (Resume stopped request), which restores the original request and model.

Model, language, and project name are under **모델과 작업 설정**; skills and notes under **스킬과 참고 노트**. Past builds reopen from **저장한 빌드** (Saved builds). Run folders live in `workspace/coding/runs/`.

Build also treats "open naver" or "close the browser" as browser commands before any coding run.

## Automate

Tabs: List · New automation (Edit) · Result

1. In **새 자동화** (New automation), set the task, frequency (daily/weekly/monthly), and time. Name, time zone, execution mode, retries, and Telegram notification are under **이름과 추가 설정**.
2. **자동화 저장** (Save) only stores the schedule. Use **지금 실행** (Run now) to run it immediately.
3. Selecting an automation shows its latest result. Earlier runs and raw records sit in the collapsed area.
4. **예약 끄기** (Turn off schedule) stops future runs. It does not cancel a run already in progress.

Telegram notification is off by default. Definitions live in `~/.omnux/routines.json`, results under `workspace/coding/routines/`.

## Explore

Tabs: Web · Browser · Canvas · History

Web search, URL fetch, browser control, and canvas display on one screen. The browser opens a fresh temporary context with the Playwright Chromium that setup installed, falling back to an installed Chrome. If it cannot start, it returns an error.

## Review

The Safe Refactor screen. Follow the tabs in order: 1. Files → 2. Changes → 3. Check and apply. File state is re-checked right before apply. Details are in [Safe Refactor](./safe-refactoring.md).

## Projects · Tasks · Notes

| Screen | Tabs | What it does |
|---|---|---|
| Projects | List · Add (Edit) | Register and manage local projects (`~/.omnux/projects.json`) |
| Tasks | List · New plan · Plan · Run · Result | Plan create, review, approve, run |
| Notes | Log · Decisions · Checks · Memo · Handoff | Decisions and verification records, and a handoff for the next session |

The Plan, Run, and Result tabs appear only when that state exists.

## Engine

| Screen | Tabs |
|---|---|
| Agents | Running · Flow · Shared log · Work folders · Record |
| Tools | All · Project · Global (`.omni/skills/`, `~/.omnux/skills/`) |
| Extensions | Hooks · Approvals · Rules · Plugins |
| Routing | Per-task routes · Recent choices · Local models |
| Rules | List · Diagram · Properties · Run |

## Monitor

| Screen | Tabs |
|---|---|
| Activity | This session · Session timeline |
| Logs | Model calls · Diagnostics |
| Status | Connection · Checks · Jobs · Tools |

In Status, **Checks > Environment diagnostics** shows Doctor results and repair, and **Tools > Cleanup** clears generated artifacts.

## Settings

Tabs: General · Models · Security · Integrations · Data · About

| Tab | What is in it |
|---|---|
| General | Display, start on launch, shortcuts, speech output, default project, user rules |
| Models | Model selection, API keys, CLI connections, priority, usage |
| Security | App authentication, remote access, permissions |
| Integrations | Telegram, cloud sync |
| Data | Memory notes, backup |
| About | Connection status, app info |

## Theme

Light (default), Glass, and Dark. Switch with the theme button in the top bar.
