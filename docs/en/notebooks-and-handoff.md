# Notebooks and Handoff

[한국어](../NOTEBOOKS_AND_HANDOFF.md) · [English](./notebooks-and-handoff.md)

Updated: 2026-09-12

Notebooks collect what you want to leave behind while working: learnings, decisions, verification notes, and a handoff for the next session. They are not an LLM re-summary.

| Document | File |
|---|---|
| Learnings | `learnings.md` |
| Decisions | `decisions.md` |
| Verification | `verification.md` |
| Next steps | `handoff.md` |

Files live in `~/.omnux/notebooks/<project-key>/`. In the desktop app, open the **Notes** screen (Log · Decisions · Checks · Memo · Handoff). Both the Ask screen and Telegram accept `/notebook` and `/handoff`.

## Telegram Handoff

Telegram is for alerts and triggers. Large coding results, diffs, logs, file bodies, task output, and doctor JSON are not expanded there; you get a summary and a short preview.

`/handoff [project-key]` writes `~/.omnux/notebooks/<project-key>/handoff.md` and replies with `projectKey`, `rootPath`, `handoffPath`, `updated`, and a preview. Continue from the Handoff tab of the Notes screen. There is no `omnux://` deep link.
