# Manual Regression Checklist

[한국어](../OMNUX_실환경_수동_최종회귀_체크리스트.md) · [English](./manual-regression-checklist.md)

Updated: 2026-09-12

What a person clicks through before a release. Automated tests can pass while the real desktop app or Telegram breaks; this list catches that.

## Install and run

- [ ] `./scripts/omnux setup` finishes with `setup 완료` on macOS and Linux (Ubuntu)
- [ ] `omnux` opens the desktop window and starts the middleware with it
- [ ] `omnux start` → `omnux status` → `omnux shutdown`
- [ ] `/healthz`, `/readyz`, `doctor --json`

## Desktop app

- [ ] Home: input, shortcuts, Continue work, Active projects
- [ ] Ask: single, orchestration, and multi switching; markdown rendering
- [ ] Build: run folder creation, restoring the latest result
- [ ] Automate: routine creation and Run now
- [ ] Explore: web search, URL fetch, browser
- [ ] Rules: logic graph save and run
- [ ] Tasks: plan create, review, approve; stop and resume
- [ ] Notes: decision, check, and memo saves; handoff creation
- [ ] Tools: skill list, activate, and stop
- [ ] Review: Safe Refactor preview creation
- [ ] Settings: the six tabs (General, Models, Security, Integrations, Data, About) and provider status
- [ ] Theme switching: Light, Glass, Dark
- [ ] Command palette (⌘K / Ctrl+K)
- [ ] Opening and closing navigation with the menu button at narrow widths

## Backup

- [ ] Settings > Data > Backup shows the portable package description, the `portable-package-only` sync mode, and the conflict policy
- [ ] Export requires selecting at least one scope
- [ ] The exported ZIP has the `omnux-package.json` manifest and a `SHA-256` per file, and excludes API keys, the Telegram token and chat id, auth sessions, runtime logs, and the outbox
- [ ] Neither `omnux-package.json` nor the ZIP entry names contain local absolute paths, `..`, absolute ZIP paths, or Windows backslashes
- [ ] The import preview shows conversation ID conflicts and file conflicts separately
- [ ] With overwrite=false existing files are skipped; with overwrite=true they are replaced
- [ ] After importing on another machine or a separate test root, `conversations.json`, `routines.json`, `routing-policy.json`, `memory-notes/`, `plans/`, `tasks/`, `notebooks/`, and the global and project skills and commands land in the target `~/.omnux` and `workspace/.omni`
- [ ] `omnux-package.json` is not written as a state file on the import target
- [ ] On a separate remote machine, `node scripts/gist-bridge-remote-qa.mjs --token <GITHUB_TOKEN>` returns `outboundUploadOk` and `inboundDownloadOk` both `true`

## Remote access and security

- [ ] The remote access toggle and the address are shown
- [ ] A remote client's first connection enters limited mode with no OTP screen
- [ ] Sensitive settings are blocked for remote clients
- [ ] Chat, coding, routine, and logic graph runs are blocked for remote clients
- [ ] Read queries, model selection, and routing policy changes are allowed for remote clients
- [ ] Pre-auth WebSocket requests are rejected and Origin blocking works
- [ ] The routine image preview does not open files outside the routine asset path

## Telegram

- [ ] Natural-language commands and ordinary chat in Telegram
- [ ] With the middleware Telegram polling loop paused, run `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180`
- [ ] Live QA returns `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, and `inboundDocumentEchoOk` all `true`
- [ ] The `.txt` attachment received on the phone was uploaded back, and attachment delivery is decided by the `QA-ID` in the echoed document body
- [ ] A large coding result is narrowed to `/coding files`, `/coding download <number>`, and `/handoff` instead of being expanded in full
- [ ] No `omnux://` link appears anywhere in a Telegram response
