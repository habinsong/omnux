# Doctor

[한국어](./DOCTOR.md) · [English](./en/doctor.md)

업데이트 기준: 2026-09-12

Doctor는 운영할 때 가장 먼저 보는 진단이다. 아홉 가지를 한 번에 확인한다.

## 실행

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
```

`--json`은 순수 JSON만 출력한다. `--json` 없이 실행하면 사람이 읽는 형식으로 나온다. 텔레그램에서는 `/doctor`다.

## 검사 항목

| id | 확인하는 것 |
|---|---|
| `core_runtime` | .NET 코어 런타임 |
| `workspace` | 상태 루트의 JSON, `.bak`, `.lock`, 손상 JSON 개수 |
| `sandbox` | Python 실행기 |
| `sqlite` | SQLite |
| `provider_secrets` | provider 키 존재 여부 |
| `copilot` | Copilot CLI 설치와 인증 |
| `codex` | Codex CLI 설치와 인증 |
| `telegram` | 봇 토큰과 chat id |
| `search_pipeline` | 검색 경로 |

## 읽는 법

| 상태 | 뜻 |
|---|---|
| `ok` | 정상 |
| `warn` | 기능은 돌지만 확인이 필요하다 |
| `fail` | 해당 기능을 쓰기 전에 조치해야 한다 |
| `skip` | 이번 실행에서 확인하지 않았다 |

provider 키가 없으면 **설정 > 모델 > API 키**나 `*_FILE` 환경변수로 먼저 넣는다. Copilot이나 Codex가 CLI 인증을 요구하면 **설정 > 모델 > CLI 연결**에서 상태를 본다.

## 데스크톱에서

**상태 > 점검 > 환경 진단**에서 최근 결과를 본다. 복구 미리보기(`doctor_fix_preview`)가 최근 결과로 복구 계획을 만들고, 적용(`doctor_fix_apply`)은 그 미리보기 ID가 있을 때만 실행된다. 자동으로 하는 일은 빠진 디렉터리 생성뿐이다. API 키 입력, CLI 인증, 파괴적 정리는 자동으로 하지 않는다.
