# 정리 기준

[한국어](./CLEANUP.md) · [English](./en/cleanup.md)

업데이트 기준: 2026-09-12

omnux 환경의 디스크 공간을 정리할 때는 언제든 재생성 가능한 캐시 및 빌드 산출물과 반드시 보존해야 할 영속 데이터를 엄격히 분리합니다.

데스크톱 앱의 **상태 > 도구 > 정리** 메뉴는 정리 대상 후보를 먼저 탐색해 확인시켜 주며(`cleanup_preview`), 사용자가 확인한 미리보기 ID가 제공될 때만 실제 삭제를 수행합니다(`cleanup_apply`). 자동 탐색 대상은 `apps/.runtime`, `workspace/.runtime`, 각 서브프로젝트의 `bin`/`obj`/`.runtime`, 그리고 OS 임시 파일(`.DS_Store`)입니다. (버전 관리 디렉터리 `.git`은 무조건 제외됩니다.)

## 보통 지워도 되는 것

| 경로 | 이유 |
|---|---|
| `node_modules/` | `npm ci`로 복구된다 |
| `apps/omnux-middleware/bin/`, `obj/` | .NET 빌드 산출물 |
| `apps/desktop/dist/`, `apps/desktop/src-tauri/target/` | 데스크톱 빌드 산출물 |
| `workspace/coding/venv/` | 다시 만들 수 있는 가상환경 |
| `output/` | 검사 스크린샷과 픽스처. `npm test`가 다시 만든다 |

## 먼저 확인해야 하는 것

| 경로 | 들어 있는 것 |
|---|---|
| `workspace/coding/runs/` | 빌드 결과 파일 |
| `workspace/coding/routines/` | 자동화 실행 결과와 다운로드 자산 |
| `workspace/.runtime/logic/` | 로직 실행 추적 |
| `workspace/.runtime/tasks/` | task graph 로그 |

## 함부로 지우면 안 되는 것

`~/.omnux` 경로는 시스템 설정 및 운영 데이터의 단일 원본(SSOT)입니다. 대화 세션, 태스크 계획, 노트북 기록, 라우팅 정책, 텔레그램 상태가 보관되어 있으므로 별도 백업 없이 삭제해서는 안 됩니다. 데이터 백업은 **설정 > 데이터 > 백업**에서 제공하는 portable package 내보내기를 활용하세요.

Linux 환경에서 `setup`이 사용자 경로에 설치한 `~/.dotnet`과 `~/.cargo` 역시 `omnux` 런타임이 참조하는 핵심 도구군입니다.
