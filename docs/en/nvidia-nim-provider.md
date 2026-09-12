# NVIDIA NIM Provider

[한국어](../nvidia-nim-provider.md) · [English](./nvidia-nim-provider.md)

Updated: 2026-09-12

The provider key is `nvidia`. The UI label is `NVIDIA NIM`, and the aliases `nvidia-nim`, `nvidia_nim`, and `nim` normalize to `nvidia`.

## Defaults

| Item | Value |
|---|---|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| Default model | The default in `apps/shared/model-registry.json`, currently `moonshotai/kimi-k3` |
| Timeout | 180s |
| Single-chat minimum timeout | 30s |

## Variables

| Variable | Purpose |
|---|---|
| `OMNUX_NVIDIA_API_KEY_FILE` | Path to the key file. Recommended |
| `OMNUX_NVIDIA_API_KEY` | The key string directly |
| `OMNUX_NVIDIA_KEYCHAIN_SERVICE`, `OMNUX_NVIDIA_KEYCHAIN_ACCOUNT` | macOS Keychain entry |
| `OMNUX_NVIDIA_BASE_URL` | Base URL override |
| `OMNUX_NVIDIA_MODEL` | Default model override |
| `OMNUX_NVIDIA_TIMEOUT_SEC` | HTTP timeout |
| `OMNUX_NVIDIA_MIN_SINGLE_CHAT_TIMEOUT_SEC` | Single-chat minimum timeout |

## Behavior

The NIM LLM API connects through OpenAI-compatible chat completions. Streaming SSE reuses the existing OpenAI-compatible parser.

On a 202 response, the `requestId` is read from the body and `<base-url>/status/<requestId>` is polled for the final response. A body without a `requestId` raises an error.

The scope is text LLMs. Image, vision, and multimodal NIM endpoints are out of scope.
