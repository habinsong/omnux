# 실환경 수동 최종 회귀 체크리스트

[한국어](./OMNUX_실환경_수동_최종회귀_체크리스트.md) · [English](./en/manual-regression-checklist.md)

업데이트 기준: 2026-05-21

릴리스 직전에 사람이 직접 눌러 보는 체크리스트다. 자동 테스트가 지나도 실제 브라우저와 텔레그램에서 깨지는 지점은 여기서 잡는다.

## 대시보드

- [ ] `http://127.0.0.1:8080/` 접속
- [ ] 상태가 `연결됨 / OTP 대기` 또는 인증 상태로 표시
- [ ] 대화 탭에서 단일 응답 확인
- [ ] 코딩 탭에서 작은 파일 생성과 최근 결과 복원 확인
- [ ] 모바일 폭에서 composer 열기/닫기 확인

## 기능 탭

- [ ] 루틴 생성/즉시 실행
- [ ] 로직 그래프 저장/실행
- [ ] 노트북 기록 저장
- [ ] 작업 계획 생성/리뷰/승인
- [ ] 스킬 목록과 스킬 활성화/중지
- [ ] Safe Refactor preview 생성

## 설정과 운영

- [ ] provider 상태 표시
- [ ] 외부접속 토글과 주소 표시
- [ ] 외부 클라이언트 최초 접속 시 OTP 화면 없이 제한 모드 진입
- [ ] 외부 클라이언트 민감 설정 차단
- [ ] 외부 클라이언트에서 대화/코딩/루틴/로직 그래프 실행 차단
- [ ] 외부 클라이언트에서 읽기 중심 조회, 모델 선택, 라우팅 정책 변경 허용
- [ ] 외부 클라이언트에서 모델 선택과 라우팅 정책 변경 허용
- [ ] 인증 전 WebSocket 요청 거부와 Origin 차단 동작
- [ ] 루틴 이미지 프리뷰가 루틴 자산 경로 밖 파일을 열지 않는지 확인
- [ ] `/healthz`, `/readyz`, `doctor --json`
- [ ] 텔레그램 자연어 명령과 일반 대화
- [ ] 미들웨어 Telegram polling 루프를 잠시 멈춘 뒤 `node scripts/telegram-mobile-live-qa.mjs --timeout-sec 180` 실행
- [ ] live QA 결과에서 `outboundMessageOk`, `outboundDocumentOk`, `inboundTextAckOk`, `inboundDocumentEchoOk`가 모두 `true`
- [ ] 모바일에서 받은 `.txt` 첨부 파일을 다시 업로드했고, echo-back 문서 본문 `QA-ID` 확인으로 파일 첨부 수신이 판정되는지 확인
