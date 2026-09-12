# Architecture

[한국어](../아키텍처_흐름.md) · [English](./architecture.md)

Updated: 2026-09-12

Small components tied together by WebSocket and a file-backed state store. The desktop app and the Telegram bot go through the same command layer.

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
| `apps/omnux-sandbox` | Python | Code execution sandbox. Memory and CPU limits, minimal environment |
| `workspace/` | — | Build, routine, logic, and task graph output |
| `~/.omnux` | JSON + Markdown | Settings, conversations, routines, plans, notebooks, and other persistent state |

## Request flow

1. A request comes from the desktop app or from Telegram.
2. The WebSocket gateway or the Telegram loop hands it to the same `CommandService`.
3. `CommandService` branches to a domain handler through `SlashCommandRouter`.
4. The handler delegates to that domain's ApplicationService.
5. When an LLM is needed, `LlmRouter` picks the provider and the fallback chain.
6. Results land in the conversation record, the run folder, the runtime log, and notebook documents.

## Command routing layer

Reflection-based DI is unavailable under `PublishAot=true`, so `Program.cs` assembles the handlers by hand.

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

Each handler depends on its own domain ApplicationService instead of `CommandService` private state.

### ApplicationService

Domain services live under `src/Application/`.

| Domain | Service | Responsibility |
|---|---|---|
| Coding | `CodingApplicationService` (partial) | Single, orchestration, and multi runs; verification; profiles |
| Routines | `RoutineApplicationService` (partial) | Creation, execution, scheduler, validation |
| Conversation | `ConversationApplicationService`, `ChatApplicationService` | CRUD, backup, compaction |
| Memory | `MemoryApplicationService` | Note CRUD and search |
| LLM control | `LlmControlApplicationService`, `LlmSettingsApplicationService` | Model and provider switching |
| Doctor | `DoctorApplicationService` | Environment diagnosis, fix preview |
| Planning / task graph | `PlanApplicationService`, `TaskGraphApplicationService` | Plan create, review, approve, run; graph execution |
| Notebooks | `NotebookApplicationService` | Learnings, decisions, verification, handoff |
| Refactor | `RefactorApplicationService` | Safe Refactor |
| Extensions | `Application/Extensions/` | Hooks, plugins, rules |
| Others | `Agents`, `Projects`, `Telemetry`, `GitAutomation`, `SessionReplay`, `SemanticSearch`, `Mcp`, `Terminal`, `Rag`, `LocalLlm`, `ClipboardVision` | Agent communication, projects, usage telemetry, git automation, session replay, semantic search, MCP, terminal, RAG, local models, clipboard vision |

### WebSocket dispatchers

31 `Ws*CommandDispatcher` types handle WebSocket commands per domain. Every desktop request passes through this layer.

### Policy classes

`CommandService` and `LlmRouter` are entry points. Decisions, parsing, and prompt assembly move into unit-testable policy classes; there are currently 100 `*Policy` types.

| Area | Representative policies |
|---|---|
| Search | `SearchQueryPolicy`, `SearchUrlContextPolicy`, `SearchPromptPolicy`, `SearchAnswerFormatterPolicy` |
| Coding | `CodingLanguagePolicy`, `CodingPromptPolicy`, `CodingFallbackPolicy`, `CodingExecutionSafetyPolicy`, `CodingTaskSignalPolicy` |
| Conversation and Telegram | `ChatRetryGuardPolicy`, `AssistantReplyPolicy`, `TelegramNaturalCommandPolicy`, `TelegramResponseFormatterPolicy` |
| Routines and logic | `RoutineSchedulePolicy`, `LogicGraphValidationPolicy`, `LogicTemplateResolver`, `LogicLeafNodeExecutor` |
| Providers | `OpenAiCompatibleProtocol`, `ProviderResponseParser`, `GeminiCitationParser`, `GroqRateLimitHeaderParser`, `ProviderTimeoutPolicy` |
| Others | `RemoteLimitedMessagePolicy`, `UniversalCodeExecutionSafetyPolicy`, `AdaptiveContextCompressionPolicy`, `PromptCachePolicy`, `RagRetrievalPreflightPolicy`, `MemoryTierPolicy` |

Policies carry unit tests in `apps/omnux-middleware-tests`, and `scripts/check-security-boundaries.mjs` verifies the contract.

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

1. React opens a `ws://127.0.0.1:41880/ws/` session through `use-middleware-session`.
2. Server messages go through `desktop-message-gateway` into screen stores.
3. Screens hand UI input to the gateway. Field-name translation and the allowed request list belong to the gateway, and screens hold no business logic.

Design rules:

- Use the Tailwind CSS v4 semantic tokens. Themes are Light (default), Glass, and Dark.
- Use a custom Dialog instead of `window.alert`, `window.confirm`, or `window.prompt`.
- Render with `react-markdown` instead of `dangerouslySetInnerHTML`.

### Desktop shell boundary

The Tauri Rust shell owns the app shell only.

- Allowed: window management, start on launch, media info, .NET middleware bootstrap (`dotnet run` in dev, sidecar in release)
- Not allowed: LLM, coding, routines, refactor, logic, routing, direct `~/.omnux` access, direct provider or API calls

## Safety boundaries

- Secrets are split across environment variables, `*_FILE`, the secure store (`~/.config/omnux/secrets.json`, 0600), and the macOS Keychain.
- Remote clients enter limited mode without an OTP request, and still pass the WebSocket message allowlist.
- WebSocket enforces an Origin check, a pre-auth message allowlist, a command rate limit, and a 16MB message cap by default.
- `/api/local-image` serves only routine asset paths. Attachments over the count or size limit are rejected.
- Static files served by the middleware go out byte for byte, and conditional requests based on `ETag`/`Last-Modified` get `304 Not Modified`.
- Markdown rendering disables raw HTML.
- Safe Refactor re-checks file state right before apply and leaves a rollback snapshot. Agent spawn jobs also leave a workspace rollback snapshot when they change files.
- JSON state writes take a per-file `.lock` lease and replace atomically. The previous valid file stays as `.bak`.
- Coding runs get one folder each. Local code execution opens only when `OMNUX_ENABLE_DYNAMIC_CODE=true`. The shell is whichever of zsh, bash, or sh is present, in that order.
- The Python sandbox limits locally trusted code. It is not an OS-level security sandbox.

## Remote limited mode permissions

| Group | State | Contents |
|---|---|---|
| Read | Allowed | Settings state, conversation list and detail, memory note list/read/search, context/skills/commands lists, notebooks, project list |
| Models and routing | Partly allowed | Routing policy read/save/reset, last routing decision, model list, model selection |
| Execution | Blocked | Chat, coding, routine, and logic graph runs; task graph runs; refactor apply; tool execution |
| Authentication | Blocked | OTP request, stored token resume, Copilot/Codex CLI auth state, login, logout |
| Secret settings | Blocked | Telegram credential save/delete/test, LLM API key save/delete |
| Remote access setting | Blocked | Changing the remote access toggle |
