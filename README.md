# omnux

<div align="center">

**채팅, 코딩, 실행, 자동화, 리팩터링, 노트, 텔레그램, LLM 라우팅을 하나의 흐름으로 묶는 로컬 퍼스트 AI 워크벤치입니다.**

[한국어](./README.md) · [English](./README.en.md)

</div>

**업데이트:** 2026-09-12

omnux는 대화, 빌드 실행, 생성 파일, 검증 로그, 루틴, 로직 그래프, 노트, Safe Refactor 미리보기, 텔레그램 제어를 한 흐름으로 이어 줍니다. Groq, Gemini, Cerebras, NVIDIA NIM, Copilot, Codex, Grok을 같은 Tauri 데스크톱 앱에서 쓰고, 결과를 파일·로그·실행 snapshot으로 남깁니다.

## 개발 목적

| 흔한 문제 | omnux의 방식 |
|---|---|
| 채팅과 실행이 따로 논다 | 대화, 빌드 결과, 로그가 계속 이어진다 |
| provider 비교가 번거롭다 | 싱글, 오케스트레이션, 멀티 모드가 질문과 빌드 모두에서 동작한다 |
| 데스크톱과 텔레그램 기능이 다르다 | 둘 다 같은 CommandService를 쓴다 |
| 리팩터링이 위험하다 | 미리보기 후 적용 직전에 다시 확인한다 |
| 운영 상태를 모른다 | `/healthz`, `/readyz`, `doctor --json` |

## 화면

| 영역 | 화면 |
|---|---|
| 홈 | 홈 |
| 워크스페이스 | 질문, 빌드, 자동화, 탐색, 리뷰 |
| 프로젝트 | 프로젝트, 작업, 노트 |
| 엔진 | 에이전트, 도구, 확장, 라우팅, 규칙 |
| 모니터 | 활동, 로그, 상태 |
| 설정 | 설정 |

## 빠른 시작

```bash
./scripts/omnux setup
omnux
omnux shutdown
```

setup은 macOS(Homebrew)와 Linux(apt/dnf/pacman/zypper/apk)에서 필수 도구, .NET SDK 9, Rust, Playwright Chromium을 준비하고 빌드와 `npm test`까지 확인한 뒤 `omnux` 명령을 등록합니다. `omnux`는 데스크톱 앱을 띄우고 앱이 미들웨어를 함께 실행합니다. 미들웨어만 필요하면 `omnux start`를 씁니다. Windows는 `.\scripts\omnux.ps1 setup`을 씁니다.

| 대상 | 주소 |
|---|---|
| 데스크톱 UI (개발 모드) | `http://127.0.0.1:1420/` |
| 외부접속 UI | `http://<LAN-IP>:1420/` |
| 미들웨어 API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `/readyz` |

자세한 내용은 [5분 시작](./docs/QUICKSTART.md)을 보세요.

## 지원 제공자

| Provider Key | Label | 연동 |
|---|---|---|
| `gemini` | Gemini | Google API 및 그라운딩 검색 |
| `groq` | Groq | OpenAI 호환 HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI 호환 `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh`/`copilot` CLI |
| `codex` | Codex | `codex` CLI 또는 API Key |
| `grok` | Grok | `grok` CLI |

## 문서

[문서 목록](./docs/README.md)에서 사용법, 아키텍처, 기술 스택, 검증, 환경변수 문서를 볼 수 있습니다.
