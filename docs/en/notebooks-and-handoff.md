# Notes and Handoff

[한국어](../NOTEBOOKS_AND_HANDOFF.md) · [English](./notebooks-and-handoff.md)

Updated: 2026-09-12

Notebooks store notes, decisions, verification records, and a handoff so you can continue where you stopped in the next session. They do not re-summarize LLM answers.

## Document types

| Desktop tab | File | What goes in it |
|---|---|---|
| Memo | `learnings.md` | What you will need again, and what confused you |
| Decisions | `decisions.md` | What you decided to do, and what you decided against |
| Checks | `verification.md` | What you verified yourself, and what you have not looked at |
| Handoff | `handoff.md` | The current state in one document. Created with a button |

Files live in `~/.omnux/notebooks/<project-key>/`. In the desktop app, open the **Notes** screen (Log · Decisions · Checks · Memo · Handoff).

## Flow

1. Record notes as they come up during the work.
2. When the direction changes, write down the decision.
3. Put what you actually verified into the verification record.
4. Create the handoff before the session ends.

Both the Ask screen and Telegram accept `/notebook` and `/handoff`.

## Telegram handoff

Use Telegram for notifications and to start work. Large coding results, diffs, logs, file bodies, task output, and doctor JSON are not expanded there; they come as a summary with a short preview.

`/handoff [project-key]` creates the handoff document.

| Item | Value |
|---|---|
| Local document | `~/.omnux/notebooks/<project-key>/handoff.md` |
| Desktop location | The Handoff tab of the Notes screen |
| Telegram response | `projectKey`, `rootPath`, `handoffPath`, `updated`, and a short preview |

There is currently no separate desktop deep link protocol. The Telegram `/handoff` response does not build an `omnux://` link; you continue from the local path in the desktop Notes screen. Once desktop routing and the app protocol are settled in Phase 5, deep links will be reconsidered separately.
