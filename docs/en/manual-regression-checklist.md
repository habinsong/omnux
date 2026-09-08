# Manual Regression Checklist

[한국어](../OMNUX_실환경_수동_최종회귀_체크리스트.md) · [English](./manual-regression-checklist.md)

Updated: 2026-06-05

Before release, manually check the desktop app, web dashboard, and Telegram. Automated tests don't catch everything that breaks in a real browser or Telegram client.

## Desktop App

- [ ] `npm run tauri dev --prefix apps/desktop` starts (middleware must be running first)
- [ ] Home: Active Projects, Continue, Recent Activity, Resource Usage cards
- [ ] Ask: Single/orchestration/multi mode switching, markdown rendering, Think+ toggle
- [ ] Build: Execution folder creation, recent result restore
- [ ] Logic: Graph save/run
- [ ] Explore: Web search, URL fetch
- [ ] Automate: Routine create/immediate execution
- [ ] Settings: Memory/Models tab switching, provider status
- [ ] Theme switching: Glass/Light/Dark
- [ ] Command Palette (⌘K) works

## Web Dashboard

- [ ] `http://127.0.0.1:8080/` opens
- [ ] Status shows `Connected / OTP pending` or authenticated state
- [ ] Chat tab single response works
- [ ] Coding tab small file creation and recent result restore
- [ ] Mobile width composer open/close

## Feature Tabs

- [ ] Routine create/immediate execution
- [ ] Logic graph save/run
- [ ] Notebook record save
- [ ] Plan create/review/approve
- [ ] Skill list and skill activate/deactivate
- [ ] Safe Refactor preview generation

## Settings and Operations

- [ ] Provider status display
- [ ] Settings > Memory & backup shows portable package description, `portable-package-only` sync mode, conflict policy
- [ ] Export requires at least one include category selected
- [ ] Exported ZIP contains `omnux-package.json` manifest with per-file `SHA-256`; no API keys, Telegram tokens/chat ids, auth sessions, runtime logs, or outbox
- [ ] `omnux-package.json` and ZIP entry names contain no local absolute paths, `..`, absolute ZIP paths, or Windows backslashes
- [ ] Import preview shows conversation ID conflicts and file conflicts separately
- [ ] overwrite=false skips existing files; overwrite=true replaces them
- [ ] Import from another machine or separate test root places `conversations.json`, `routines.json`, `routing-policy.json`, `memory-notes/`, `plans/`, `tasks/`, `notebooks/`, global/project skills, global/project commands into target `~/.omnux` and `workspace/.omni` locations
- [ ] `omnux-package.json` is not saved as an import target state file
- [ ] Remote machine: `node scripts/gist-bridge-remote-qa.mjs --token <GITHUB_TOKEN>` — both `outboundUploadOk` / `inboundDownloadOk` are `true`
- [ ] Remote access toggle and address display
- [ ] Remote client first access enters limited mode without OTP screen
- [ ] Remote client sensitive settings blocked
- [ ] Remote client chat/coding/routine/logic graph execution blocked
- [ ] Remote client read-oriented views, model selection, routing policy changes allowed
- [ ] Remote client model selection and routing policy changes allowed
- [ ] Pre-auth WebSocket request rejection and Origin blocking
- [ ] Routine image preview does not open files outside routine asset paths
- [ ] `/healthz`, `/readyz`, `doctor --json`
- [ ] Telegram natural language commands and general chat
- [ ] Pause middleware Telegram polling, then run `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180`
- [ ] Live QA results: `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk` all `true`
- [ ] Mobile `.txt` attachment re-uploaded and echo-back document body `QA-ID` confirms file attachment receipt
