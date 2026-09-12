# Safe Refactor

[한국어](../SAFE_REFACTORING.md) · [English](./safe-refactoring.md)

Updated: 2026-09-12

Safe Refactor guards against blind file overwrites through a staged, preview-first refactoring pipeline that verifies source hashes immediately before applying patches. In the desktop shell, this flow lives under the **Review** screen.

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

Execute operations sequentially through the numbered Review tabs:

1. **1. Files**: Load the target source file.
2. **2. Changes**: Select a refactoring strategy (Lines, Pattern, or Name), configure parameters, and generate the diff preview.
3. **3. Check and apply**: Inspect the generated patch. If underlying file hashes changed between preview generation and apply, the operation is blocked to prevent conflicting writes.

Previews live in `workspace/.runtime/refactor-preview/` and expire after 120 minutes by default (`OMNUX_REFACTOR_PREVIEW_TTL_MINUTES`, 5–1440). They are treated as work artifacts, so deleting them changes no setting.

Telegram has `/refactor read`, `/refactor preview`, and `/refactor apply` too. A large diff arrives as a summary and a handoff instead of the whole thing.
