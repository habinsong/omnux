# Environment and State Files

[한국어](../환경변수_및_상태파일.md) · [English](./environment-and-state.md)

Updated: 2026-05-21

Secrets should use `*_FILE` or a secure store where possible. Runtime state lives under `~/.omnux`; generated work lives under `workspace/`. If `~/.omnux` is missing and legacy `~/.omninode` exists, omnux reads the legacy state for compatibility.

Common variables: `OMNUX_GEMINI_API_KEY_FILE`, `OMNUX_GEMINI_MODEL`, `OMNUX_GEMINI_FLASH_MODEL`, `OMNUX_GEMINI_FLASH_LITE_MODEL`, `OMNUX_GROQ_API_KEY_FILE`, `OMNUX_CEREBRAS_API_KEY_FILE`, `OMNUX_NVIDIA_API_KEY_FILE`, `OMNUX_CODEX_API_KEY_FILE`, `OMNUX_WORKSPACE_ROOT`.

`OMNUX_*` variables take priority. Matching legacy `OMNINODE_*` variables are read only as fallback values.
