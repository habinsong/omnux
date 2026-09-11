# 노트북 / 이어보기

[한국어](./NOTEBOOKS_AND_HANDOFF.md) · [English](./en/notebooks-and-handoff.md)

업데이트 기준: 2026-09-12

노트북은 작업 중 남길 말을 모으는 곳이다. LLM 답변을 다시 요약하는 기능이 아니라, 다음 세션에서 바로 이어갈 수 있게 작업 메모, 결정, 검증, handoff를 남긴다.

## 문서 종류

| 문서 | 파일 |
|---|---|
| 작업 메모 | `learnings.md` |
| 방향 정리 | `decisions.md` |
| 확인한 내용 | `verification.md` |
| 다음에 이어볼 것 | `handoff.md` |

기본 저장 위치는 `~/.omnux/notebooks/<project-key>/`다. 데스크톱은 **노트** 화면(남기기 · 결정 · 확인 · 메모 · 이어보기)에서 본다.

## 사용 흐름

1. 작업 중 생긴 메모를 기록한다.
2. 방향이 바뀌면 결정 내용을 남긴다.
3. 실제로 확인한 결과를 검증 기록에 쓴다.
4. 세션이 끝나기 전 handoff를 만든다.

질문 화면과 텔레그램 모두 `/notebook`, `/handoff` 명령을 쓴다.

## 텔레그램 handoff

텔레그램은 알림과 트리거에 가깝게 쓴다. 대형 코딩 결과, diff, 로그, 파일 본문, task output, doctor JSON은 텔레그램에서 전체를 풀지 않고 요약과 짧은 프리뷰만 보여 준다.

`/handoff [project-key]`를 실행하면 다음 기준점이 만들어진다.

- 로컬 문서: `~/.omnux/notebooks/<project-key>/handoff.md`
- 데스크톱 위치: 노트 화면의 이어보기 탭
- 텔레그램 응답: `projectKey`, `rootPath`, `handoffPath`, `updated`, 짧은 프리뷰

Deep link 최종 판단: 지금은 별도 데스크톱 deep link 프로토콜을 도입하지 않는다. 텔레그램 `/handoff` 응답은 `omnux://` 링크를 만들지 않고, 로컬 경로를 기준으로 데스크톱 앱의 노트 화면에서 이어간다. Phase 5에서 데스크톱 라우팅과 앱 프로토콜이 확정되면 그때 deep link를 별도 작업으로 재검토한다.
