# Safe Refactor

[한국어](../SAFE_REFACTORING.md) · [English](./safe-refactoring.md)

Updated: 2026-09-12

Safe Refactor never overwrites files directly. It builds a preview first and re-checks file state right before apply. In the desktop app, this is the **Review** screen.

| Screen label | Method | What it does |
|---|---|---|
| 줄 범위 (Lines) | Anchor Edit | Replaces a line range guarded by line hashes |
| 패턴 (Pattern) | AST Replace | Applies an ast-grep pattern/rewrite |
| 이름 (Name) | LSP Rename | Applies rename edits computed by a language server |

Pattern and Name modes need `ast-grep` and the language server on PATH.

Follow the tabs: 1. Files → 2. Changes (pick a mode, build the preview) → 3. Check & apply. If the file changed after the preview, apply is blocked and you rebuild the preview. Previews live in `workspace/.runtime/refactor-preview/` as work artifacts, not settings.
