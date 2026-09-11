# NVIDIA NIM 제공자

[한국어](./nvidia-nim-provider.md) · [English](./en/nvidia-nim-provider.md)

업데이트 기준: 2026-09-12

omnux의 NVIDIA NIM provider key는 `nvidia`다. UI 표시명은 `NVIDIA NIM`이고, `nvidia-nim`, `nvidia_nim`, `nim` alias도 `nvidia`로 정규화한다.

## 기본값

| 항목 | 값 |
|---|---|
| Base URL | `https://integrate.api.nvidia.com/v1` |
| 기본 모델 | `apps/shared/model-registry.json`의 기본값 (현재 `moonshotai/kimi-k3`) |
| Timeout | 180초 |
| single-chat 최소 timeout | 30초 |

## 환경변수

- `OMNUX_NVIDIA_API_KEY_FILE` (권장), `OMNUX_NVIDIA_API_KEY`
- `OMNUX_NVIDIA_KEYCHAIN_SERVICE`, `OMNUX_NVIDIA_KEYCHAIN_ACCOUNT`
- `OMNUX_NVIDIA_BASE_URL`, `OMNUX_NVIDIA_MODEL`
- `OMNUX_NVIDIA_TIMEOUT_SEC`, `OMNUX_NVIDIA_MIN_SINGLE_CHAT_TIMEOUT_SEC`

## 동작

NIM LLM API는 OpenAI 호환 chat completions로 붙는다. streaming SSE는 기존 OpenAI 호환 parser를 쓰고, 202 응답이 오면 `requestId`로 status polling해 최종 응답을 가져온다.

범위는 텍스트 LLM이다. 이미지, 비전, 멀티모달 NIM endpoint는 제외한다.
