# 실환경 수동 최종 회귀 체크리스트

[한국어](./OMNUX_실환경_수동_최종회귀_체크리스트.md) · [English](./en/manual-regression-checklist.md)

업데이트 기준: 2026-09-12

릴리스 직전에 사람이 직접 눌러 보는 체크리스트다. 자동 테스트가 통과해도 실제 데스크톱 앱과 텔레그램에서 깨지는 지점은 여기서 잡는다.

## 설치와 실행

- [ ] macOS와 Linux(Ubuntu)에서 `./scripts/omnux setup`이 `setup 완료`로 끝남
- [ ] `omnux` 실행 시 데스크톱 창이 뜨고 미들웨어가 함께 기동
- [ ] `omnux start` → `omnux status` → `omnux shutdown`
- [ ] `/healthz`, `/readyz`, `doctor --json`

## 데스크톱 앱

- [ ] 홈: 입력창, 바로가기, 이어서 작업하기, 활성 프로젝트
- [ ] 질문: 싱글·오케스트레이션·멀티 전환, 마크다운 렌더링
- [ ] 빌드: 실행 폴더 생성, 최근 결과 복원
- [ ] 자동화: 루틴 생성과 즉시 실행
- [ ] 탐색: 웹 검색, URL 가져오기, 브라우저
- [ ] 규칙: 로직 그래프 저장과 실행
- [ ] 작업: 계획 생성·리뷰·승인, 실행 중단과 이어가기
- [ ] 노트: 결정·확인·메모 저장과 이어보기 생성
- [ ] 도구: 스킬 목록과 활성화·중지
- [ ] 리뷰: Safe Refactor preview 생성
- [ ] 설정: 일반·모델·보안·연동·데이터·정보 여섯 탭과 provider 상태
- [ ] 테마 전환: Light, Glass, Dark
- [ ] Command Palette (⌘K / Ctrl+K)
- [ ] 좁은 폭에서 메뉴 버튼으로 내비 열기와 닫기

## 백업

- [ ] 설정 > 데이터 > 백업에서 portable package 설명, `portable-package-only` 동기화 모드, 충돌 정책 표시
- [ ] 백업 내보내기 포함 범위를 하나 이상 선택해야 export 가능
- [ ] 내보낸 ZIP에 `omnux-package.json` manifest와 파일별 `SHA-256`이 있고 API 키, Telegram token과 chat id, 인증 세션, 런타임 로그, outbox가 빠져 있는지 확인
- [ ] `omnux-package.json`과 ZIP entry 이름에 로컬 절대 경로, `..`, 절대 ZIP 경로, Windows backslash가 없는지 확인
- [ ] 가져오기 미리보기에서 대화 ID 충돌과 파일 충돌이 분리 표시되는지 확인
- [ ] overwrite=false 적용 시 기존 파일은 건너뛰고 overwrite=true 적용 시 교체되는지 확인
- [ ] 다른 머신 또는 별도 테스트 루트에서 import 후 `conversations.json`, `routines.json`, `routing-policy.json`, `memory-notes/`, `plans/`, `tasks/`, `notebooks/`, 전역·프로젝트 skills, 전역·프로젝트 commands가 대상 `~/.omnux`와 `workspace/.omni` 위치에 들어가는지 확인
- [ ] `omnux-package.json`은 import 대상 상태 파일로 저장되지 않는지 확인
- [ ] 외부 원격 머신에서 `node scripts/gist-bridge-remote-qa.mjs --token <GITHUB_TOKEN>` 실행 후 `outboundUploadOk`와 `inboundDownloadOk`가 모두 `true`인지 확인

## 외부접속과 보안

- [ ] 외부접속 토글과 주소 표시
- [ ] 외부 클라이언트 최초 접속 시 OTP 화면 없이 제한 모드 진입
- [ ] 외부 클라이언트에서 민감 설정 차단
- [ ] 외부 클라이언트에서 대화·코딩·루틴·로직 그래프 실행 차단
- [ ] 외부 클라이언트에서 읽기 중심 조회, 모델 선택, 라우팅 정책 변경 허용
- [ ] 인증 전 WebSocket 요청 거부와 Origin 차단 동작
- [ ] 루틴 이미지 프리뷰가 루틴 자산 경로 밖 파일을 열지 않는지 확인

## 텔레그램

- [ ] 텔레그램 자연어 명령과 일반 대화
- [ ] 미들웨어 Telegram polling 루프를 잠시 멈춘 뒤 `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180` 실행
- [ ] live QA 결과에서 `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk`가 모두 `true`
- [ ] 모바일에서 받은 `.txt` 첨부 파일을 다시 업로드했고, echo-back 문서 본문 `QA-ID` 확인으로 파일 첨부 수신이 판정되는지 확인
- [ ] 대형 코딩 결과가 본문 전체로 풀리지 않고 `/coding files`, `/coding download <번호>`, `/handoff` 안내로 좁혀지는지 확인
- [ ] 텔레그램 응답 어디에도 `omnux://` 링크가 없는지 확인
