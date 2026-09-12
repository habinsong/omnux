# 정리 기준

[한국어](./CLEANUP.md) · [English](./en/cleanup.md)

업데이트 기준: 2026-09-12

omnux는 작업 산출물이 많이 생긴다. 지워도 되는 캐시와 보존해야 하는 상태를 가른다.

데스크톱 **상태 > 도구 > 정리** 패널은 정리 후보를 먼저 보여 주고(`cleanup_preview`), 선택한 미리보기가 있을 때만 삭제한다(`cleanup_apply`). 후보는 `apps/.runtime`, `workspace/.runtime`, `apps/` 아래 `bin`·`obj`·`.runtime`, 그리고 `.DS_Store`다. `.git` 안의 파일은 후보에서 뺀다.

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

`~/.omnux` 아래는 설정과 기록의 원본이다. 대화, 계획, 노트북, 라우팅 정책, 텔레그램 offset이 들어 있으므로 백업 없이 삭제하지 않는다. 백업은 **설정 > 데이터 > 백업**의 portable package로 만든다.

Linux에서 setup이 설치한 `~/.dotnet`, `~/.cargo`도 `omnux`가 쓰는 도구다.
