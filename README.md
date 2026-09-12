<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="112" alt="omnux 앱 아이콘">
</p>

<h1 align="center">omnux</h1>

<p align="center">질문하고, 만들고, 돌리고, 남기는 일을 한 앱에서 한다. 내 컴퓨터에서 돈다.</p>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/badge/version-1.0.6-EF8B26" alt="version 1.0.6"></a>
  <a href="apps/omnux-middleware"><img src="https://img.shields.io/badge/.NET-9-512BD4?logo=dotnet&logoColor=white" alt=".NET 9"></a>
  <a href="apps/desktop"><img src="https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri&logoColor=white" alt="Tauri v2"></a>
  <a href="docs/QUICKSTART.md"><img src="https://img.shields.io/badge/macOS%20%C2%B7%20Linux%20%C2%B7%20Windows-000000" alt="macOS, Linux, Windows"></a>
</p>

<p align="center">
  <strong>한국어</strong> ·
  <a href="README.en.md">English</a>
</p>

---

**omnux**는 데스크톱 앱 하나로 LLM에 묻고, 코드를 만들어 실행하고, 정해진 시간에 자동으로 돌리고, 그 결과를 파일과 기록으로 남기는 도구입니다. 대화 내역, 빌드 산출물, 실행 로그, 노트는 전부 내 컴퓨터의 `~/.omnux`와 `workspace/`에 남습니다.

Gemini, Groq, Cerebras, NVIDIA NIM, Copilot, Codex, Grok을 같은 화면에서 바꿔 가며 씁니다. 하나만 골라 쓰거나, 여러 개를 순서대로 실행하거나, 나란히 놓고 답을 비교합니다.

텔레그램 봇을 붙이면 밖에서도 같은 명령을 보낼 수 있습니다. 데스크톱 앱과 봇은 같은 명령 계층(`CommandService`)을 통과하므로 한쪽에만 있는 기능이 생기지 않습니다.

## 무엇을 하나

| 화면 | 하는 일 |
|---|---|
| 질문 | 대화. 싱글·오케스트레이션·멀티 모드, 파일과 이미지 첨부, 스킬 적용 |
| 빌드 | 요구사항을 적으면 코드를 만들고 실행한다. 실행 폴더가 남는다 |
| 자동화 | 매일·매주·매월 정해진 시각에 작업을 돌린다 |
| 탐색 | 웹 검색, URL 가져오기, 실제 브라우저 제어, 캔버스 |
| 리뷰 | Safe Refactor. 미리 보기를 만들고 적용 직전에 파일을 다시 확인한다 |
| 프로젝트 · 작업 · 노트 | 로컬 프로젝트 등록, 계획 생성과 실행, 작업 기록과 이어보기 |
| 에이전트 · 도구 · 확장 · 라우팅 · 규칙 | 에이전트 실행 상태, 스킬, 훅·플러그인, provider 경로, 로직 그래프 |
| 활동 · 로그 · 상태 | 세션 기록, 모델 호출 내역, 연결과 환경 진단 |
| 설정 | 표시, 모델과 키, 보안, 연동, 데이터, 정보 |

## 시작하기

```bash
./scripts/omnux setup
omnux
```

`setup`은 필요한 도구를 확인해서 없으면 설치하고, 빌드와 `npm test`까지 돌린 뒤 `omnux` 명령을 등록합니다. macOS는 Homebrew, Linux는 배포판 패키지 매니저(apt/dnf/yum/pacman/zypper/apk)를 씁니다. Windows는 `.\scripts\omnux.ps1 setup`입니다.

`omnux`를 실행하면 데스크톱 앱이 뜨고, 앱이 .NET 미들웨어를 함께 띄웁니다. 미들웨어만 필요하면 `omnux start`, 전부 끄려면 `omnux shutdown`입니다.

| 대상 | 주소 |
|---|---|
| 데스크톱 UI (개발 모드) | `http://127.0.0.1:1420/` |
| 미들웨어 API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `/readyz` |
| 외부접속 UI | `http://<LAN-IP>:1420/` |

설치와 첫 실행은 [5분 시작](docs/QUICKSTART.md)에 더 자세히 적어 뒀습니다.

## 쓸 수 있는 모델

API 키나 CLI 인증이 된 provider만 목록에 나타납니다. 키 하나만 있어도 시작할 수 있습니다.

| provider key | 표시 이름 | 연결 방식 |
|---|---|---|
| `gemini` | Gemini | Google API, grounding 검색 |
| `groq` | Groq | OpenAI 호환 HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI 호환 `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh` / `copilot` CLI |
| `codex` | Codex | `codex` CLI 또는 API 키 |
| `grok` | Grok | `grok` CLI |

## 구성

| 위치 | 기술 | 맡는 일 |
|---|---|---|
| `apps/omnux-middleware` | .NET 9 (AOT) | WebSocket/HTTP 서버, provider 라우팅, 텔레그램, 상태 저장, 도메인 오케스트레이션 |
| `apps/desktop` | Tauri v2 + React 19 + Tailwind CSS v4 | 데스크톱 앱. 6개 영역 18개 화면 |
| `apps/omnux-sandbox` | Python | 코드 실행기 |
| `~/.omnux` | JSON + Markdown | 설정, 대화, 계획, 노트, 라우팅 정책 |
| `workspace/` | — | 빌드·자동화·로직 실행 산출물 |

Rust 셸은 창 관리와 미들웨어 기동만 합니다. LLM 호출, 코딩, 루틴, 상태 파일은 .NET 미들웨어가 맡습니다.

## 안전 경계

- API 키는 환경변수, `*_FILE`, secure store(`~/.config/omnux/secrets.json`, 0600), macOS Keychain 중에서 고릅니다.
- WebSocket은 Origin 검사, 인증 전 메시지 allowlist, 명령 rate limit, 기본 16MB 메시지 상한을 겁니다.
- 외부접속은 기본 꺼짐입니다. 켜면 같은 LAN의 기기가 제한 모드로 들어오며, 읽기 조회와 모델·라우팅 선택만 됩니다.
- Safe Refactor는 적용 직전에 파일 상태를 다시 확인하고 rollback snapshot을 남깁니다.
- 로컬 코드 실행은 `OMNUX_ENABLE_DYNAMIC_CODE=true`일 때만 허용합니다.

## 문서

- [5분 시작](docs/QUICKSTART.md) | 설치, 실행, 첫 확인
- [사용법](docs/사용법_빠른시작.md) | 화면별로 무엇을 누르는지
- [아키텍처](docs/아키텍처_흐름.md) | 요청이 지나가는 경로와 안전 경계
- [환경변수와 상태 파일](docs/환경변수_및_상태파일.md) | `OMNUX_*` 변수와 저장 위치
- [텔레그램 봇](docs/텔레그램_봇_가이드.md) | 명령, 첨부, 모바일 handoff
- [전체 문서 목록](docs/README.md) | 한국어와 영어

## 검증

```bash
npm test
```

저장소 위생, 경계 계약, 화면 모델, 미들웨어 빌드와 단위 테스트, 게이트웨이 런타임, 샌드박스 스모크를 순서대로 돌리고 하나라도 실패하면 멈춥니다. 자세한 내용은 [검증 가이드](docs/검증_가이드.md)에 있습니다.

## 라이선스

ISC. `package.json`의 `license` 필드를 따릅니다.
