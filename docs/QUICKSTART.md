# omnux 5분 시작

[한국어](./QUICKSTART.md) · [English](./en/quickstart.md)

업데이트 기준: 2026-06-05

이 문서는 처음 실행할 때 필요한 것만 남긴 빠른 시작 가이드다. 자세한 기능 설명은 [사용법_빠른시작.md](./사용법_빠른시작.md)를 보면 된다.

![대시보드](./assets/readme/dashboard-desktop-1920x1080.png)

## 1. 준비물

| 도구 | 용도 |
|---|---|
| `.NET SDK 9` | 미들웨어 빌드와 실행 |
| `python3` | 샌드박스와 코딩 검증 |
| `node`, `npm` | 계약 테스트와 데스크톱 빌드 |
| Rust toolchain | Tauri 데스크톱 앱 빌드(선택) |
| 선택: `gh`, `copilot`, `codex` | Copilot/Codex CLI 연동 |

LLM 키는 하나 이상만 있어도 시작할 수 있다. 키는 설정 탭에서 저장하거나 `*_FILE` 환경변수로 지정한다.

## 2. 실행

### 미들웨어 + 웹 대시보드

전역 실행기가 등록되어 있으면 macOS/Linux에서는 아래 두 개로 충분하다.

```bash
omnux setup
omnux
omnux shutdown
```

처음 클론한 저장소에서는 `./scripts/omnux setup`을 먼저 실행한다. setup은 필수 도구 확인/설치, 미들웨어 빌드, `npm test`, 실행기 등록을 처리한다. setup marker가 없으면 `omnux` 첫 실행 때 자동 setup도 시도한다.

수동 실행은 두 단계다.

```bash
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj
```

Windows:

```powershell
.\scripts\omnux.ps1 setup
dotnet run --project apps\omnux-middleware\Omnux.Middleware.csproj
```

### Tauri 데스크톱 앱

데스크톱 앱은 미들웨어가 먼저 실행 중이어야 한다.

```bash
# 터미널 1: 미들웨어 실행
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj

# 터미널 2: 데스크톱 개발 서버
cd apps/desktop && npm run dev
```

데스크톱 앱은 실행 시 자동으로 미들웨어를 탐색한다. 기본 포트 8080부터 확인하고, 41880도 대안으로 시도한다.

## 3. 접속

| 인터페이스 | 주소 |
|---|---|
| 웹 대시보드 | `http://127.0.0.1:8080/` |
| 데스크톱 앱 | `http://127.0.0.1:1420/` (개발 모드) |
| health | `http://127.0.0.1:8080/healthz` |
| ready | `http://127.0.0.1:8080/readyz` |

처음 접속하면 WebSocket 세션은 OTP 대기 상태가 된다. 텔레그램이 설정되어 있으면 OTP를 텔레그램으로 받고, 로컬 개발 환경에서는 콘솔 fallback OTP를 사용할 수 있다.

## 4. 첫 확인 순서

1. Home 화면이 열리고 상단 상태가 `미들웨어 연결됨` 또는 `인증 필요`인지 본다.
2. Settings → Models & Services에서 사용할 LLM 키 또는 CLI 인증 상태를 확인한다.
3. Ask에서 짧은 질문을 보낸다.
4. Build에서 작은 변경 계획/미리보기를 실행한다.
5. Explore에서 웹 검색을 시도한다.
6. `readyz`와 운영 화면 Doctor로 상태를 확인한다.

## 5. 외부접속

외부접속은 기본 꺼짐이다. 로컬 대시보드의 설정 탭에서 토글을 켜면 같은 LAN의 다른 기기에서 접속할 수 있고, 설정 화면에 접속 주소가 표시된다. 외부 클라이언트는 OTP 인증을 요청하지 않고 제한 모드로 자동 진입한다. 제한 모드는 읽기 중심 조회, 라우팅 정책, 모델 선택만 허용하고, 대화/코딩/루틴/로직 그래프 실행, OTP/CLI 인증, Telegram/LLM 키, 외부접속 토글 변경은 차단한다.
