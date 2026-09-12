# 5분 시작

[한국어](./QUICKSTART.md) · [English](./en/quickstart.md)

업데이트 기준: 2026-09-12

클론한 저장소에서 앱이 뜰 때까지 필요한 것만 적었다. 화면별 설명은 [사용법](./사용법_빠른시작.md)에 있다.

## 1. setup

```bash
./scripts/omnux setup
```

macOS는 Homebrew, Linux는 배포판 패키지 매니저(apt/dnf/yum/pacman/zypper/apk)를 쓴다. 이 순서로 돈다.

| 단계 | 하는 일 |
|---|---|
| 필수 도구 | `node`, `npm`, `python3`, `sqlite3`, `curl`, `cc`, `make` 확인하고 없으면 설치 |
| .NET SDK 9 | Linux에서 없으면 공식 `dotnet-install.sh`로 `~/.dotnet`에 설치한다. sudo가 필요 없다 |
| 데스크톱 의존성 | Linux에서 GTK/WebKitGTK 개발 패키지 확인하고 설치 |
| 파이썬 추가 모듈 | tkinter, pygame, matplotlib, numpy, requests 등 |
| Rust | `cargo`가 없으면 rustup으로 `~/.cargo`에 설치 |
| 실행기 등록 | `omnux` 명령을 `~/.local/bin` 같은 곳에 연결 |
| Node 의존성 | `npm ci`, Playwright Chromium 설치 |
| 검증 | 미들웨어 빌드, 샌드박스 smoke, `npm test` |

Linux 패키지 설치는 sudo 비밀번호를 묻는다. 선택 파이썬 모듈은 sudo를 얻지 못하면 건너뛰고 계속 진행한다. `~/.dotnet`과 `~/.cargo`는 `omnux` 명령이 알아서 PATH에 넣는다.

Windows는 `.\scripts\omnux.ps1 setup`을 쓴다.

## 2. 실행

| 명령 | 동작 |
|---|---|
| `omnux` | 데스크톱 앱 실행. 앱이 .NET 미들웨어를 함께 띄운다 (`omnux desktop`과 같다) |
| `omnux start` | 미들웨어만 백그라운드로 실행 |
| `omnux status` | 미들웨어 실행 상태 확인 |
| `omnux shutdown` | 데스크톱과 미들웨어를 모두 종료 (`omnux stop`과 같다) |

setup을 끝낸 적이 없으면 `omnux`와 `omnux start`가 setup부터 돌린다. Linux 데스크톱 앱은 그래픽 세션(Wayland/X11)에서 실행한다.

## 3. 접속 주소

| 대상 | 주소 |
|---|---|
| 데스크톱 UI (개발 모드) | `http://127.0.0.1:1420/` |
| 미들웨어 API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `http://127.0.0.1:41880/readyz` |
| 외부접속 UI | `http://<LAN-IP>:1420/` |

## 4. 인증

첫 WebSocket 세션은 OTP 대기 상태로 시작한다. 텔레그램이 설정되어 있으면 OTP가 텔레그램으로 간다. 로컬 OTP fallback이 기본으로 켜져 있어서, `omnux`로 실행했으면 터미널에, `omnux start`로 실행했으면 `~/.omnux/cli/middleware.log`에 OTP가 찍힌다.

## 5. 첫 확인

```bash
curl -s http://127.0.0.1:41880/readyz
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
npm test
```

LLM 키는 하나만 있어도 시작할 수 있다. 설정 화면의 **모델 > API 키**에서 저장하거나 `*_FILE` 환경변수로 지정한다.

## 6. 외부접속

외부접속은 기본 꺼짐이다. **설정 > 보안 > 외부 접속**에서 켜면 같은 LAN의 다른 기기가 접속할 수 있다. 외부 클라이언트는 OTP 없이 제한 모드로 들어오며 읽기 중심 조회, 라우팅 정책, 모델 선택만 된다. 대화·코딩·루틴·로직 그래프 실행, OTP/CLI 인증, Telegram/LLM 키 저장, 외부접속 토글 변경은 막는다.
