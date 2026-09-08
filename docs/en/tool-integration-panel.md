# Tool Integration Panel

[한국어](../도구_통합_패널_사용_가이드.md) · [English](./tool-integration-panel.md)

Updated: 2026-06-05

![Settings tab](../assets/readme/dashboard-settings-tab.png)

The tool integration panel is an operations screen inside Settings. It's not for building features — it's for observing provider, tool, and RAG status, and sending control requests when needed.

## Viewing Order

1. Check status summary for problem domains.
2. Check Provider status for missing keys, CLI auth, recent errors.
3. Check Guard observations to understand why search/RAG responses were allowed or blocked.
4. Send control requests only for the needed domain/action.
5. Check results for status, duration, reason.

## Main Domains

| Domain | Examples |
|---|---|
| `sessions` | list, history, send |
| `cron` | status, create, toggle, delete |
| `browser` | status, start, stop, tabs, navigate, open, focus, close (default `auto`: Playwright real Chromium first, stub fallback on failure) |
| `telegram` | command simulation |
| `web` | search, fetch |
| `memory` | search, get, rebuild |
| `doctor` | fix preview, fix apply |
| `cleanup` | preview, apply |

## Browser Tool Usage

Typing natural language in the desktop Ask or Build screen automatically detects browser intent.

Examples:

- `Open Naver`
- `Open YouTube in a new tab`
- `Open github.com`
- `Open browser`
- `Close browser`

This input is detected as browser intent before reaching LLM or coding execution. In default `auto` mode, Playwright helper lazy-starts and opens a real Chromium instance.

Use the tool integration panel in Settings only for direct operator control. Send `browser.status`, `browser.navigate`, etc. via the control request section.

기본 `auto`는 실제 Playwright 브라우저를 사용한다. 전용 Chromium이 없으면 Chrome을 시도하고, 실행 실패는 오류로 반환한다. 가짜 성공 폴백은 없다.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OMNUX_BROWSER_TOOL_MODE` | `auto` | 실제 실행: `auto`/`playwright`. 비활성: `off`/이전 `stub` |
| `OMNUX_BROWSER_HEADLESS` | `true` | Playwright browser headless mode |
| `OMNUX_CANVAS_TOOL_MODE` | `auto` | 실제 캔버스. `off`/이전 `stub`은 비활성 오류 |
| `OMNUX_BROWSER_CHANNEL` | 빈 값 | 전용 Chromium이 없으면 Chrome을 시도. 채널을 명시하면 해당 값 사용 |

## 탐색·캔버스 동작 (2026-09-07)

실제 DOM eval과 PNG/JPEG 캡처를 사용한다. 숨김은 내용을 보존한다. A2UI v0.9/v0.9.1 핵심 메시지·바인딩·동작 이벤트를 지원하지만 전체 Basic Catalog 준수를 주장하지 않는다. 평문/제목 Text와 구현된 함수·아이콘만 처리한다.

`sessions_send`는 저장 접수이며 새 응답을 생성하지 않는다. 원래 질문/빌드 화면에서 작업을 이어간다.

검증: `node scripts/check-gateway-runtime-contract.mjs --explore-only`. Node.js, Playwright, Chromium/Chrome 필요.
