# omnux Usage

[한국어](../사용법_빠른시작.md) · [English](./usage.md)

Updated: 2026-06-05

This document covers the most commonly used features in the desktop app and web dashboard. For Telegram bot slash commands, inline buttons, voice attachments, and multi-user allowlist, see the [Telegram Bot Guide](../텔레그램_봇_가이드.md).

For a fresh install or new environment, run `./scripts/omnux setup` first. It checks/installs dependencies, builds the middleware, runs `npm test`, and registers the launcher.

## Home

The Home screen is the dashboard starting point.

- **Active Projects**: Displays registered projects with a representative project highlighted.
- **Continue**: Jump directly to the most recent work item.
- **Recent Activity**: Runtime WebSocket event-based timeline.
- **Resource Usage**: CPU/memory/process cards based on `metrics`/`metrics_stream`.

## Ask (Chat)

![Chat tab](../assets/readme/dashboard-chat-tab.png)

The Ask screen switches between single model, orchestration, and multi-LLM comparison within the same view.

- **Single mode**: One model responds.
- **Orchestration mode**: Roles are split into planning, development, verification, and revision.
- **Multi mode**: Multiple providers/models respond simultaneously for comparison.
- **Markdown rendering**: Tables, code blocks, and links rendered via `react-markdown`.
- **Think+**: Reasoning mode toggle. Use for questions requiring deep analysis.
- **RAG preflight**: Analyzes input to recommend memory/code/web/session search candidates. User must explicitly execute.
- **Vision**: Select an image file to run Vision preflight. Checks provider candidates and readiness.
- **Token usage**: Per-conversation and per-message token usage with source (exact/estimated).
- **Adaptive Compression**: Backend auto-compresses long conversations. Shows compression system messages and linked memory.

Browser execution requests are handled directly from chat input. Phrases like "Open Naver", "Open github.com", "Close browser" are detected as browser intent before LLM invocation.

Naming a skill directly activates it, persisting until the user stops it. This works the same in Telegram. The last active skill auto-restores after middleware restart.

Multiple skill names in one message trigger a rejection. UI dropdown skill selection is overridden if the prompt explicitly names a different skill.

## Build (Coding)

![Coding tab](../assets/readme/dashboard-coding-tab.png)

The Build screen doesn't stop at model-generated files. It creates execution folders with files, commands, stdout/stderr, validation results, and recent-result snapshots.

- **Single coding**: One model implements and validates end-to-end.
- **Orchestration coding**: Roles split into planning, development, verification, and revision.
- **Multi coding**: Multiple providers/models run in independent folders for comparison.
- **Rollback**: Saves workspace baseline before coding execution. Creates rollback snapshot on changes. Restore by rollback ID.
- **Run latest result**: Re-execute a previous coding result.

Default execution folder: `workspace/coding/runs/<timestamp>-<mode>-<suffix>/`.

## Logic (Logic Graphs)

![Logic tab](../assets/readme/dashboard-logic-tab.png)

The Logic screen manages and executes `logic.graph.v1` graphs. Connect chat, coding, routine, and tool nodes to create flows.

- **Graph list**: Shows saved graphs.
- **Structure view**: Displays nodes (type/title/config) and edges (source→target) for the selected graph.
- **Execution**: Runs the graph and displays per-node status in the execution snapshot.
- **Save/Delete/Cancel**: Save, delete, or cancel a running graph.
- **Recovery candidates**: Query incomplete execution snapshots after middleware restart.

Execution results are stored under `workspace/.runtime/logic/`.

## Explore

The Explore screen provides web search, URL fetching, session management, and agent spawning.

- **Web search**: `web_search` → search results with provider badges.
- **URL fetch**: `web_fetch` → HTTP status, length, body content.
- **Sessions**: Session list/history, send follow-up messages to selected sessions.
- **Agent spawn**: Create new sessions with queue/active/breaker status display.
- **Browser/Canvas**: Browser status/start/stop and canvas show/hide.

## Automate (Routines)

![Routines tab](../assets/readme/dashboard-routines-tab.png)

The Automate screen provides routine CRUD and a creation wizard.

- **Routine list**: Shows registered routines with toggle status.
- **Execution**: Immediate or scheduled execution.
- **Creation wizard**: 3-step progressive disclosure (Request → Schedule → Advanced).
  - Request: Write routine content in natural language
  - Schedule: Set kind (immediate/cron/interval), time, days, dates
  - Advanced: Set runImmediately, notifyTelegram
- **Preview**: Check routine structure from the backend before creating.

Scheduled execution results are sent based on per-routine Telegram response settings.

## Projects

The Projects screen manages local project registration.

- **Project list**: Shows registered projects based on `projects_state`.
- **CRUD**: Create, update, delete projects.
- **Representative project**: Designate one project as representative.
- **Touch**: Update last-used timestamp when opening a project.

Project state is saved in `~/.omnux/projects.json`.

## Settings

![Settings tab](../assets/readme/dashboard-settings-tab.png)

The Settings screen has multiple tabs.

- **Memory & Backup**: Memory note list/search/rename/delete/clear, memory detail reads, FTS index rebuild, portable backup export/import preview/apply.
- **Models & Services**: Groq/Copilot model selection/apply/refresh, CLI adapter status, API key save/delete, Gemini tokens, Copilot Premium quota, Telegram Bot Token/Chat ID integration.
- **Memory search results**: Tier badges (working/short_term/episodic/long_term), source, line ranges.

Remote clients enter limited mode without OTP. Only read-oriented queries and model/routing settings are allowed.

## Operations

The Operations screen provides environment diagnostics, Git automation, and plan/task status.

- **Doctor / Environment diagnostics**: Check environment status via `doctor_get_last`, `doctor_run`, `doctor_fix_preview`. Shows ok/warn/fail/skip counts and per-check status. `doctor_fix_apply` is a hazardous operations command currently disabled.
- **Git Automation**: View branch, changed files, readiness/publish status via `git_automation_snapshot_get`. Request branch create, commit, push, PR creation previews via `git_operation_preview`. Apply after approval gate.
- **Plan / Task status**: `plan_list`, `task_graph_list` read-only summary cards.

## Activity

The Activity screen provides a runtime WebSocket event-based timeline and session replay.

- **Event timeline**: Real-time WS events in chronological order.
- **Session Replay**: Query conversation messages, LLM telemetry, and agent event timelines via `session_replay_get`. Shows summary and metadata only; full text is optionally viewable.

## Insights

The Insights screen provides various readiness and status snapshots.

- **Telemetry**: LLM call history by provider/model/status/token/time.
- **Semantic Search Readiness**: FTS/vector search status, embedding model candidates.
- **Local LLM Discovery**: Local endpoint (Ollama/LM Studio) latency, models, offline mode status.
- **Git Time Machine**: Repository status, checkpoint list, rollback candidates.
- **Commit Learning**: Recent commit metadata, intent rollup, file hotspots.
- **Self Improvement**: Backend-suggested improvements as cards.
- **MCP Servers**: Workspace MCP config file scan for discovered servers.
- **Terminal Readiness**: Shell/toolchain status.
- **Routing Policy**: Routing policy, recent decisions, local LLM readiness.

## Agents

The Agents screen provides agent bus, lifecycle, and multi-agent tracking.

- **Agent Bus**: Message history, shared board upsert, lifecycle event storage, group command message storage.
- **Multi-Agent Trace**: Project agent messages/board/lifecycle into visualization-ready structures.
- **Agent Watchdog**: Active run inventory with timeout/stale status.
- **Agent Worktree**: ACP spawn worktree list with clean/dirty/conflict status.

## Skills

![Skills tab](../assets/readme/dashboard-skills-tab.png)

Skills are read from `.omni/skills/**/SKILL.md` and `~/.omnux/skills/**/SKILL.md`. Activate/deactivate via the skill badge in chat/coding input.

## Routing

The Routing screen provides routing policy management and local LLM readiness.

- **Routing policy**: Query/save/reset the current provider fallback chain.
- **Recent decisions**: Category/request provider/result provider/decision time/reason shown as cards.
- **Local LLM**: Endpoint count, model count, offline mode status, readiness check.

## Command Palette

Press ⌘K to open the Command Palette for quick actions.

## Theme

Toggle between 3 themes via the top toolbar.

- **Glass** (default): Translucent backgrounds + backdrop-blur, pastel blobs
- **Light**: Clean off-white + subtle shadows
- **Dark**: Warm dark tones + indigo glow

## Mobile (Web Dashboard)

| Closed | Open |
|---|---|
| ![Mobile closed](../assets/readme/dashboard-mobile-closed-390x844.png) | ![Mobile open](../assets/readme/dashboard-mobile-composer-390x844.png.png) |

On mobile portrait, the composer is collapsed by default. Tap the keyboard button at the bottom right to open it, and tap the down arrow above the composer to close it.
