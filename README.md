<p align="center">
  <img src="apps/desktop/src-tauri/icons/128x128@2x.png" width="112" alt="omnux 앱 아이콘">
</p>

<h1 align="center">omnux</h1>

<p align="center">질문하고, 만들고, 돌리고, 검증하는 AI 에이전틱 앱</p>

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

**omnux**는 데스크톱 앱 하나로 LLM 질의, 코드 생성 및 실행, 주기적 작업 자동화, 실행 결과 기록을 통합 처리하는 도구입니다. 대화 내역, 빌드 산출물, 실행 로그, 노트는 외부 클라우드가 아닌 로컬 머신의 `~/.omnux`와 `workspace/`에 보관됩니다.

Gemini, Groq, Cerebras, NVIDIA NIM, Copilot, Codex, Grok을 한 화면에서 전환하며 사용합니다. 단일 모델 호출, 여러 모델의 순차 파이프라인 실행, 모델 간 답변 비교를 지원합니다.

텔레그램 봇을 연동하면 외부에서도 동일한 명령을 실행할 수 있습니다. 데스크톱 앱과 텔레그램 봇이 같은 명령 계층(`CommandService`)을 공유하므로 인터페이스에 따른 기능 격차가 없습니다.

## omnux

| 화면 | 하는 일 |
|---|---|
| 질문 | 대화. 싱글·오케스트레이션·멀티 모드, 파일과 이미지 첨부, 스킬 적용 |
| 빌드 | 요구사항 기반 코드 생성 및 실행. 작업별 실행 폴더 보존 |
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

`setup`은 필요한 도구를 점검해 설치하고, 빌드와 `npm test`를 통과한 뒤 `omnux` CLI 명령을 등록합니다. macOS는 Homebrew, Linux는 배포판 패키지 관리자(apt/dnf/yum/pacman/zypper/apk)를 지원합니다. Windows 환경에서는 `.\scripts\omnux.ps1 setup`을 실행합니다.

`omnux` 명령으로 데스크톱 앱과 .NET 미들웨어를 함께 기동합니다. 미들웨어만 단독 실행하려면 `omnux start`, 전체 프로세스를 종료하려면 `omnux shutdown`을 사용합니다.

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
| `codex` | Codex | `codex` CLI 또는 API key |
| `grok` | Grok | `grok` CLI |

## 구성

| 위치 | 기술 | 맡는 일 |
|---|---|---|
| `apps/omnux-middleware` | .NET 9 (AOT) | WebSocket/HTTP 서버, provider 라우팅, 텔레그램, 상태 저장, 도메인 오케스트레이션 |
| `apps/desktop` | Tauri v2 + React 19 + Tailwind CSS v4 | 데스크톱 앱. 6개 영역 18개 화면 |
| `apps/omnux-sandbox` | Python | 코드 실행기 |
| `~/.omnux` | JSON + Markdown | 설정, 대화, 계획, 노트, 라우팅 정책 |
| `workspace/` | — | 빌드·자동화·로직 실행 산출물 |

Rust 셸은 윈도우 관리와 미들웨어 기동만 담당합니다. LLM 호출, 코드 생성, 루틴 스케줄링, 상태 관리는 전부 .NET 미들웨어가 처리합니다.

## 안전 경계

- API 키는 환경변수, `*_FILE`, 암호화 저장소(`~/.config/omnux/secrets.json`, 권한 0600), macOS Keychain 중에서 선택해 관리합니다.
- WebSocket 계층은 Origin 검증, 인증 전 메시지 허용 목록(allowlist), 명령 요청 빈도 제한(rate limit), 기본 16MB 메시지 상한을 적용합니다.
- 외부 접속은 기본 비활성화입니다. 활성화 시 동일 LAN의 기기가 제한 모드로 접속하며, 읽기 조회와 모델·라우팅 선택만 허용합니다.
- Safe Refactor는 코드 적용 직전에 파일 변경 여부를 재확인하고 롤백 스냅샷을 생성합니다.
- 로컬 코드 실행은 `OMNUX_ENABLE_DYNAMIC_CODE=true` 환경변수가 설정되었을 때만 허용합니다.

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

저장소 위생, 경계 계약, 화면 모델, 미들웨어 빌드 및 단위 테스트, 게이트웨이 런타임, 샌드박스 스모크를 순차 검증하며, 오류 발생 시 즉시 중단합니다. 상세 내용은 [검증 가이드](docs/검증_가이드.md)를 참고하세요.

## 라이선스

ISC. `package.json`의 `license` 필드를 따릅니다.
