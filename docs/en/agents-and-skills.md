# AGENTS, Skills, and Commands

[한국어](../AGENTS_AND_SKILLS.md) · [English](./agents-and-skills.md)

Updated: 2026-06-05

![Skills tab](../assets/readme/dashboard-skills-tab.png)

AGENTS files are always-on instructions. Skills are opt-in behavior packs stored as `SKILL.md`. Commands are reusable prompt templates. Chat, Coding, and Telegram share the same skill activation and stop flow.

Skills work the same way across the desktop app, web dashboard, and Telegram bot. You can activate/deactivate them via the skill badge in the chat input or slash commands.

Current behavior:

- A selected skill is sticky per conversation and survives middleware restarts.
- The skill badge off button clears both UI selection and server-side sticky state.
- If a prompt names a skill, the prompt wins over the UI dropdown.
- Only one effective skill is allowed at a time; multiple detected skills return a clear rejection.
- URL and web-search fast paths do not bypass active skill context.
- Project skills win over global skills with the same name.
- `/skill create` and the Skills tab do not silently overwrite an existing skill.

## In-conversation skill creation

When you ask "make me a skill" or "create a skill that..." in a chat or Telegram, the middleware outputs an `<omni:skill>` directive in the response body. The middleware post-processing parses this directive and creates the `.omni/skills/<name>/SKILL.md` file.

Directive format:

```xml
<omni:skill name="kebab-case-name" description="One-line description" scope="project" overwrite="false">
Skill body (markdown).
</omni:skill>
```

- `name`: Lowercase letters, numbers, and `-` only. No Korean, spaces, or underscores.
- `description`: Clear one-liner about when to use this skill. Used by middleware for invocation decisions.
- `scope`: Default `project`. Use `global` when explicitly requested.
- `overwrite`: Default `false`. Only `true` with explicit consent.

The body should be actionable instructions for repeated use, not a short memo. Write at least 8 lines including purpose, usage flow, response principles, output format, verification criteria, and things to avoid.
