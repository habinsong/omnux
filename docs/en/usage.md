# Usage

[한국어](../사용법_빠른시작.md) · [English](./usage.md)

Updated: 2026-09-12

Operational guide for each desktop view. For installation and bootstrap, see the [quickstart](./quickstart.md); for remote bot integration, see the [Telegram guide](./telegram-bot.md).

## Layout

Select an operational area on the left rail, then choose a view in the sub-panel. In compact viewports, open the navigation drawer using the top menu toggle. Press `⌘K` (`Ctrl+K` on Windows and Linux) to summon the command palette.

| Area | Screens |
|---|---|
| Home | Home |
| Workspace | Ask, Build, Automate, Explore, Review |
| Projects | Projects, Tasks, Notes |
| Engine | Agents, Tools, Extensions, Routing, Rules |
| Monitor | Activity, Logs, Status |
| Settings | Settings |

## Home

Enter prompts directly into the central input box. Shortcut buttons (Automate, Logic, Skills, Plan, Notes) initialize workflows, while **Continue work** and **Active projects** restore recent workspace contexts.

## Ask

Tabs: Chat · Models · References · History

- Supported modes: single, orchestration, and multi. Multi-mode places side-by-side responses from multiple providers for direct comparison.
- `Enter` sends the message; `Shift+Enter` inserts a newline. IME composition states do not trigger premature dispatch.
- Drag-and-drop attachments for files and images. Multimodal capabilities are verified before dispatching image payloads.
- Answers can be transferred to Notes, Tasks, Build, or Automate with a single click.
- Natural intents such as "open naver" or "close the browser" execute immediately as browser tool actions prior to LLM invocation.
- Mentioning a skill name toggles that skill on, persisting across turns in that conversation until deactivated.

## Build

Tabs: Build · Settings · References · History

1. Enter task requirements and select **만들기** (Build), or press `Cmd/Ctrl+Enter`. Attach up to 6 files (10MB total ceiling).
2. During execution, click **작업 중단** (Stop) to halt the process. Subsequent prompts can be queued in advance.
3. Review generated code, summary metrics, and standard console output. Render HTML deliverables via **미리 보기** (Preview).
4. Select **다시 실행하기** (Run again) to modify inputs and re-execute.
5. Use **중단한 요청 이어 쓰기** (Resume stopped request) to restore aborted prompts and model parameters.

Configure models, target language, and project scopes under **모델과 작업 설정**. Select skills and contextual references under **스킬과 참고 노트**. Access previous run histories via **저장한 빌드** (Saved builds). Run artifacts persist under `workspace/coding/runs/`.

Build also routes natural requests such as "open naver" or "close the browser" as browser commands before launching code synthesis.

## Automate

Tabs: List · New automation (Edit) · Result

1. Under **새 자동화** (New automation), define target tasks, recurrence intervals (daily/weekly/monthly), and scheduled trigger times. Routine labels, timezones, execution modes, retry budgets, and Telegram notifications are configured in **이름과 추가 설정**.
2. **자동화 저장** (Save) registers schedule metadata. Select **지금 실행** (Run now) for immediate verification.
3. Selecting an automation displays recent execution logs; full historical archives are available in the expandable drawer.
4. **예약 끄기** (Turn off schedule) suspends upcoming triggers without interrupting active executions.

Telegram notifications are disabled by default. Definitions persist in `~/.omnux/routines.json`, while run artifacts reside in `workspace/coding/routines/`.

## Explore

Tabs: Web · Browser · Canvas · History

Combines web search, URL content extraction, browser automation, and interactive canvas rendering in a single screen. Browser sessions initialize in isolated temporary contexts using the provisioned Playwright Chromium, with system Chrome as fallback. Clear diagnostics are reported if runtime requirements fail.

## Review

The Safe Refactor screen. Follow the tabs in order: 1. Files → 2. Changes → 3. Check and apply. File state is re-checked right before apply. Details are in [Safe Refactor](./safe-refactoring.md).

## Projects · Tasks · Notes

| Screen | Tabs | What it does |
|---|---|---|
| Projects | List · Add (Edit) | Register and manage local projects (`~/.omnux/projects.json`) |
| Tasks | List · New plan · Plan · Run · Result | Create, review, approve, and run plans |
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
