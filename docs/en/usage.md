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

1. Describe what to build and press **만들기** (Build). Cmd/Ctrl+Enter also sends. Attach up to 6 files, 10MB total.
2. While it runs, **작업 중단** (Stop) halts it. You can type the next request in the meantime.
3. Read the summary, files, and program output. HTML opens with **미리 보기** (Preview).
4. **다시 실행하기** (Run again) re-runs the result with new input.
5. A stopped job comes back with **중단한 요청 이어 쓰기** (Resume stopped request), restoring the original request and model.

Model, language, and project name live in **모델과 작업 설정**; skills and notes in **스킬과 참고 노트**. Reopen past builds from **저장한 빌드** (Saved builds). Run folders are under `workspace/coding/runs/`.

Build also handles requests like `open naver` or `close the browser` as browser commands before any coding run.

## Automate

1. In **새 자동화** (New automation), set the task, frequency (daily/weekly/monthly), and time. Name, time zone, execution mode, retries, and Telegram notification are under **이름과 추가 설정**.
2. **자동화 저장** (Save) only saves the schedule. Use **지금 실행** (Run now) to run it right away.
3. Selecting an automation shows its latest result. Earlier runs and raw records are in the collapsed area.
4. **예약 끄기** (Turn off schedule) stops future runs. It does not cancel a run that already started.

Telegram notification is off by default. Definitions live in `~/.omnux/routines.json`, results under `workspace/coding/routines/`.

## Explore

Tabs: Web · Browser · Canvas · History

Web search, URL fetch, browser control, and canvas display in one screen. The browser opens in a fresh temporary context with the Playwright Chromium that setup installed, falling back to an installed Chrome. If neither can start, it returns an error instead of a fake success.

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

In Status, **Checks > Environment diagnostics** shows Doctor results and fixes, and **Tools > Cleanup** clears generated artifacts.

## Settings

Tabs: General · Integrations · Models & keys · Memory · About

The Models & keys tab manages per-provider model selection, integration keys, CLI auth, priority, and usage. The Memory tab handles notes, **메모리 비우기** (Clear memory), and portable backup. The external-access toggle is also in Settings.

## Theme

Light (default), Glass, and Dark. Switch with the theme button in the top bar.
