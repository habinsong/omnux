# Manual Regression Checklist

[한국어](../OMNUX_실환경_수동_최종회귀_체크리스트.md) · [English](./manual-regression-checklist.md)

Updated: 2026-09-12

Before a release, check these by hand. Automated tests don't catch everything that breaks in the real desktop app or Telegram client.

## Install and Run

- [ ] `./scripts/omnux setup` ends with `setup 완료` on macOS and Linux (Ubuntu)
- [ ] `omnux` opens the desktop window and starts the middleware with it
- [ ] `omnux start` → `omnux status` → `omnux shutdown`
- [ ] `/healthz`, `/readyz`, `doctor --json`

## Desktop App

- [ ] Home: input, shortcuts, continue-work panel
- [ ] Ask: single/orchestration/multi switching, markdown rendering
- [ ] Build: execution folder creation, recent result restore
- [ ] Automate: routine create/immediate run
- [ ] Explore: web search, URL fetch, browser
- [ ] Rules: logic graph save/run
- [ ] Tasks/Notes: plan create/review/approve, note save
- [ ] Tools: skill list and activate/deactivate
- [ ] Review: Safe Refactor preview generation
- [ ] Settings: Models & Keys tab, provider status
- [ ] Theme switching: Light/Glass/Dark
- [ ] Command Palette (⌘K / Ctrl+K)
- [ ] Narrow width: open/close navigation with the menu button

## Backup

- [ ] Settings > Memory shows portable package description, `portable-package-only` sync mode, conflict policy
- [ ] Export requires at least one include category selected
- [ ] Exported ZIP contains `omnux-package.json` manifest with per-file `SHA-256`; no API keys, Telegram tokens/chat ids, auth sessions, runtime logs, or outbox
- [ ] `omnux-package.json` and ZIP entry names contain no local absolute paths, `..`, absolute ZIP paths, or Windows backslashes
- [ ] Import preview shows conversation ID conflicts and file conflicts separately
- [ ] overwrite=false skips existing files; overwrite=true replaces them
- [ ] Import from another machine or separate test root places `conversations.json`, `routines.json`, `routing-policy.json`, `memory-notes/`, `plans/`, `tasks/`, `notebooks/`, global/project skills, global/project commands into target `~/.omnux` and `workspace/.omni` locations
- [ ] `omnux-package.json` is not saved as an import target state file
- [ ] Remote machine: `node scripts/gist-bridge-remote-qa.mjs --token <GITHUB_TOKEN>` — both `outboundUploadOk` / `inboundDownloadOk` are `true`

## Remote Access and Security

- [ ] Remote access toggle and address display
- [ ] Remote client first access enters limited mode without OTP screen
- [ ] Remote client sensitive settings blocked
- [ ] Remote client chat/coding/routine/logic graph execution blocked
- [ ] Remote client read-oriented views, model selection, routing policy changes allowed
- [ ] Pre-auth WebSocket request rejection and Origin blocking
- [ ] Routine image preview does not open files outside routine asset paths

## Telegram

- [ ] Telegram natural language commands and general chat
- [ ] Pause middleware Telegram polling, then run `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180`
- [ ] Live QA results: `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk` all `true`
- [ ] Mobile `.txt` attachment re-uploaded and echo-back document body `QA-ID` confirms file attachment receipt
