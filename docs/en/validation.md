# Validation Guide

[한국어](../검증_가이드.md) · [English](./validation.md)

Updated: 2026-05-21

```bash
python3 apps/omnux-sandbox/executor.py --code "print('ok')"
dotnet build apps/omnux-middleware/Omnux.Middleware.csproj
npm test
./scripts/omnux setup
curl -s http://127.0.0.1:8080/readyz
```

`npm test` includes repository hygiene, dashboard syntax checks, router contracts, Telegram/chat contracts, routine/plan/notebook contracts, the security boundary contract, the core daemon boundary contract, and the tech stack contract.

For screenshots, check the PNG files under `docs/assets/readme/`, including `dashboard-mobile-composer-390x844.png.png`.

Manual release checks should include remote-dashboard limited mode without an OTP prompt, blocked remote OTP requests, categorized remote auth/secret/external-access blocking, blocked remote chat/coding/routine/logic graph execution, allowed read-oriented views plus model/routing changes, WebSocket unauthorized rejection, routine local-image path limits, attachment count/size rejection, and Markdown raw HTML blocking.
