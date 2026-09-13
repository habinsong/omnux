# Architecture

[한국어](../아키텍처_흐름.md) · [English](./architecture.md)

Updated: 2026-09-12

Subsystems communicate via WebSocket and HTTP, while system state is persisted in local files. Both the desktop app and the Telegram bot route commands through a unified `CommandService` layer.

```mermaid
flowchart LR
  User[User] --> Desktop[Desktop app<br/>Tauri + React]
  User --> Telegram[Telegram bot]
  Desktop --> WS[WebSocket Gateway]
  Telegram --> Command[CommandService]
  WS --> Command
  Command --> Router[LLM Router]
  Router --> Gemini[Gemini]
  Router --> Groq[Groq]
  Router --> Nvidia[NVIDIA NIM]
  Router --> Cerebras[Cerebras]
  Router --> Copilot[Copilot CLI]
  Router --> Codex[Codex]
  Router --> Grok[Grok CLI]
  Command --> State[~/.omnux]
  Command --> Workspace[workspace/]
  Command --> Sandbox[Python sandbox]
```

## Components

| Location | Stack | Responsibility |
|---|---|---|
| `apps/omnux-middleware` | .NET 9, AOT | WebSocket/HTTP server, Telegram, routing, state, metrics, guarded kill, domain orchestration |
| `apps/desktop` | Tauri v2 + React 19 + TypeScript + Tailwind CSS v4 | Desktop frontend. Zustand state, 6 areas and 18 screens, 3 themes |
| `apps/omnux-sandbox` | Python | Code execution sandbox. Memory and CPU limits, minimal environment isolation |
| `workspace/` | — | Build, routine, logic, and task graph output repository |
| `~/.omnux` | JSON + Markdown | Settings, conversations, routines, plans, notebooks, and persistent state storage |

## Request flow

1. Requests originate from the desktop UI (WebSocket) or the Telegram update loop.
2. The gateway normalizes input and routes it to the unified `CommandService`.
3. `CommandService` inspects the command prefix or intent via `SlashCommandRouter` to dispatch to the appropriate domain handler.
4. Handlers delegate domain operations to decoupled `ApplicationService` implementations.
5. If generative inference is needed, `LlmRouter` determines the provider and fallback chain.
6. Execution outputs are persisted in conversation stores, workspace run directories, logs, and notebook records.

## Command routing layer

Under native AOT compilation (`PublishAot=true`), runtime reflection-based dependency injection is unavailable; `Program.cs` explicitly constructs the handler and service graph at startup.

```text
ExecuteNormalizedCommandRoutingAsync (router)
  → SlashCommandRouter.TryHandleAsync(ctx)
      → StaticSlashCommandHandler          (static help/usage)
      → DoctorSlashCommandHandler
      → NotebookSlashCommandHandler
      → HandoffSlashCommandHandler
      → PlanSlashCommandHandler
      → TaskSlashCommandHandler
      → MemorySlashCommandHandler
      → ChannelSettingsSlashCommandHandler  (/talk, /code, /profile, /mode, …)
      → LlmControlSlashCommandHandler       (/llm)
      → CoreRuntimeSlashCommandHandler      (/metrics, /kill)
      → RoutineSlashCommandHandler
      → CodingSlashCommandHandler
  → (miss) non-slash natural language / Telegram chat and intent fallback
```

Each handler depends directly on its domain `ApplicationService`, keeping domain boundaries clean.

### ApplicationService

Domain services live under `src/Application/`.

| Domain | Service | Responsibility |
|---|---|---|
| Coding | `CodingApplicationService` (partial) | Single, orchestration, and multi runs; verification; profiles |
| Routines | `RoutineApplicationService` (partial) | Creation, execution, scheduler, validation |
| Conversation | `ConversationApplicationService`, `ChatApplicationService` | Session management, backups, context compaction |
| Memory | `MemoryApplicationService` | Note management and full-text search |
| LLM control | `LlmControlApplicationService`, `LlmSettingsApplicationService` | Model and provider routing |
| Doctor | `DoctorApplicationService` | Diagnostics and environment fix previews |
| Planning / task graph | `PlanApplicationService`, `TaskGraphApplicationService` | Plan creation, reviews, approvals, and graph execution |
| Notebooks | `NotebookApplicationService` | Learnings, decisions, verification records, handoffs |
| Refactor | `RefactorApplicationService` | Safe Refactor pipelines |
| Extensions | `Application/Extensions/` | Hooks, plugins, rules |
| Others | `Agents`, `Projects`, `Telemetry`, `GitAutomation`, `SessionReplay`, `SemanticSearch`, `Mcp`, `Terminal`, `Rag`, `LocalLlm`, `ClipboardVision` | Agent messaging, projects, usage telemetry, git automation, session replay, semantic search, MCP, terminal, RAG, local models, clipboard vision |

### WebSocket dispatchers

31 `Ws*CommandDispatcher` types handle WebSocket commands per domain. Every desktop client request passes through this dispatcher layer.

### Policy classes

`CommandService` and `LlmRouter` serve as architectural entry points. Core decisions, parsing, and prompt assembly are factored into unit-testable policy classes; there are currently 100 `*Policy` types.

| Area | Representative policies |
|---|---|
| Search | `SearchQueryPolicy`, `SearchUrlContextPolicy`, `SearchPromptPolicy`, `SearchAnswerFormatterPolicy` |
| Coding | `CodingLanguagePolicy`, `CodingPromptPolicy`, `CodingFallbackPolicy`, `CodingExecutionSafetyPolicy`, `CodingTaskSignalPolicy` |
| Conversation and Telegram | `ChatRetryGuardPolicy`, `AssistantReplyPolicy`, `TelegramNaturalCommandPolicy`, `TelegramResponseFormatterPolicy` |
| Routines and logic | `RoutineSchedulePolicy`, `LogicGraphValidationPolicy`, `LogicTemplateResolver`, `LogicLeafNodeExecutor` |
| Providers | `OpenAiCompatibleProtocol`, `ProviderResponseParser`, `GeminiCitationParser`, `ProviderRateLimitHeaderParser`, `ProviderTimeoutPolicy` |
| Others | `RemoteLimitedMessagePolicy`, `UniversalCodeExecutionSafetyPolicy`, `AdaptiveContextCompressionPolicy`, `PromptCachePolicy`, `RagRetrievalPreflightPolicy`, `MemoryTierPolicy` |

Policies are thoroughly covered by unit tests in `apps/omnux-middleware-tests`, and verified by `scripts/check-security-boundaries.mjs`.

## Desktop frontend

```text
src/
  App.tsx                   — screen registry
  shell-store.ts            — shell global state (auth, connection, logs)
  middleware-contract.ts    — middleware port and WS address contract
  use-middleware-session.ts — WS session bridge
  features/
    shell/                  — rail, sub-panel, top bar, command palette, area definitions (nav-areas.ts)
    middleware/             — WS gateway helpers such as desktop-message-gateway
    chat-workspace/         — Ask
    build-workspace/        — Build
    automation-workspace/   — Automate
    explore-workspace/      — Explore
    task-workspace/         — Tasks
    ...                     — one directory per screen
  components/               — ui/primitives, screen, capsule
```

1. React initiates a `ws://127.0.0.1:41880/ws/` connection via `use-middleware-session`.
2. Inbound messages pass through `desktop-message-gateway` to update feature stores.
3. Screens submit UI events to the gateway. Payload transformation and request filtering remain in the gateway layer; screens contain no business logic.

Design rules:

- Use Tailwind CSS v4 semantic tokens. Themes are Light (default), Glass, and Dark.
- Use a custom Dialog instead of `window.alert`, `window.confirm`, or `window.prompt`.
- Render with `react-markdown` instead of `dangerouslySetInnerHTML`.

### Desktop shell boundary

The Tauri Rust shell owns the app shell only.

- Allowed: window management, start on launch, media controls, .NET middleware bootstrap (`dotnet run` in dev, sidecar in release)
- Not allowed: LLM calls, coding execution, routines, refactoring, logic graphs, routing, direct `~/.omnux` filesystem access, direct provider/API calls

## Safety boundaries

- Secrets are partitioned across environment variables, `*_FILE`, the encrypted store (`~/.config/omnux/secrets.json`, 0600), and the macOS Keychain.
- Remote clients connect in limited mode without OTP prompts and remain restricted by the WebSocket message allowlist.
- WebSocket enforces Origin checks, pre-auth message filtering, command rate limiting, and a default 16MB message ceiling.
- `/api/local-image` serves only verified routine asset paths. Attachments exceeding count or size limits are rejected.
- The middleware serves static files byte-for-byte, returning `304 Not Modified` for matching `ETag`/`Last-Modified` conditional requests.
- Markdown rendering explicitly disables raw HTML parsing.
- Safe Refactor re-verifies file state immediately before applying patches and retains a rollback snapshot. Agent spawning similarly creates workspace snapshots upon file edits.
- JSON state writes acquire a per-file `.lock` lease and replace files atomically, retaining valid previous versions as `.bak`.
- Coding runs execute in isolated per-run directories. Local execution requires `OMNUX_ENABLE_DYNAMIC_CODE=true`. The system shell is selected in zsh → bash → sh priority order.
- The Python sandbox restricts locally trusted execution; it does not replace OS-level kernel virtualization.

## Remote limited mode permissions

| Group | State | Contents |
|---|---|---|
| Read | Allowed | Settings state, conversation list and detail, memory note list/read/search, context/skills/commands lists, notebooks, project list |
| Models and routing | Partly allowed | Routing policy read/save/reset, last routing decision, model list, model selection |
| Execution | Blocked | Chat, coding, routine, and logic graph runs; task graph runs; refactor apply; tool execution |
| Authentication | Blocked | OTP request, stored token resume, Copilot/Codex CLI auth state, login, logout |
| Secret settings | Blocked | Telegram credential save/delete/test, LLM API key save/delete |
| Remote access setting | Blocked | Changing the remote access toggle |
