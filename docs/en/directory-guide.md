# Directory Guide

[한국어](../디렉터리_가이드.md) · [English](./directory-guide.md)

Updated: 2026-05-21

Canonical paths are `apps/`, `docs/`, and `workspace/`.

| Path | Purpose |
|---|---|
| `apps/omnux-middleware` | .NET server and command layer |
| `apps/omnux-dashboard` | Static dashboard |
| `apps/omnux-sandbox` | Python executor |
| `docs/assets/readme` | README screenshots |
| `scripts` | `omnux setup/start/shutdown`, Windows `omnux.ps1`, and test scripts |
| `workspace` | Generated work artifacts |

## Launchers

- `./scripts/omnux setup`: checks or installs dependencies, builds the middleware, validates, and registers the launcher on macOS/Linux.
- `./scripts/omnux`: starts the server; if the setup marker is missing, it attempts automatic setup first.
- `./scripts/omnux shutdown`: stops running omnux processes.
- `.\scripts\omnux.ps1 setup`: Windows setup, build, and validation path.
