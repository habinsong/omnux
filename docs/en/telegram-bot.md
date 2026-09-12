# Telegram Bot Guide

[한국어](../텔레그램_봇_가이드.md) · [English](./telegram-bot.md)

Updated: 2026-09-12

The desktop Ask screen and the Telegram bot share one command layer, `CommandService`. Below are the slash commands you reach for most, the natural-language flow, attachments, inline keyboards, and mobile handoff.

## Message flow

```text
User input
  ├─ voice → automatic STT (transcript echo)
  ├─ photo → vision analysis
  ├─ document or file → the model reads it directly
  └─ text → slash command / natural language / skill alias routing
       │
       ▼
Response
  ├─ body (Markdown converted safely for Telegram, chunked with code fences intact)
  ├─ over 9000 characters or more than 5 chunks → switches to a .txt attachment
  ├─ large coding result, diff, log, file, task output, doctor JSON → mobile summary + handoff
  └─ footer: provider·model · 🎯 active skill · ⏱ elapsed
       │
       ▼
inline keyboard (attached only to the command responses that use one)
  /skill status → [🚫 off] [📋 list]
  /think status, /web status → [✅ on] or [🚫 off]
  /llm status → [Groq] [Gemini] [Cerebras] [NVIDIA NIM] [Copilot] [Codex] [Grok]
  /coding files → [⬇️ 1] [⬇️ 2] [⬇️ 3]
```

## Slash commands

### Skills

| Command | What it does | Example |
|---|---|---|
| `/skill list` | List registered skills | — |
| `/skill use <name> [scope]` | Activate a skill. Scope is `project` or `global` | `/skill use eli5` |
| `/skill status` | Current active skill and an off button | — |
| `/skill off` (= `/off`) | Deactivate the active skill | — |
| `/skill get <name>` | Preview the skill body | `/skill get casual-empathy` |
| `/skill create <name> [scope]` | Register a new skill; the body starts on the next line | — |
| `/skill quick <alias> <skill>` | Register a short alias | `/skill quick e eli5` |
| `/skill quick list` | List registered aliases | — |
| `/skill quick remove <alias>` | Remove an alias | `/skill quick remove e` |
| `/<alias> [question]` | Call by alias | `/e how does a digital camera work` |

After registering an alias, `/<alias> question` is rewritten internally as the natural-language form "use the `<skill>` skill and answer `<question>`".

### Mode and model

| Command | What it does |
|---|---|
| `/llm status` | Current provider and model, with quick-switch buttons |
| `/llm single provider <name>` | Switch the single-chat provider |
| `/llm models [target]` | List available models |
| `/llm usage` | Quota usage |
| `/talk [low or high]` | Chat thinking level |
| `/code [low or high]` | Coding thinking level |
| `/think on`, `/think off`, `/think status` | Reasoning mode (Think+) |
| `/web on`, `/web off`, `/web status` | Web search context |
| `/history [N]` (= `/log [N]`) | Summary of the last N conversations. 1–20, default 5 |

### Coding

| Command | What it does |
|---|---|
| `/coding status` | Mode, provider, and model |
| `/coding mode <single or orchestration or multi>` | Switch mode |
| `/coding run <requirement>` | Run coding right away |
| `/coding last` | Show the last result |
| `/coding files` | Changed file list with quick download buttons |
| `/coding file <number or path>` | Preview a file. Text is cut at roughly 2.6KB |
| `/coding download <number or path>` | Download as a .txt attachment, up to 8MB |

### Everything else

| Command | What it does |
|---|---|
| `/help [topic]` | Main and per-topic help |
| `/doctor` | Environment diagnosis |
| `/refactor read`, `/refactor preview`, `/refactor apply` | Safe Refactor |
| `/routine list`, `/routine create`, `/routine run`, and more | Routine management |
| `/plan list`, `/plan create`, `/plan review`, `/plan approve`, `/plan run` | Work plans |
| `/task list`, `/task status`, `/task run`, and more | Task graphs |
| `/notebook show`, `/notebook append <kind> <text>` | Notebooks |
| `/handoff [project-key]` | Write a document to continue from the Handoff tab of the desktop Notes screen |
| `/memory clear`, `/memory create [compact]` | Memory |

## Natural language

Plain Korean without a slash does the same thing.

```text
"단일 모드로 바꿔"              switch to single mode
"Codex로 바꿔"                  switch to Codex
"최근 코딩 결과 보여줘"          show the last coding result
"casual-empathy 스킬 사용해"     use the casual-empathy skill
"스킬 해제"                     stop the skill
"추론 모드 켜" / "추론 모드 꺼"   reasoning mode on / off
"환경 진단해줘"                  run the environment diagnosis
"루틴 목록 보여줘"               list routines
```

## Attachments

| Attachment | What happens |
|---|---|
| 🎙️ Voice | With `SttBaseUrl`, `SttModel`, and `SttApiKey` set, it is transcribed, echoed back as "🎙️ 들은 내용: …", then sent to the LLM |
| 🖼️ Photo | Analyzed with a vision model. Without a caption, the bot explains what it needs |
| 📎 Document, PDF, code | The model reads the body directly to summarize and analyze |

The transcript echo exists so that a misheard phrase is obvious right away and you can say it again.

## Inline keyboards

Responses to `/skill status`, `/think status`, `/web status`, `/llm status`, and `/coding files` carry a row of buttons. Pressing one runs the next command on the spot.

How it works:

1. The bot passes `allowed_updates=[message, callback_query]` to `getUpdates`.
2. Pressing a button delivers a `callback_query`.
3. `answerCallbackQuery` clears the spinner.
4. The `callback_data` flows into `ExecuteAsync` as if it were new user input.

Handlers append the button row with a `__TG_BUTTONS__` marker, and `TelegramUpdateLoop` parses that marker into `reply_markup`.

## Mobile handoff rules

Telegram is closer to notifications and triggers. Long coding results, large diffs, logs, file bodies, task output, and doctor JSON are hard to read on a phone, so their bodies are not expanded there.

Telegram shows only this:

- A short summary and a leading preview
- Identifiers such as the target file, graph and task id, or doctor scope
- The command to send next: `/coding files`, `/coding download <number>`, `/task status`, `/task output`, `/handoff`
- A handoff marker: `telegram_command_output_handoff` or `telegram_heavy_output_handoff`

Per command:

| Path | Mobile handling |
|---|---|
| Large coding result | Summary, then pointers to `/coding files`, `/coding download <number>`, `/handoff` |
| A large file from `/coding file` | Short preview only; the whole file comes from `/coding download` or the desktop |
| A large diff from `/refactor preview` | Summary and handoff instead of the full diff |
| Large stdout, stderr, or result from `/task output` | Task id and a short preview, with `/task status` and `/handoff` |
| Large JSON from `/doctor json` | Summary and handoff instead of the whole JSON |
| `/handoff [project-key]` | Writes `~/.omnux/notebooks/<project-key>/handoff.md` and points at the Handoff tab of the desktop Notes screen |

What local policy tests cover for `/coding download <number>`:

- `TelegramCodingDownloadPolicy` and `TelegramCodingDownloadPolicyTests` pick the download target only from the changed file list.
- Selection by 1-based number and by a changed file's relative path is allowed.
- Any path outside the changed file list is rejected.
- Sibling prefixes such as `/tmp/run` and `/tmp/run2` are not mistaken for the same run directory.
- Attachment file names are sanitized, with a fallback name when there is none.
- The Telegram document attachment cap is fixed at 8MB.
- `TelegramClientTests` uses fake HTTP, with no real Telegram server, to check the `sendDocument` multipart endpoint, `chat_id`, caption, document body, and file name.
- With no Telegram token or chat id, no `sendDocument` request goes out at all.

On deep links: there is no separate desktop deep link protocol for now. A `/handoff` response does not build an `omnux://` link; it shows the local `handoff.md` path and points at the Handoff tab in the desktop Notes screen. Once desktop routing and the app protocol are settled in Phase 5, deep links get reconsidered as separate work.

## Live mobile QA checklist

This needs a real bot token, chat id, allowed user id, and a mobile Telegram client. Local unit tests and contract checks only cover policy regressions.

Pause the running middleware's Telegram polling loop, then run this. The command never prints token values; it reads `OMNUX_TELEGRAM_BOT_TOKEN` and `OMNUX_TELEGRAM_CHAT_ID`, then the `*_FILE` variants, then the default macOS Keychain entries, in that order.

```bash
node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180
```

It passes only when all four values are `true`.

| Value | Meaning |
|---|---|
| `outboundMessageOk` | A real Telegram `sendMessage` succeeded |
| `outboundDocumentOk` | A real Telegram `sendDocument` succeeded |
| `inboundTextAckOk` | A `/omniqa-ok <QA-ID>` reply arrived from the phone |
| `inboundDocumentEchoOk` | The `.txt` attachment received on the phone was uploaded back, and the echoed document body carries the same `QA-ID` |

Check these by hand:

1. Sending `/help handoff` or `/handoff` from the phone shows the desktop handoff guidance and the local `handoff.md` path.
2. A large coding result is narrowed to `/coding files`, `/coding download <number>`, and `/handoff` instead of being expanded in full.
3. `/coding download <number>` arrives as a real file attachment. Live QA decides this from `sendDocument` success and the `QA-ID` in the echoed body.
4. Large output from `/refactor preview`, `/task output`, and `/doctor json` shows only a short preview with the `telegram_command_output_handoff` marker.
5. The no-deep-link policy holds: no `omnux://` link in any Telegram response, and the Handoff tab is reachable by hand in the desktop Notes screen.

## Multi-user allowlist

By default only the single chat named by `OMNUX_TELEGRAM_CHAT_ID` is served. To open the bot to several people, list user ids in `OMNUX_TELEGRAM_ALLOWED_USER_ID`, separated by commas, semicolons, or spaces.

```bash
export OMNUX_TELEGRAM_ALLOWED_USER_ID="123456789,234567890,345678901"
```

A call from anyone else leaves one stderr line (`reason=user_id_not_in_allowlist chat=… from=… text=…`) and sends no response.

## Response footer

One line goes under every response body.

```text
— gemini·flash · 🎯 eli5 · ⏱ 4.7s
```

- provider·model: which model answered
- 🎯 active skill: shown when a skill applied to this response
- ⏱ elapsed: from the start of the turn to the finished response. Under a second it is omitted

## Cut-off responses

When a stream ends early on a timeout, a quota, or an error, this line is appended to the body.

```text
⚠️ [provider 응답이 도중에 끊겼습니다 — timeout. 다시 시도해 주세요.]
```

The partial response still shows, and the truncation is immediately visible.

## Multiple skills are rejected

Two or more skill names in one message are rejected like this.

```text
한 번에 한 개의 스킬만 사용할 수 있어요.
지금 입력에서 스킬 이름이 2개 발견됐습니다: `eli5`, `casual-chat`
사용할 스킬 하나만 남기고 다시 보내 주세요.
```

Skill name matching is word-boundary based, so a short name like `ai` does not match inside `aim`.

## The active skill persists

A skill turned on by `/skill use eli5` or in natural language is stored on disk as `ConversationThread.ActiveSkillName`. A middleware restart brings the last active skill back, applying from the next message.

With a skill active, a question needing a URL or web search still does not bypass the skill instructions on the fast web path. Web context attaches during shared input preparation, while output format and tone follow the active skill.

`/skill create` does not overwrite an existing skill. A name collision returns a save-failure message, so edit existing skills on the desktop Tools screen.

## Examples

`/history`

```text
User: /history 3

📜 최근 대화 3개:

#1 · 03-04 14:22
🙂 디지털 카메라 어떻게 작동해?
🤖 디지털 카메라는 빛을 디지털 신호로 변환…

#2 · 03-04 14:18
🙂 mlx로 gemma e4b 돌릴 수 있어?
🤖 M2 24GB 환경에서 4-bit 양자화로 충분히…
```

`/coding download`

```text
User: /coding files
🤖 [최근 코딩 파일]
   대화: Telegram 연동 대화
   1. src/App.tsx
   2. src/api.ts
   3. test/App.test.tsx
   ...
   [⬇️ 1] [⬇️ 2] [⬇️ 3]   ← inline buttons

User: (taps ⬇️ 1)
🤖 (📎 attached: src/App.tsx | 12,345 bytes)
   ✅ 첨부로 보냈습니다.
```
