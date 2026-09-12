# Safe Refactor

[한국어](../SAFE_REFACTORING.md) · [English](./safe-refactoring.md)

Updated: 2026-09-12

Safe Refactor never overwrites a file directly. It builds a preview first and re-checks file state right before apply. In the desktop app, this is the **Review** screen.

## Methods

| Screen label | Method | What it does |
|---|---|---|
| 줄 범위 (Lines) | Anchor Edit | Replaces a line range guarded by line hashes |
| 패턴 (Pattern) | AST Replace | Applies an ast-grep pattern and rewrite |
| 이름 (Name) | LSP Rename | Applies rename edits computed by a language server |

Lines is always available. Pattern and Name are off by default: turn them on with an environment variable, and the matching tool has to be on PATH.

| Variable | Default | Tool it needs |
|---|---|---|
| `OMNUX_REFACTOR_ENABLE_AST_GREP` | `false` | `ast-grep` |
| `OMNUX_REFACTOR_ENABLE_LSP` | `false` | The language server for that language |

## Flow

Follow the Review screen tabs in order.

1. **1. Files**: read the target file.
2. **2. Changes**: pick a method, set the range or the symbol/pattern, and build the preview.
3. **3. Check and apply**: read the diff and apply. If the file changed after the preview, apply is blocked and you rebuild the preview.

Previews live in `workspace/.runtime/refactor-preview/` and expire after 120 minutes by default (`OMNUX_REFACTOR_PREVIEW_TTL_MINUTES`, 5–1440). They are treated as work artifacts, so deleting them changes no setting.

Telegram has `/refactor read`, `/refactor preview`, and `/refactor apply` too. A large diff arrives as a summary and a handoff instead of the whole thing.
