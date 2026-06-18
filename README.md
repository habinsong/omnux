# omnux

<div align="center">

**채팅, 코딩, 실행, 자동화(Routines), 리팩터링, 노트북, 텔레그램 및 다양한 LLM 제공자 라우팅을 하나의 실용적인 워크플로우로 연결하는 로컬 퍼스트 AI 워크벤치입니다.**

[한국어](./README.md) · [English](./README.en.md)

</div>

**업데이트:** 2026-06-18

omnux는 단순한 채팅 UI가 아닙니다. 대화, 코딩 실행, 생성된 파일, 검증 로그, 자동화 루틴, 로직 그래프, 노트북, Safe Refactor 미리보기, 텔레그램 제어 등을 하나의 운영 흐름으로 유지하는 로컬 퍼스트 AI 워크벤치입니다.

값비싼 단일 모델이나 고성능 장비 하나에 의존하지 않습니다. 동일한 대시보드에서 Groq, Gemini, Cerebras, NVIDIA NIM, Copilot, Codex 등을 활용할 수 있으며, 그 결과를 파일, 로그, 미리보기, 복구 가능한 실행 스냅샷으로 보관합니다.

## 개발 목적

대다수의 AI 도구는 첫 답변 이후의 과정이 단절되는 문제가 있습니다.

- 생성된 파일과 명령어를 나중에 다시 찾기 힘듭니다.
- 웹 대시보드와 텔레그램 봇의 기능이 파편화되어 있습니다.
- 코딩 결과를 다시 실행하거나 비교, 검사하기 어렵습니다.
- 리팩터링 시 실제 적용될 결과를 미리 확인하지 못하고 덮어쓰는 경우가 많습니다.
- 예약된 작업, 채팅 컨텍스트, 검색, 핸드오프(Handoff) 노트가 각각 분리되어 관리됩니다.

omnux는 이렇게 흩어진 요소들을 하나의 작동하는 루프로 결합합니다.

| 일반적인 문제점 | omnux의 해결 방식 |
|---|---|
| 채팅과 실행 환경의 분리 | 대화, 코딩 결과, 로그가 지속적으로 연결됨 |
| LLM 제공자 비교의 번거로움 | 단일, 오케스트레이션, 다중 LLM 모드가 채팅과 코딩 모두에서 동작 |
| 웹과 텔레그램의 기능 파편화 | 두 인터페이스 모두 동일한 CommandService 레이어 공유 |
| 리팩터링의 위험성 | 변경사항 미리보기(Preview) 및 안전한 반영(Guarded apply) |
| 운영 상태 파악 불가 | `/healthz`, `/readyz`, `doctor --json` 지원 |

## 주요 기능 (2026년 6월 최신화)

- **운영(Ops) 관리 강화**: 크론(Cron) 스케줄러, 텔레그램, 재시도, 노드 관리, Guard Dispatch 등의 운영 패널(Ops Panels)이 새롭게 추가되었습니다.
- **강력한 보안 경계 (Security Boundaries)**: 원격 대시보드 OTP 요청 차단 및 원격 세션의 제한된 모드(Limited Mode)가 자동 적용됩니다. WebSocket Origin 검사 및 마크다운 raw HTML 차단이 포함됩니다.
- **미디어 위젯 개선**: 재생 시간 바운스(seek bounce) 문제 수정 및 전반적인 미디어 트랜스포트 제어가 개선되었습니다.
- **미들웨어 안정화**: 인증 시 발생하던 레이스 컨디션(auth race) 현상이 수정되었습니다.
- **채팅 및 코딩**: 단일 모델, 오케스트레이션, 다중 LLM 비교, Think+, URL/검색/메모리 컨텍스트, TTS 기능 지원.
- **검색 및 통합**: Gemini 검색 연동(Grounding), 쿼리 재작성, 캐시 폴백 지원.
- **Routines (자동화)**: 자연어로 루틴 생성, 즉시/예약 실행, 브라우저 에이전트, 텔레그램 알림.
- **Logic Graph**: 노드 캔버스 위에서 채팅, 코딩, 루틴, 도구를 연결.
- **Safe Refactor**: AST 기반 검색/치환 기능과 미리보기(Preview)를 통한 안전한 코드 편집.
- **Skills**: `SKILL.md` 기반의 에이전트 스킬 정의, 채팅 및 텔레그램 동작 공유.

## 빠른 시작 (Quick Start)

macOS/Linux 전역 실행기:

```bash
omnux setup
omnux
omnux shutdown
```

처음 클론한 경우 `./scripts/omnux setup`을 먼저 실행하세요. 종속성 설치, 미들웨어 빌드, `npm test`를 수행하고 실행기를 등록합니다.

수동 실행:

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj
```

Windows:

```powershell
.\scripts\omnux.ps1 setup
dotnet run --project apps\omnux-middleware\Omnux.Middleware.csproj
```

접속 주소:

- 대시보드: [http://127.0.0.1:8080/](http://127.0.0.1:8080/)
- Health: [http://127.0.0.1:8080/healthz](http://127.0.0.1:8080/healthz)
- Ready: [http://127.0.0.1:8080/readyz](http://127.0.0.1:8080/readyz)

## 지원 제공자 (Providers)

| Provider Key | Label | Integration |
|---|---|---|
| `gemini` | Gemini | Google API 및 그라운딩 검색 |
| `groq` | Groq | OpenAI 호환 HTTP |
| `cerebras` | Cerebras | HTTP API |
| `nvidia` | NVIDIA NIM | OpenAI 호환 `https://integrate.api.nvidia.com/v1` |
| `copilot` | Copilot | `gh`/`copilot` CLI |
| `codex` | Codex | `codex` CLI 또는 API Key |

*참고: 기존 `docs/` 폴더 내의 마크다운 가이드 문서들은 저장소 관리 정책에 따라 현재 Git 추적 목록에서 제외되었습니다.*
