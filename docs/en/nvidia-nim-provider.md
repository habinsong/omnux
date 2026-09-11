# NVIDIA NIM Provider

[한국어](../nvidia-nim-provider.md) · [English](./nvidia-nim-provider.md)

Updated: 2026-09-12

Provider key: `nvidia`. UI label: `NVIDIA NIM`. Aliases `nvidia-nim`, `nvidia_nim`, and `nim` normalize to `nvidia`.

| Item | Value |
|---|---|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| Default model | Default in `apps/shared/model-registry.json` (currently `moonshotai/kimi-k3`) |
| Timeout | 180s |
| Single-chat minimum timeout | 30s |

Variables: `OMNUX_NVIDIA_API_KEY_FILE` (recommended), `OMNUX_NVIDIA_API_KEY`, `OMNUX_NVIDIA_KEYCHAIN_SERVICE`, `OMNUX_NVIDIA_KEYCHAIN_ACCOUNT`, `OMNUX_NVIDIA_BASE_URL`, `OMNUX_NVIDIA_MODEL`, `OMNUX_NVIDIA_TIMEOUT_SEC`, `OMNUX_NVIDIA_MIN_SINGLE_CHAT_TIMEOUT_SEC`.

NIM uses the OpenAI-compatible chat completions flow. Streaming SSE reuses the OpenAI-compatible parser, and a 202 response is followed by status polling on its `requestId`. Scope is text LLMs only; image, vision, and multimodal NIM endpoints are excluded.
