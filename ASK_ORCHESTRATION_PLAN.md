# 질문(Ask) 탭 자동 오케스트레이션 계획

작성: 2026-06-10 · 근거: 실코드 전수 추적 (프론트 `ask-store.ts` → `desktop-message-gateway.ts` → 미들웨어 `WsAiCommandDispatcher` → `CommandService.Chat.cs` 2,268줄 + WS 요청 타입 ~120종 인벤토리)

**목표 한 줄**: 사용자가 질문탭에 프롬프트만 입력하면 — RAG·메모리·웹·프로젝트 컨텍스트·스킬·규칙·라우팅·후속 액션(계획/루틴/에이전트)이 **자동으로** 판단·합류·실행되어 좋은 답이 나온다.

---

## 0. 현재 파이프라인 실태 (실코드 확정)

### 0.1 프롬프트 전송 시 실제 흐름 (`llm_chat_single`)
```
입력 → ask-store.sendMessage
  → ws: llm_chat_single {text, provider, models, thinkPlus, memoryNotes(수동선택만), attachments, webUrls, webSearchEnabled:true}
  → WsAiCommandDispatcher → CommandService.ChatSingleWithStateCoreAsync:
     1. 브라우저 intent 감지 (TryHandleBrowserChatIntent)
     2. 로컬 self-info / copilot usage 응답
     3. 스킬: 인라인 활성화 구문 + 단일 @멘션만 (의도 기반 자동선택 없음)
     4. 라우팅: provider=auto → ResolveCategoryProviderAsync(GeneralChat) ← 라우팅 정책 연동됨
     5. URL 감지 → Gemini URL-context 단독 경로
     6. fast-web 결정(휴리스틱 3종 + LLM 자가판단) → Gemini grounded 검색 단독 경로
     7. PrepareInputForProvider (첨부/비전 변환)
     8. Think+ (수동 토글시) 컨텍스트 prepend
     9. BuildContextualInput = [컨텍스트 사용 규칙] + 메모리노트(링크된 것+수동선택, 최대4, 900자 절단)
        + [최근 대화](후속질문 판단시, 5200자 예산) + 로컬시간 힌트
    10. 생성 → off-topic 재시도 가드 → 인용 검증 → list-count fallback
    11. 저장 + 비동기 유지보수(제목 자동생성, 임계 초과시 자동압축→linked note)
```

### 0.2 기능별 연결 매트릭스

| 기능 | 백엔드 | 질문탭 자동 | 현재 접근 방법 | 판정 |
|---|---|---|---|---|
| 라우팅 정책 | `routing_policy_*`, ResolveCategoryProviderAsync | ✅ | provider=auto | **연결됨** |
| 웹 검색 | Gemini grounding + 가드 + 인용 | ✅(부분) | fast-web 자동 결정 | 연결됨, 단 **Gemini 단일의존**(429시 전멸), `web_search`/`web_fetch`(explore) 폴백 미사용 |
| URL 참조 | Gemini URL-context | ✅ | 본문 URL 자동 감지 | 연결됨 |
| 대화 히스토리 | ConversationContextPolicy | ✅ | 후속질문 자동판단 | 연결됨 |
| 메모리 **읽기** | memory note 로드 | ⚠️ 부분 | 대화에 링크된 노트 + **수동 선택**만 | **자동 관련성 회수 없음** |
| 메모리 **검색** | `memory_search` + 인덱스(`memory_index_rebuild`) | ❌ | RAG 패널 수동 버튼 | **미연결** |
| 메모리 **적재** | `create_memory_note` | ⚠️ | 수동 버튼 / 자동압축시만 | 대화중 사실 자동추출 없음 |
| RAG 파이프라인 | `rag preflight` + 후보실행(ask-rag.ts) | ❌ | "검색 점검" 수동 버튼 → 결과 **표시만**, 답변에 미주입 | **미연결 (최대 갭)** |
| 프로젝트 컨텍스트(자기참조) | `context_scan`(ScanProjectContext), `read_workspace_file` | ❌ | 문맥 패널 수동 → "입력에 붙이기" | **미연결** |
| 스킬 | `skills_list/get/save`, ApplySelectedSkillToPrompt | ⚠️ | @멘션/인라인 구문만 | **의도 기반 자동선택 없음** |
| 규칙/페르소나 | — | ❌ | — | **백엔드 자체 부재** |
| 노트북 | `notebook_append/get` | ❌ | 답변 NB 버튼(수동 저장만) | 자동 회수/기록 없음 |
| 계획/작업 | `plan_*`, `task_graph_*`, `task_*` | ❌ | PL 수동 버튼 | "계획 세워줘" 의도 미감지 |
| 자동화/루틴 | `create_routine/run_routine/preview_routine` | ❌ | 수동 버튼 | "매일/매주 ~해줘" 의도 미감지 |
| 에이전트/세션 | `sessions_spawn/send/history` | ❌ | Agents 탭 전용 | 긴 작업 위임 없음 |
| 코딩 도구 | `coding_run_*`, refactor/git/doctor/lsp | ❌ | Build 탭 전용 | Ask에서 코드질문시 미활용 |
| 로직 그래프 | `logic_graph_run` | ❌ | Logic 탭 전용 | 미연계 |
| 비전 | clipboard_vision_preflight + 첨부변환 | ⚠️ | 첨부는 자동, preflight는 수동 | 부분 |
| 음성(STT/TTS) | ask-speech | ✅ | 위젯 | 연결됨 |
| **도구 호출 루프(tool-use)** | — | ❌ | — | **백엔드 자체 부재 — 모든 "자동"이 prepend 휴리스틱** |
| 크로스 대화 참조 | `conversation_search`, `sessions_history` | ❌ | 보관함 수동 검색 | 미연결 |
| 텔레그램 측 채팅 | CommandService.Execution(슬래시/자연어 명령 라우팅) | — | 텔레그램 전용 | **대시보드 채팅과 기능 격차**: 텔레그램엔 자연어 명령·스킬 alias 라우팅이 더 풍부 |

### 0.3 구조적 문제 (개별 기능 이전의 근본)
1. **단일 의도 결정 지점 부재** — fast-web만 "결정"이 있고 나머지(메모리/프로젝트/스킬/계획/루틴/에이전트)는 결정 자체가 없다. 경로들이 early-return 체인이라 **상호 배타적**(웹 경로 타면 메모리노트 힌트 일부 외 컨텍스트 합류 없음).
2. **검색=답변 경로 분리 실패** — RAG preflight는 "무엇을 찾을지" 잘 판단하는데(후보: memory_search/web_search/context_scan/session_replay…) 그 결과가 **사용자 눈에 보여줄 뿐 모델 입력에 합류되지 않음**.
3. **도구 루프 부재** — provider tool-calling을 안 쓰므로 모델이 "메모리 찾아봐야겠다/파일 봐야겠다"를 스스로 못 한다. 전부 사전 휴리스틱.
4. **웹검색 단일 장애점** — Gemini 키/쿼터 죽으면(실사례: prepay 429) 웹 의도 질문 전체가 "검색 실패". explore의 `web_search`/`web_fetch` 폴백 미합류.
5. **후속 액션 단절** — 답변이 끝이고, 계획/루틴/노트북/에이전트로 이어지는 건 전부 사용자가 버튼을 찾아야 한다.

---

## 1. 목표 아키텍처

```
프롬프트
  └→ [A] IntentPlanner (1회 경량 LLM call + 휴리스틱 단락)
        의도벡터: {web, url, memory, project_ctx, notebook, skill, vision,
                   plan, routine, agent_delegate, coding, none…} + 신뢰도
  └→ [B] ContextAssembler (병렬 회수, 토큰예산 배분)
        web(grounded→폴백 web_search) ∥ memory_search(top-k) ∥ context_scan(요약 캐시)
        ∥ notebook 관련항목 ∥ 크로스대화 ∥ 규칙/페르소나(항상)
        → 예산 내 컨텍스트 블록 합성 (출처 라벨 포함)
  └→ [C] Generator (기존 단일/오케스트레이션/멀티 + 스트리밍 유지)
        + (P2) provider tool-use 루프: memory.search / web.search / project.read
  └→ [D] PostActions
        의도가 plan/routine/agent면: 답변 + 실행 제안 카드(원클릭 plan_create/create_routine/sessions_spawn)
        메모리 가치 판단 → 자동 사실 적재(중복 가드)
        노트북 자동 기록(옵트인)
```

원칙:
- **early-return 체인 → 합류(merge) 구조**로 전환. 웹/메모리/프로젝트는 배타가 아니라 동시 합류.
- 모든 자동 결정은 **응답 메타에 표기**(어떤 소스가 합류됐는지) + 설정에서 끌 수 있게.
- 기존 WS 계약/수동 버튼은 유지(회귀 0). 자동화는 그 위에 얹는다.

---

## 2. 작업 목록 (전체)

### P0 — 연결 수정 (백엔드 존재, 미배선) 

**P0-1. AskRetrievalOrchestrator 신설 — RAG를 답변 경로에 합류** ★최대 효과 — ✅ **완료 (2026-06-10)**
> 구현: `Application/Ask/AskAutoRetrievalPolicy.cs`(순수 정책) + `CommandService.AskRetrieval.cs`(실행/타임박스/감사) + `BuildContextualInput`에 `[자동 참조 자료]` 섹션 + 채팅 3경로(단일/오케/멀티) 배선 + Route 배지(`project 2` 식).
> 검증: 단위테스트 35/35, 라이브 WS E2E — `ask_auto_retrieval ok elapsedMs=105 merged=2`, route='project 2'.
> 발견: memory_search 인덱스는 memory(노트)+project(워크스페이스 1,796파일)+sessions를 모두 색인하며 부팅 시 자동 sync — P0-2와 P0-3의 상당 부분을 한 번에 커버. 노트 폴더는 현재 비어 있어 memory 소스는 P1-3(자동 적재) 후 실효.
- 신규: `src/Application/Ask/AskRetrievalOrchestrator.cs`
- 입력: rawInput + 대화ID. 내부에서 기존 RAG preflight 로직 재사용 → 추천 후보 상위 N개를 **서버측에서 즉시 실행**(memory_search, context_scan 캐시, conversation_search) → `[참조 자료]` 블록 생성.
- `ChatSingleWithStateCoreAsync`의 BuildContextualInput 직전에 호출, 결과를 contextualInput에 합류.
- 타임박스: 병렬 800ms~1.5s, 실패시 무합류로 통과(현행과 동일 동작).
- 응답 메타에 `retrieval: memory 2건·project 1건` 표기.
- 토글: `OMNUX_ASK_AUTO_RETRIEVAL`(기본 on) + 설정탭 스위치.

**P0-2. 메모리 자동 회수** — ✅ **완료 (P0-1에 포함, 2026-06-10)**
- P0-1의 1순위 소스. `memory_search`(기존 인덱스) top-k=4, 점수 임계, 900자/노트 절단 재사용.
- 현재 "링크된 노트만 로드" 로직과 병합 시 중복 제거(MemoryNoteSelectionPolicy.MergeNames 확장).

**P0-3. 프로젝트 컨텍스트(자기참조) 자동 합류** — ✅ **완료 (2026-06-11)**
> 구현: 구조형 자기참조 어휘("이 프로젝트 구조/등록된 스킬/AGENTS.md…") 감지 시 `ProjectContextLoader.BuildPromptContext` 요약(5분 TTL 캐시)을 네 번째 소스로 합류. 라벨: 단독 "프로젝트 개요", 혼합 "참조 N".
> 검증: 정책/결합 테스트 · 라이브 E2E — route='참조 3', 실제 루트 경로·AGENTS.md 정확 답변(147ms). 파일 내용 검색(P0-1 project 인덱스)과 상호 보완.
> 참고: "스킬 목록" 질문은 기존 로컬 self-info 핸들러가 선처리(LLM 없이 정답) — 의도된 중복 방어.
- `ScanProjectContextAsync` 결과를 **요약 캐시**(파일트리+핵심 신호, TTL 5분)로 유지.
- IntentPlanner(P1-1) 전이라도 휴리스틱으로: 코드/파일/프로젝트 어휘 감지시 캐시 요약 합류.
- 대상 프로젝트: metaDraft.project → projects_list 매칭 → 기본 워크스페이스.

**P0-4. 웹검색 폴백 체인** — ✅ **완료 (2026-06-10)**
> 구현: Groq compound(`groq/compound-mini`, 서버측 Tavily 웹검색 내장)를 최후 폴백으로 추가.
> `GroqCompoundWebSearch.cs`(파서) + `LlmRouter.GenerateGroqCompoundWebAnswerAsync`(30s 타임박스, 413 1회 재시도) + `ComposeGroundedWebAnswerWithFallbackAsync` 3단계 배선(composer 실패 텍스트/예외 시) + `SearchRetrieverPath.GroqCompound` + 인용 매핑.
> 검증: 파서 테스트 11종 포함 전체 1,335/1,335 · 장애주입(Gemini connection refused) 라이브 E2E — route='groq-compound-web', sources=5, 실제 뉴스+출처 응답.
> 제약(실측): ① 413 request_too_large 는 compound 가 끼우는 검색 덤프 크기에 따른 확률적 실패 → 1회 재시도로 완화. ② free tier 는 compound 요청/토큰 한도가 좁아 연속 폴백 시 429 가능 — 그 경우 기존 실패 메시지로 안전 통과. ③ 끄기: `OMNUX_WEB_FALLBACK_GROQ_COMPOUND=0`, 모델 변경: `OMNUX_GROQ_COMPOUND_MODEL`.
> 원래 계획(explore `web_search` 합류) 대신 compound 채택 — 사용자 제안 검토 결과 단일 호출로 검색+합성+인용이 끝나 가드 파이프라인 재구현 불필요.
- `ComposeGroundedWebAnswerWithFallbackAsync`에 폴백 단계 추가: Gemini grounded 실패(키없음/429/timeout) → explore `web_search`(비-Gemini 경로) 결과를 `[웹 검색 결과]` 블록으로 만들어 **일반 LLM 경로로 합류**(검색 실패 메시지로 끝내지 않기).
- 폴백시에도 인용/가드 정책 적용(완화 모드: 출처 URL 필수, freshness 가드는 경고로 강등).

**P0-5. 스킬 자동 선택(보수적)** — ✅ **완료 (2026-06-11)**
> 구현: `AskSkillAutoSelectPolicy` — "스킬 이름이 입력에 등장하는 스킬이 정확히 하나"일 때만 자동 적용(연결형 매칭으로 'code review'↔'code-review'·한글 조사 결합 커버, 토큰1개·길이<4 가드). 명시 멘션/UI 선택/스레드 바인딩이 있으면 양보. Route 배지 `skill:<name>(auto)`.
> 검증: 정책 테스트 16종 · 라이브 E2E — 공백형 "code review" 입력에 route='skill:code-review(auto) · project 2' + audit `ask_skill_auto_select ok`. (정확 문자열 멘션은 기존 인라인 감지가 선처리 — 설계대로.)
> 끄기: `OMNUX_ASK_SKILL_AUTO_SELECT=0`. 설명 키워드 매칭·다중 후보 제안 칩은 P1-1로 격상.
- `skills_list` 메타(이름/설명/트리거 키워드)와 입력의 토큰 매칭 점수 → 단일 후보 & 고신뢰일 때만 자동 적용 + 응답 메타 `skill:<name>(auto)` 표기.
- 신뢰 미달이면 현행 유지. 다중 후보면 적용하지 않고 답변 하단 제안 칩.

**P0-6. 계획/루틴/에이전트 "의도 → 제안 카드" (실행은 원클릭)** — ✅ **완료 (2026-06-10)**
> 구현: `AskActionSuggestionPolicy`(보수적 한국어 휴리스틱, "매일경제" 가드, 최대 2개, 우선순위 루틴>에이전트>계획) → `ConversationChatResult.ActionSuggestions` → `llm_chat_result.actionSuggestions` 직렬화. 단일 채팅 3경로(URL/웹/일반) 모두 첨부. 프론트: 답변 하단 primary 톤 pill 칩 → 클릭 시 기존 WS(`plan_create`/`create_routine`/`sessions_spawn`) 그대로 호출(자동 실행 없음).
> 검증: 정책 테스트 25종 포함 전체 1,360/1,360 · 라이브 WS E2E 3종 — 루틴 의도(웹검색 경로 공존), 계획 의도(P0-1 자동회수 route='project 2'와 공존), 일반 질문 오탐 0.
> 끄기: `OMNUX_ASK_ACTION_SUGGESTIONS=0`. 비고: 루틴 카드는 manual 스케줄로 생성(스케줄 자연어 파싱은 P1-1 IntentPlanner에서).
- 휴리스틱(+P1 LLM 분류): "계획 세워/단계로 나눠" → 답변 + `plan_create` 제안 카드(초안 페이로드 채워서), "매일/매주/시 마다" → `preview_routine` 카드, "백그라운드로/시켜놔" → `sessions_spawn` 카드.
- 자동 실행은 하지 않음(사용자 주도권 원칙) — 카드 버튼 = 기존 WS 타입 그대로 호출.
- 프론트: MessageActions 옆 제안 카드 렌더(이미 있는 NB/PL 버튼 패턴 재사용).

**P0-7. 비전 preflight 자동화** — ✅ **완료 (2026-06-11)**
> 구현: 컴포저 `addAttachments` 에서 이미지 감지 시 `clipboard_vision_preflight` 자동 실행(기존 수동 버튼과 동일 WS·동일 상태) → AskVisionPanel 이 용량/포맷 문제를 전송 전에 안내. 수동 버튼 유지. tsc 0에러.
- 이미지 첨부시 `clipboard_vision_preflight` 자동 실행 → 부적합(용량/포맷)이면 전송 전에 안내. 수동 버튼 유지.

**P0-8. 크로스 대화 참조** — ✅ **완료 (2026-06-11)**
> 구현: 회고 어휘("지난번/저번에/전에 말한…") 감지 시에만 과거 대화 검색. 공용 conversation_search(FTS+인덱스 sync, 콜드 1.2s 초과)는 우회하고 **스토어 인메모리 직접 토큰 OR 스캔**(104KB 저장소 → 수 ms). 현재 대화 제외·대화당 1건·상위 2건, 메모리 블록과 결합(라벨: 단독 "대화 N", 혼합 "참조 N"). 부분 수확 구조로 한 소스가 늦어도 나머지는 합류.
> 검증: 정책 테스트(회고 게이트·쿼리 정리·결합·스캔) · 라이브 E2E — "저번에 물어본 텔레그램 답장…" → route='참조 4', audit `memory=2 conversations=2 elapsedMs=122`.
- P0-1 소스에 `conversation_search`(top-2, 현재 대화 제외) 추가. "지난번에/저번 대화에서" 어휘 감지시 가중.

### P1 — 신규 핵심 기능

**P1-1. IntentPlanner 단일 결정 지점** — ✅ **완료 (a+b핵심+c, 2026-06-11)**
> **P1-1a(완료)**: `AskIntentPlanner.Plan(input)` — 회수/과거대화/프로젝트개요/제안카드 게이트를 단일 의도 스냅샷(`AskIntentPlan`)으로 통합, 채팅 3경로가 결과만 소비. 감사로그 `ask_intent_plan`("retrieval+conversations | sugg:routine" 형식). 동작 변화 0 검증(기존 E2E 라벨 동일) · 전체 1,403/1,403.
> **P1-1b(핵심부 완료 2026-06-11)**: ① fast-web 휴리스틱 3종을 `AskIntentPlanner.ResolveWebIntentHeuristic` 으로 이동(결정 소유권 단일화; Undecided 시 기존 provider LLM 자가판단 위임 — E2E 동작 동일 확인). ② 루틴 스케줄 자연어 파서 `AskRoutineSchedulePolicy`("매일 아침 9시"→daily 09:00, "매주 월수금 7시"→weekly[1,3,5], "평일 8시 반", "매달 N일", 분리형 시간대 문맥 보정) → 제안 카드에 스케줄 프리필 + 라벨 표기("루틴 만들기 (매주 월 09:00)") → 카드 클릭 시 실제 스케줄로 create_routine. 테스트 포함 전체 1,417/1,417.
> **P1-1b 잔여**: 미결정 영역 경량 LLM 의도벡터 1콜(JSON, 800ms) — Undecided web 분류를 통합 콜로 대체 + 스킬 설명(desc) 매칭 격상. P1-1c 와 함께 진행 권장.
> **P1-1c(완료 2026-06-11)**: 계획의 "웹 블록화 합류"는 인용·가드 파이프라인 훼손 위험으로 **역방향 합류**로 결정 — 자동 회수(P0-1/3/8)를 URL/웹 분기보다 **선행 실행**하고 `AskAutoRetrievalPolicy.CombineWebContextHint`(1000자 캡, "웹 근거 우선" 명시)로 웹/URL 생성 힌트에 주입. Route 결합 표기(`gemini-web-single · 참조 3`). 일반 경로는 동일 결과 재사용(중복 검색 없음). E2E: 순수 웹 회귀 OK('gemini-web-single · project 1'), 혼합 질문에서 메모리1+과거대화2가 웹 답변에 합류(123ms). 전체 1,420/1,420.
- 신규: `src/Application/Ask/AskIntentPlanner.cs`
- 1) 휴리스틱 단락(기존 SearchQueryPolicy 3종 + 신규 어휘 사전) → 2) 미결정시 경량 모델 1콜(JSON 의도벡터, 800ms 타임박스, 실패시 휴리스틱 결과).
- 기존 fast-web 결정(DecideNeedWebBySelectedProviderAsync)을 이 안으로 흡수. early-return 체인을 의도벡터 기반 **합류 플로우로 재배선**.
- 의도·근거·소요ms를 감사로그 + 응답 메타에 기록.

**P1-2. 규칙/페르소나 저장소 + 주입** — ✅ **완료 (2026-06-11)**
> 구현: `UserRuleStore`(state/user_rules.md 단일 문서, 저장 4,000자 캡, 줄경계 보존 주입 캡 600자, env `OMNUX_USER_RULES_PATH`) · WS `rules_get/save/delete`(설정 디스패처+게이트, rules_get 은 원격 read 허용) · `BuildContextualInput` 에 `[사용자 규칙]` 섹션 상시 주입("사용자가 직접 저장한 상시 지침… '내 규칙' 질문의 근거" 명시, 마커 누설 금지 목록 갱신) · 설정탭 "사용자 규칙" 패널(textarea+저장/삭제, zustand 브리지).
> 검증: 스토어 테스트 6종 포함 전체 1,455/1,455 · tsc 0 · 라이브 E2E — rules_save 왕복 → 일반 질문에 형식·말미 규칙 즉시 적용, "내가 정한 사용자 규칙?"에 저장 규칙 그대로 정답(**P1-3 의 flash-lite 선호 오답 한계를 권위 섹션으로 해소**).
> 비고: 프로젝트별 규칙은 v2. 스킬(단발 작업방식)과 역할 구분 명시.
- 신규: `UserRuleStore`(파일 기반, 전역/프로젝트별), WS: `rules_get/save/delete`, 설정탭 편집 UI.
- BuildContextualInput 최상단에 `[사용자 규칙]` 항상 주입(예산 600자). 스킬과 구분: 규칙=상시, 스킬=작업방식 단발.

**P1-3. 메모리 자동 적재(추출 파이프라인)** — ✅ **완료 (2026-06-11)**
> 구현: `AskMemoryCapturePolicy`(보수 게이트: 기억해/앞으로/기본으로/선호/프로필/규칙 선언만) → 경량 Groq 추출(JSON {memorable,title,fact}, 4s 타임박스, 220tok) → 제목키 중복 LRU(32)+일일 상한 8 → `IMemoryNoteStore.Save("auto-memory", …)` → 인덱스 증분 sync(1분 스로틀). `ScheduleConversationMaintenance` 훅(백그라운드, UI 무소음, audit `ask_auto_memory`). 끄기: `OMNUX_ASK_AUTO_MEMORY=0`.
> 회수 보강: 부팅 풀 sync(67s)와의 경합으로 막 만든 노트가 FTS에 없을 수 있어 **노트 폴더 직접 스캔**(자체 토큰화 12개, 수 ms)을 FTS 결과에 병합 — 신선도 100%. + 비-memory 소스에서 내부 프롬프트 마커 스니펫 제외 가드(자기 코드 오염 방지).
> 검증(라이브 E2E): "앞으로 …불릿 3개 이하로… 기억해" → audit ok + `답변 정리 규칙_auto-memory.md` 생성(추출 사실 정확) → "내 답변 정리 규칙 뭐였지?" → route='memory 1'(116ms) 합류. 정책 테스트 포함 전체 1,449/1,449.
> **알려진 한계(정직 기록)**: gemini-3.1-flash-lite 가 합류된 memory 노트 대신 시스템 [컨텍스트 사용 규칙] 섹션을 "사용자 규칙"으로 오인하거나 "저장된 선호 없음"으로 오답하는 사례 — 섹션 명시 지시 추가에도 잔존. 회수·합류는 정상이며 **생성 모델의 컨텍스트 활용 품질** 문제. 근본 해결 후보: ① 시스템 섹션 명칭 개명(어휘 충돌 제거, 회귀 검토 필요) ② P2 tool-use 로 모델이 memory.read 직접 호출 ③ 선호 질문 시 상위 모델 라우팅.
- ScheduleConversationMaintenance 확장: 턴 종료 후 비동기로 "기억할 사실?" 경량 분류 → 사실이면 `create_memory_note`(요약형, 중복 임베딩/제목 가드, 일일 상한).
- 적재시 응답엔 표시하지 않고 활동 로그에만 기록(소음 금지). 설정 토글.

**P1-4. 노트북 자동 연계** — ✅ **완료 (2026-06-11)**
> 구현: `AskNotebookPolicy`가 노트북/이전 결정/검증/배운 점/이어보기 회수 의도와 명시적 자연어 append를 분리한다. 기존 4개 문서(`learnings/decisions/verification/handoff`)를 새 인덱스 없이 `AskRetrieval` 병렬 소스로 합류하고, 웹/URL/일반 경로가 같은 `autoRetrieval` 결과를 재사용한다. "노트북에 결정으로 기록해: ..."처럼 저장 대상이 분명한 요청은 외부 LLM 없이 `NotebookService.AppendEntry`로 처리하며 `notebookAction {ok,kind,message,projectKey}` 메타를 반환한다. 기존 Ask 입력 준비의 노트북 주입은 web/chat에서만 우회해 중복을 제거하고 coding·텔레그램 경로는 유지했다.
> 검증: 정책/회수/응답계약/실파일 저장 테스트 포함 관련 108/108, 미들웨어 전체 1,484/1,484, 빌드 경고 0·오류 0, `npm test` 통과. 격리된 실제 WS E2E에서 자동 append(`local:notebook_append`, decision 1회 저장), 자동 회수(`route='notebook 1'`, 저장 결정 답변), 설명 요청 오탐 0, 기존 `notebook_append/get` 회귀 통과.
> 설계 변경: 제목/태그 검색 인덱스는 현재 프로젝트당 고정 4문서 구조에 비해 복잡도가 커서 만들지 않고, 최근 문서 컨텍스트를 의도 기반으로 선택 합류했다.
- 회수: P0-1 소스에 notebook 검색 추가(제목/태그 인덱스 신설 — `notebook_get` 확장 또는 `notebook_search` 신규).
- 기록: "기록해/메모해/노트북에" 의도 → 자동 `notebook_append` + 확인 메타.

**P1-5. 오케스트레이션 모드 재정의**
- 현재 orchestration=워커 합치기. 재정의: IntentPlanner가 복합작업 판단시 **단계 분해 → 단계별 retrieval/생성 → 종합**(기존 ChatOrchestration 코어 재사용, 단계간 컨텍스트 전달).
- multi(비교)는 현행 유지.

**P1-6. 텔레그램-대시보드 기능 패리티 정리**
- 텔레그램 전용 자연어 명령 라우팅(NaturalCommandPolicy, 스킬 alias)을 CommandService.Execution에서 분리 → 대시보드 채팅에도 동일 적용(슬래시/자연어로 "루틴 목록 보여줘" 등).

### P2 — 도구 호출(tool-use) 런타임

**P2-1. ToolRuntime 코어**
- 신규: `src/Application/Tools/AskToolRuntime.cs` — provider 함수호출(우선 Gemini/Copilot, OpenAI 호환 포맷) ↔ 미들웨어 도구 브리지.
- 1차 도구 세트(읽기 전용): `memory.search`, `memory.read`, `web.search`, `web.fetch`, `project.scan`, `project.read_file`, `notebook.search`, `conversations.search`, `routines.list`, `plans.list`.
- 루프 상한(3회), 도구별 타임박스, 모든 호출 감사로그 + 응답 메타 `tools: web.search×1, memory.search×1`.
- 쓰기 도구(plan.create, routine.create, notebook.append, sessions.spawn)는 **확인 카드 경유**(P0-6와 동일 UX)로만.

**P2-2. 스트리밍/가드 통합**
- 도구 루프 중간 상태를 ChatStreamUpdate로 전송("메모리 검색 중…"), 기존 인용·off-topic 가드를 최종 생성에만 적용.

**P2-3. IntentPlanner와 역할 분담**
- 플래너=사전 회수(빠른 80%), 도구 루프=모델 주도 보강(나머지 20%). 둘 다 켜졌을 때 중복 호출 가드(같은 쿼리 dedupe 캐시).

### P3 — 품질/운영

- **P3-1. 회귀 테스트**: 의도분류 골든셋(한국어 50문항: 웹/메모리/프로젝트/계획/루틴/잡담), retrieval 합류 스냅샷 테스트, 폴백 체인 단위 테스트(omnux-middleware-tests).
- **P3-2. 평가 루프**: 응답 메타에 합류 소스 기록 → Insights 탭에 "자동 합류 적중률" 패널(`get_usage_stats` 확장).
- **P3-3. 예산/지연 SLO**: 사전 회수 총 1.5s 상한, 컨텍스트 12k자 상한, 초과시 우선순위(규칙>메모리>웹>프로젝트>노트북) 절단. 지연 메트릭 감사로그.
- **P3-4. 설정 UI**: 설정탭 "자동 오케스트레이션" 섹션 — 마스터 스위치 + 소스별 토글 + 일일 자동적재 상한.
- **P3-5. 문서화**: 본 문서 갱신 + AGENTS.md에 파이프라인 다이어그램.

---

## 3. 우선순위·의존성·예상 규모

| 단계 | 항목 | 의존 | 규모(추정) |
|---|---|---|---|
| P0-1/2 | Retrieval 합류(메모리) | 없음 | 신규 1파일 + Chat.cs 합류점 1곳, ~400줄 |
| P0-4 | 웹 폴백 | 없음 | SearchPipeline 수정 ~150줄 |
| P0-3 | 프로젝트 컨텍스트 | P0-1 | ~200줄 + 캐시 |
| P0-6 | 제안 카드 | 없음 | 미들웨어 메타 + 프론트 카드 ~250줄 |
| P0-5/7/8 | 스킬자동/비전/크로스대화 | P0-1 | 각 ~100줄 |
| P1-1 | IntentPlanner | P0 완료 | 신규 ~350줄 + Chat.cs 재배선 |
| P1-2 | 규칙 저장소 | 없음(병행 가능) | 신규 스토어+WS+UI ~400줄 |
| P1-3/4 | 자동적재/노트북 | P1-1 | 각 ~200줄 |
| P1-5/6 | 오케스트레이션/패리티 | P1-1 | ~400줄 |
| P2-* | 도구 루프 | P1-1 | 신규 ~700줄 |
| P3-* | 테스트/평가/설정 | 각 단계 동반 | 지속 |

**권장 착수 순서**: P0-1+P0-2 (메모리 RAG 합류) → P0-4 (웹 폴백) → P0-6 (제안 카드) → P0-3 → P1-1 → 나머지.

## 4. 수용 기준 (대표 시나리오)
1. "내가 저번에 정한 모델 정책 뭐였지?" → 자동 memory_search 합류, 출처 노트명 메타 표기, 수동 버튼 0회.
2. "오늘 뉴스 브리핑" + Gemini 429 상태 → 폴백 web_search로 출처 포함 답변(검색 실패 메시지 금지).
3. "이 프로젝트에서 미디어 위젯 코드 어디야?" → context_scan 요약 합류, 파일 경로 답변.
4. "매일 아침 9시에 뉴스 요약해줘" → 답변 + 루틴 생성 카드 1클릭 → `create_routine` 성공.
5. "X 기능 출시 계획 세워줘" → 답변 + 계획 카드 → `plan_create` 성공.
6. 모든 자동 합류는 설정에서 끌 수 있고, 끄면 현행과 byte-동일 동작.
7. 사전 회수로 인한 첫 토큰 지연 증가 ≤ 1.5s (소스 실패시 0s).

## 5. 리스크 & 가드
- **지연**: 병렬+타임박스+실패시 무합류. 스트리밍 진행 표기로 체감 완화.
- **컨텍스트 오염**: 소스별 점수 임계 + 출처 라벨 + [컨텍스트 사용 규칙]에 "참조는 보조" 명시. off-topic 가드 기존 유지.
- **비용**: IntentPlanner는 경량 모델 고정(라우팅 정책의 fast-tier), 도구 루프 상한 3회.
- **회귀**: 모든 변경 기본 on이지만 단일 env로 전체 off 가능, 기존 WS 타입/수동 UI 불변, P3-1 골든셋으로 배선 검증.
- **텔레그램 영향**: Chat 코어 공유 — 합류 로직은 Source 무관 동작하되 텔레그램 출력 스타일 가드 기존 유지.
