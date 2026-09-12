# 5분 시작

[한국어](./QUICKSTART.md) · [English](./en/quickstart.md)

업데이트 기준: 2026-09-12

저장소 복제 후 애플리케이션을 최초 기동하기까지 필요한 절차를 정리했습니다. 화면별 상세 인터랙션은 [사용법](./사용법_빠른시작.md)을 참고하세요.

## 1. setup

```bash
./scripts/omnux setup
```

macOS는 Homebrew, Linux는 배포판 패키지 관리자(apt/dnf/yum/pacman/zypper/apk)를 사용합니다. 설정은 다음 순서로 진행됩니다.

| 단계 | 하는 일 |
|---|---|
| 필수 도구 | `node`, `npm`, `python3`, `sqlite3`, `curl`, `cc`, `make` 확인 및 미설치 항목 설치 |
| .NET SDK 9 | Linux 환경에 미설치된 경우 공식 `dotnet-install.sh`를 통해 `~/.dotnet`에 사용자 권한으로 설치 (sudo 불필요) |
| 데스크톱 의존성 | Linux 환경에서 GTK/WebKitGTK 개발 패키지 점검 및 설치 |
| 파이썬 추가 모듈 | tkinter, pygame, matplotlib, numpy, requests 등 환경 점검 |
| Rust | `cargo` 부재 시 rustup을 통해 `~/.cargo`에 설치 |
| 실행기 등록 | `omnux` CLI 실행 명령을 `~/.local/bin` 등 실행 경로에 심링크 연결 |
| Node 의존성 | `npm ci` 수행 및 Playwright Chromium 브라우저 바이너리 설치 |
| 검증 | 미들웨어 빌드, 샌드박스 스모크 검사, `npm test` 전체 실행 |

Linux 시스템 패키지 설치 시 sudo 권한을 요청합니다. 선택적 Python 모듈은 권한이 없으면 건너뛰고 진행합니다. `~/.dotnet`과 `~/.cargo` 경로는 `omnux` CLI 실행 시 자동으로 PATH 환경변수에 등록됩니다.

Windows 환경에서는 `.\scripts\omnux.ps1 setup`을 사용합니다.

## 2. 실행

| 명령 | 동작 |
|---|---|
| `omnux` | 데스크톱 앱 실행. 앱이 .NET 미들웨어를 함께 기동 (`omnux desktop`과 동일) |
| `omnux start` | .NET 미들웨어만 백그라운드 서비스로 실행 |
| `omnux status` | 미들웨어 프로세스 실행 상태 점검 |
| `omnux shutdown` | 데스크톱 앱과 미들웨어 프로세스 전체 종료 (`omnux stop`과 동일) |

사전 환경 구성이 완료되지 않은 경우 `omnux` 및 `omnux start` 실행 시 `setup`이 자동 선행됩니다. Linux 데스크톱 앱은 GUI 그래픽 세션(Wayland 또는 X11)에서 실행해야 합니다.

## 3. 접속 주소

| 대상 | 주소 |
|---|---|
| 데스크톱 UI (개발 모드) | `http://127.0.0.1:1420/` |
| 미들웨어 API / WebSocket | `http://127.0.0.1:41880/`, `ws://127.0.0.1:41880/ws/` |
| health / ready | `http://127.0.0.1:41880/healthz`, `http://127.0.0.1:41880/readyz` |
| 외부접속 UI | `http://<LAN-IP>:1420/` |

## 4. 인증

최초 WebSocket 세션은 OTP 인증 대기 상태로 진입합니다. 텔레그램 연동 시 OTP가 텔레그램 봇으로 전송되며, 기본 로컬 OTP 폴백이 활성화되어 있어 `omnux` 실행 터미널 콘솔 또는 백그라운드 로그(`~/.omnux/cli/middleware.log`)에서 직접 OTP를 확인할 수 있습니다.

## 5. 첫 확인

```bash
curl -s http://127.0.0.1:41880/readyz
dotnet run --project apps/omnux-middleware/Omnux.Middleware.csproj -- doctor --json
npm test
```

LLM API 키는 최소 1개만 등록되어도 즉시 사용할 수 있습니다. 설정 화면의 **모델 > API 키**에서 등록하거나 `*_FILE` 환경변수를 통해 지정할 수 있습니다.

## 6. 외부접속

외부 접속은 기본적으로 비활성화되어 있습니다. **설정 > 보안 > 외부 접속**을 활성화하면 동일 LAN 대역의 기기에서 접속할 수 있습니다. 외부 클라이언트는 OTP 없이 제한 모드로 연결되며, 읽기 중심 조회와 라우팅 정책 및 모델 선택만 허용됩니다. 대화·코드 생성·루틴·로직 그래프 실행, 인증 토큰 발급, 텔레그램 및 LLM API 키 변경, 외부 접속 설정 수정은 엄격히 차단됩니다.
