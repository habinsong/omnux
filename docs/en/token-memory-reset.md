# Token and Memory Reset

[한국어](../토큰_메모리_초기화_가이드.md) · [English](./token-memory-reset.md)

Updated: 2026-09-12

omnux attaches recent conversation, memory notes, and search results as context only when they are needed. If answers keep drifting toward old context, check memory first.

## Reset in the desktop app

| Location | Button |
|---|---|
| Ask screen > References tab | **대화 메모리 초기화** (Clear conversation memory) |
| Settings > Data > Memory notes | **메모리 비우기** (Clear memory) |

Both ask for confirmation. After clearing, check again with a fresh question.

## Reset from Telegram

```text
/memory clear
메모리 초기화해줘
```

## What is normal

- Short greetings and simple arithmetic get no search or memory context. That is expected.
- Questions about current information may carry search evidence.
- Project code questions prioritize AGENTS and the relevant file context.

Memory notes live in `~/.omnux/memory-notes/`. If anything there is worth keeping, export it first from **Settings > Data > Backup**.
