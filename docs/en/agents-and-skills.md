# AGENTS / Skills / Commands

[한국어](../AGENTS_AND_SKILLS.md) · [English](./agents-and-skills.md)

Updated: 2026-09-12

omnux reads project instructions and skills as runtime context. Instructions that should always apply go into AGENTS; workflows you enable when needed go into a skill.

Skills behave the same in the desktop app and the Telegram bot. Turn them on and off with the skill badge in the chat input or with slash commands.

## Read order

1. `~/.omnux/AGENTS.md`
2. `AGENTS.override.md` and `AGENTS.md` in every directory between the project root and the current working directory
3. Fallback documents: `TEAM_GUIDE.md` and `.agents.md` by default (changed with `OMNUX_PROJECT_CONTEXT_FALLBACK_FILENAMES`)
4. Project skills: `.omni/skills/**/SKILL.md`
5. Global skills: `~/.omnux/skills/**/SKILL.md`
6. Project commands: `.omni/commands/*.md`
7. Global commands: `~/.omnux/commands/*.md`

## How skills behave

- Skill files are not injected into every request by default.
- A skill activates when you name it or ask for it.
- The active skill stays on for that thread and is stored on disk in `ConversationThread.ActiveSkillName`. A middleware restart restores the last active skill.
- Stop it with "스킬 중지", "일반 대화로 돌아가", `/skill off`, or `/off`.
- Turning off the skill badge in the Ask or Build input clears both the UI selection and the sticky skill stored on the server.
- The Ask screen and the Telegram bot use the same detection, activation, and stop flow.
- Skill name matching is word-boundary based, so a short name like `ai` or `doc` does not match inside an ordinary English word.
- With a skill active, the URL and web-search fast paths still go through the shared input preparation path.
- A project skill wins over a global skill with the same name.

### Multiple skills are rejected

When two or more skill names appear in one input, the request is rejected right away.

```text
한 번에 한 개의 스킬만 사용할 수 있어요.
지금 입력에서 스킬 이름이 2개 발견됐습니다: `eli5`, `casual-chat`
사용할 스킬 하나만 남기고 다시 보내 주세요.
```

Ask, Build, and Telegram behave identically.

### Automatic single-skill swap

If a skill is already active and you name a different one, the previous skill ends and only the new one applies. A `[Skill Switched: old → new]` note goes into the LLM input so the model does not carry the previous skill's tone and rules forward.

### When the dropdown and the prompt disagree

If you pick a skill in the UI dropdown and name a different one in the prompt, the prompt wins. What you typed is treated as the more explicit intent.

A dropdown selection is also stored on the server as that conversation's active skill. Pressing the badge's off button clears the server sticky state too.

### Skills together with Think+

Reasoning mode (Think+) and a skill can be on at once. With a skill active, rule 8 of the Think+ context (`결론 먼저, 군더더기 없이` — conclusion first, no padding) is replaced by "follow the active skill's instructions for output format and tone, and use Think+ material only as factual grounding", so the two do not fight. Accuracy rules 1 through 7 stay as they are.

## Common slash commands

Shared by Telegram and the Ask screen.

| Command | What it does |
|---|---|
| `/skill list` | List registered skills |
| `/skill status` | Current active skill, with `[🚫 끄기]` and `[📋 목록]` inline buttons |
| `/skill use <name>` | Activate a skill |
| `/skill off` (= `/off`) | Deactivate the active skill |
| `/skill quick <alias> <skill>` | Register a short alias (`/skill quick e eli5`) |
| `/skill quick list` | List registered aliases |
| `/skill quick remove <alias>` | Remove an alias |
| `/<alias> [question]` | Call by alias (`/e how does quantum tunneling work`) |

Aliases are stored in `~/.omnux/skill_aliases.json`.

`/skill create` does not silently overwrite an existing skill with the same name. To change an existing skill, open it on the desktop **Tools** screen and save.

## Creating a skill from a conversation

When you ask "make me a skill" or "create a skill that…" in a chat or in Telegram, the middleware emits an `<omni:skill>` directive in the response body. Post-processing parses it and writes `.omni/skills/<name>/SKILL.md`.

```xml
<omni:skill name="kebab-case-name" description="One-line description" scope="project" overwrite="false">
Skill body (markdown)
</omni:skill>
```

| Attribute | Rule |
|---|---|
| `name` | Lowercase letters, digits, and `-` only. No Korean, spaces, or underscores |
| `description` | One line on when to use this skill. The middleware uses it to decide invocation |
| `scope` | `project` by default. `global` when "전역" or "global" is stated |
| `overwrite` | `false` by default. `true` only with explicit consent |

The body should be actionable instructions for repeated use, at least 8 lines, covering purpose, usage flow, response principles, output format, verification criteria, and things to avoid.

## What a good SKILL.md looks like

`description` drives the invocation decision, so state both what the skill does and when to use it, in one specific line.

The body usually follows this structure.

| Section | Contents |
|---|---|
| Purpose | What the skill solves |
| Usage flow | Input checks, processing order, when to ask for clarification |
| Response principles | Tone, depth, evidence level, exception handling |
| Output format | Answer structure, when to use tables, lists, and code |
| Verification | Quality checks before answering |
| Things to avoid | Guessing, overstatement, unwanted advice, padding |

Conversation and tone skills also need more than 3 to 5 lines. Write down how the first sentence works, how long answers run, when to give advice, and what phrasing to avoid, or it will not behave consistently. Code and review skills cover what to read, change principles, verification, and how to report risk. Search and research skills cover preferred sources, recency checks, citation style, and how to mark uncertainty.

## Layout example

```text
.omni/
  skills/ui-review/SKILL.md
  commands/release-check.md
```

Skills define reusable response formats, review criteria, and tone. Command templates fit work that runs with the same structure every time, such as a release check.

The repository ships 10 example skills under `.omni/skills/`: `brainstorming`, `casual-chat`, `casual-empathy`, `code-review`, `coding-for-beginners`, `eli5`, `explain-optical-design`, `refactor`, `skill-creator`, and `write-tests`.
