# 레거시 정적 대시보드 대비 현재 omnux 앱 대시보드 누락 목록

기준일: 2026-06-04

비교 대상:

- 구 프론트엔드: 로컬 참조 백업의 정적 대시보드
- 현재 앱 대시보드: `apps/desktop/src/features`
- 제외 대상: 웹 대시보드. 이 문서는 Tauri/React 데스크톱 앱만 비교한다.

판정 기준:

- **반영됨**: 현재 앱에 같은 백엔드 요청과 주요 UI 흐름이 있다.
- **부분 반영**: 백엔드 요청 또는 기본 화면은 있으나 구 대시보드의 조작 단위/세부 상태/작업 연결이 빠졌다.
- **누락**: 현재 앱에서 같은 UI/요청/작업 흐름을 찾지 못했다.
- **의도적 보류**: 현재 앱 코드에 위험 명령이라 연결하지 않는다는 근거가 있다.

## 개발 진행 현황

- 완료: Activity 알림 ping/팝오버/상세 모달/Build handoff, 전역 선호도 store와 Settings 앱 표시/기본 프로젝트/전역 권한/TTS 세부 설정/사용자 단축키, Command Palette Ask/Build provider·모델 ID 전환, Skills 검색·템플릿·validation, Notebooks 검색·템플릿·체크리스트·전체 보기·빠른 기록 가져오기, Home 리소스 rail, Planning 생성 모드·템플릿·constraints·체크리스트, Ask 답변 액션/suggested prompts/RAG 원문 미리보기/대화 메모리 초기화/대화 선택 모드·폴더 선택·일괄 삭제, Ask/Build/Logic 공통 문맥 picker, Build RAG 원문 미리보기/Safe Refactor anchor preview, Logic 노드 리사이즈/path browser/run I/O 상세, Operations 자연어 command 콘솔, Operations guard retry timeline, Operations guard alert dispatch 설정/테스트, Insights sandbox/route metrics/repair quality 패널, Automate 생성 템플릿/시작 방식 타일/루틴별 권한 세그먼트/Telegram 명령 미리보기.
- 남음: 모바일 3-pane 상태, 루틴 품질·file trigger, Build 공통 composer dock 세부, Settings 세부 운영 설정.
- 우선순위: P0은 백엔드 계약 없이 현재 UI에서 완성 가능한 대화/루틴/프로젝트 조작 보강, P1은 백엔드 일부 연결이 있는 운영/계획/노트북 연결 보강, P2는 Logic visual editor와 정책형 실행 UI처럼 작업량·위험도가 큰 항목.

## 구 탭 전체 목록

구 대시보드의 루트 탭은 `app.js`, `dashboard-shell-renderers.js` 기준으로 아래 8개다.

| 구 탭 | 현재 앱 대응 |
|---|---|
| 대화 `chat` | `ask` |
| 루틴 `routine` | `automate` |
| 로직 `logic` | `logic` |
| 코딩 `coding` | `build`, `refactor` |
| 노트북 `notebook` | `notebooks` |
| 작업 계획 `automation` | `planning`, 일부 `operations` |
| 스킬 `skills` | `skills` |
| 설정 `settings` | `settings`, `routing`, `operations`, `explore`, `insights`, `agents` |

## 1. 대화 탭

근거 파일:

- 구: `modules/dashboard-composer-renderers.js`
- 구: `modules/dashboard-workspace-renderers.js`
- 구: `modules/dashboard-thread-renderers.js`
- 구: `app.js`의 command palette/shortcut/voice preference 영역
- 현재: `apps/desktop/src/features/ask/AskPage.tsx`
- 현재: `apps/desktop/src/features/ask/ask-store.ts`

현재 반영됨:

- `single`, `orchestration`, `multi` 대화 모드.
- Groq/Gemini/Cerebras/NVIDIA NIM/Copilot/Codex 제공자와 모델 선택.
- 대화 목록, 본문 검색, 대화 메타데이터, 메모리 노트, 첨부, Think+, Vision preflight, RAG preflight, RAG memory_search 후보 원문 미리보기.
- 입력을 루틴/계획으로 전환하는 버튼.
- 멀티 모델 결과 요약과 개별 provider 응답 carousel.
- 메시지별 provider/model/route/source/grounding/citation metadata 표시.

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 부분 반영 | 팔레트에서 탭 이동, 대화 본문 검색, 스킬 적용, 모델 전환 | `app.js` `buildCommandPaletteActions`, `renderCommandPalette` | `CommandPalette`가 추가되어 페이지/Ask/Build/Automate/비교/파일 분석 진입과 Ask/Build provider·모델 ID 전환은 가능하다. 대화 본문 검색, 스킬 적용 명령은 남아 있다. |
| 부분 반영 | 단축키 설정형 대화 조작 | `app.js` `DEFAULT_UI_PREFERENCES.shortcuts`, `shortcutGroups` | Settings `일반 > 단축키`에서 팔레트, 전송, 작성창 포커스, 새 대화/작업, 보관함 검색, 페이지 이동, 자동 읽기/읽기 중지 단축키를 캡처·저장한다. 음성 입력 직접 토글과 모바일 pane 전환 단축키는 아직 없다. |
| 반영됨 | TTS 자동 읽기와 음성 출력 설정 | `app.js`의 `음성 출력 (TTS)` 설정 | Settings `일반 > 음성 출력`에서 응답 자동 읽기, 언어/음성 선택, 속도/음높이/볼륨, markdown 제거, 샘플 재생/정지를 제공한다. Ask/Build 읽기 버튼과 자동 읽기가 같은 설정을 사용한다. |
| 반영됨 | 응답 후속 액션 묶음 | `dashboard-workspace-renderers.js`의 result/action 패널 | Ask 답변마다 노트북 저장, 계획 생성, Build로 열기, Automation 초안, 비교, 읽기, 복사 액션을 같은 버튼 그룹으로 제공한다. |
| 반영됨 | 대화 사이드바 선택 모드/폴더 단위 선택/일괄 삭제 | `dashboard-sidebar-renderers.js` `selectionMode`, `selectedDeleteConversationIds` | Ask 보관함에 선택 모드를 추가했다. 폴더 단위 선택, 개별 대화 선택, 선택 해제, 커스텀 확인 다이얼로그 기반 일괄 삭제를 제공한다. |
| 반영됨 | scope 메모리 초기화 버튼 | `dashboard-sidebar-renderers.js` `clearScopeMemory` | Ask 메모리 dock에 `대화 메모리 초기화` 버튼을 추가했고, 확인 다이얼로그 후 `clear_memory(scope: "chat")`으로 현재 대화 범위의 대화 기록과 메모리 노트를 함께 초기화한다. |
| 반영됨 | 모바일 responsive pane 상태 | `dashboard-shell-renderers.js`의 `list/thread/support` responsive tabs | `lg` 미만 폭에서 보관함/대화 탭 전환 바를 표시하고 한 번에 한 pane만 보여준다(`mobilePane`). 대화 선택/새 대화 시 자동으로 대화 pane으로 전환한다. 보조(info/memory/models/context)는 기존 sidePanel 토글로 대화 pane 내부에 표시한다. |

## 2. 루틴 탭

근거 파일:

- 구: `modules/dashboard-routine-renderers.js`
- 구: `modules/routine-create-wizard.js`
- 구: `modules/routine-form-fields.js`
- 현재: `apps/desktop/src/features/automate/AutomatePage.tsx`
- 현재: `apps/desktop/src/features/automate/RoutineCreateWizard.tsx`

현재 반영됨:

- 루틴 목록, 검색, 필터, 생성, 수정, 삭제, 토글.
- 스케줄 자동/수동, daily/weekly/monthly, timezone, weekdays, dayOfMonth.
- 실행 모드 자동/script/url/web/browser_agent.
- browser agent provider/model/startUrl/timeout/tool profile.
- 실행 이력, 상세, Telegram 재전송, Telegram 응답 토글.
- retry, notify policy, preview warning.

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | 목록 필터 세분화 | 구 필터: 전체/활성/비활성/오류/품질/브라우저 | `RoutineListFilter`로 전체/활성/비활성/오류/품질/브라우저 독립 필터를 제공한다(`qualityStatus`/`qualityWarnings` 캡처). |
| 부분 반영 | 루틴 품질 경고 / split test | `routine-stats.js`, `routine-defensive-ui.js` | 품질 경고는 리스트 배지 + 상세 `품질 확인 필요` 블록(`qualityWarnings`)으로 반영됨. **split test는 백엔드 계약이 없어 미지원**(test는 `test_routine_telegram`/`test_browser_agent_routine`로 연결됨). |
| 의도적 보류 | 파일 변경 트리거 | 구 자동화 컨셉의 file trigger | **백엔드에 파일 감시 trigger 계약이 전혀 없음**(grep 결과 0). 생성 1단계 file-change 타일은 비활성 안내만 제공. 백엔드 구현 선행 필요. |
| 부분 반영 | Telegram 활성 명령 목록 배너 | 구 설정/루틴의 Telegram 명령 노출 | 생성 중 `/routine create ...` 미리보기는 추가됐다. 루틴 탭 안의 활성 Telegram command 목록 배너는 아직 없다. |

## 3. 로직 탭

근거 파일:

- 구: `modules/dashboard-logic-renderers.js`
- 구: `modules/logic-state.js`
- 현재: `apps/desktop/src/features/logic/LogicPage.tsx`
- 현재: `apps/desktop/src/features/logic/logic-store.ts`

현재 반영됨:

- 그래프 목록 조회, 그래프 상세 조회.
- 실행, 취소, 저장, 삭제.
- recovery 후보 조회.
- **비주얼 에디터**: 3-pane(목록 / 캔버스 / 속성), 노드 드래그, 노드/엣지 선택, 출력→입력 포트 드래그 연결, 엣지 삭제.
- **노드 팔레트**: 31종 노드 라이브러리(카테고리별)에서 클릭으로 추가.
- **인스펙터**: 노드 타입별 주요 필드 + 참조 삽입(`{{nodes.*}}`, `{{input}}`, `{{artifacts.last}}`) + 고급 key/value 편집.
- **엣지 인스펙터**: 출력/입력 포트 선택, 조건부 연결(leftRef/operator/rightValue).
- **그래프 설정**: 제목/설명/활성화/스케줄.
- 새 그래프 scaffold(start+end), 라이브 JSON 동기화 + 직접 JSON 편집, 저장 전 클라이언트 검증(백엔드 `LogicGraphValidationPolicy` 미러).
- run snapshot/result 표시.

근거 파일(현재): `apps/desktop/src/features/logic/LogicPage.tsx`, `logic-store.ts`, `logic-node-library.ts`.

누락/부분 반영:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | 직접 조작형 캔버스 | `renderCanvas`, port anchor, selection logic | 노드 드래그·선택, 포트 드래그 연결, 엣지 선택/삭제, 선택 노드 우하단 리사이즈 핸들을 SVG 캔버스에서 지원한다. |
| 반영됨 | 노드 팔레트/라이브러리 | `renderPalettePanel`, `LOGIC_NODE_LIBRARY` | `logic-node-library.ts`에 31종 전체를 카테고리별로 두고 `노드 추가` 드롭다운에서 추가한다. |
| 반영됨 | inspector 기반 노드 필드 편집 | `renderSelectedNodeCard`, `renderNodeField` | 노드 타입별 주요 필드를 라벨 입력으로 편집하고, 알 수 없는 키는 고급 key/value 에디터로 다룬다. literal/reference 모드 탭 대신 참조 삽입 버튼으로 단순화했다. |
| 반영됨 | inline reference 삽입 | `buildLogicReferenceOptions`, `formatLogicInlineReferenceText` | 포커스된 필드에 `{{nodes.<id>.text}}`, `{{input}}`, `{{artifacts.last}}` 토큰을 삽입한다. `{{vars.*}}`/`{{sessions.*}}`는 직접 입력으로 가능. |
| 반영됨 | path browser | `logic_path_list`, `renderLogicPathBrowser` | Logic 속성 `경로` 탭에서 workspace/memory root를 탐색하고, 선택 경로를 현재 노드의 `path`/`noteName`/`url`/`input` 계열 필드 또는 run input에 삽입한다. |
| 반영됨 | 실행 결과 상세 패널 | `renderLogicRunOutputPanel`, provider/web reference rows | Logic 속성 `I/O` 탭에서 run snapshot의 노드별 status, 시간, error, result text/data/artifacts/links/session/conversation과 최근 로그를 표시한다. |
| 반영됨 | 섹션형 작업대 | `renderLogicSectionNav`, `renderFlowDetail`, `renderRunDetail`, `renderJsonDetail` | 3-pane + 속성 탭(선택/그래프/JSON)으로 재해석했다. |
| 반영됨 | 그래프 설정 카드 | `renderGraphSettingsCard` | 속성 `그래프` 탭에서 제목/설명/활성화/스케줄을 편집한다. metadata 세부 편집은 JSON 탭에서 가능. |

비주얼 에디터에서 직접 추가 가능한 노드(31종 전체): 흐름(`start`/`end`/`output`/`if`/`delay`/`parallel_split`/`parallel_join`/`set_var`/`template`), 문답·코딩(`chat_single`/`chat_orchestration`/`chat_multi`/`coding_single`/`coding_orchestration`/`coding_multi`), 자동화(`routine_run`), 데이터·도구(`memory_search`/`memory_get`/`web_search`/`web_fetch`/`file_read`/`file_write`), 운영(`session_list`/`session_spawn`/`session_send`/`cron_status`/`cron_run`/`browser_execute`/`canvas_execute`/`nodes_pending`/`nodes_invoke`/`telegram_stub`).

남은 항목: 위험 실행형 노드 정책은 보류군에 유지한다.

## 4. 코딩 탭

근거 파일:

- 구: `modules/dashboard-composer-renderers.js`
- 구: `modules/dashboard-workspace-renderers.js`
- 구: `modules/refactor-renderers.js`
- 현재: `apps/desktop/src/features/build/BuildPage.tsx`
- 현재: `apps/desktop/src/features/refactor/RefactorPage.tsx`

현재 반영됨:

- `single`, `orchestration`, `multi` 코딩 모드.
- 언어 선택, provider/model/worker model 선택.
- 첨부, voice, RAG preflight, RAG memory_search 후보 원문 미리보기, skill panel, memory/context panel.
- 결과 도크, progress, execution detail, changed files, file preview.
- 최신 결과 재실행, stdin 입력, iframe preview.
- evidence pack, safety metadata, notebook 저장, plan 생성.
- AST replace, LSP rename, anchor `refactor_preview`, preview/apply 기반 Safe Refactor.

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | Safe Refactor anchor edit | `refactor-renderers.js` `renderAnchorSection`, `refactor_preview` | Refactor 페이지와 Build Safe Refactor 도크에서 읽은 line/hash를 기준으로 start/end line 교체 preview를 생성하고 기존 preview/apply 승인 흐름으로 적용한다. |
| 부분 반영 | 결과 overlay/dock 전환 | `renderCodingResultDock`, `renderCodingResultOverlay` | 현재 결과 도크는 있으나 구 UI의 overlay 전환 흐름과 동일한 큰 결과 overlay는 없다. |
| 부분 반영 | 결과에서 runtime evidence pack을 노트북/계획/루틴으로 보내는 액션 | `dashboard-workspace-renderers.js` | 노트북 저장/계획 생성은 있으나 구 UI의 “latest result에서 plan/routine 생성” 액션 묶음이 모두 같은 위치에 있지는 않다. |
| 부분 반영 | command palette 기반 코딩/모델 전환 | `app.js` command palette | 전역 팔레트에서 Build 입력 payload 진입과 Build provider·모델 ID 직접 전환은 가능하다. 구 UI의 코딩 본문 검색/스킬 적용 명령은 남아 있다. |

## 5. 노트북 탭

근거 파일:

- 구: `modules/notebooks-renderers.js`
- 현재: `apps/desktop/src/features/notebooks/NotebookPage.tsx`
- 현재: `apps/desktop/src/features/notebooks/notebook-store.ts`

현재 반영됨:

- `learning`, `decision`, `verification` 기록.
- `handoff` 생성.
- 문서 존재 여부, 경로, 본문 표시.
- 새로고침과 기록 저장.
- projectKey 직접 지정 후 조회/기록/핸드오프 생성.
- 문서 내용/경로 검색.
- 학습/결정/검증 템플릿 삽입.
- 다음 액션 체크리스트.
- 문서 전체 보기 모달.

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | 프로젝트 키 직접 지정 | `setNotebookProjectKey`, project key draft | projectKey 입력값을 `notebook_get`, `notebook_append`, `handoff_create`에 전달한다. |
| 반영됨 | 문서 검색 | `setNotebookFilterText`, `filterNotebookDocuments` | 문서 종류/경로/본문 검색을 제공한다. |
| 반영됨 | 템플릿 삽입 | `NOTEBOOK_KIND_META.*.template`, `replaceDraftWithTemplate` | 학습/결정/검증 템플릿 버튼과 다음 액션 시작 버튼을 제공한다. |
| 반영됨 | 빠른 기록 가져오기 | `appendSelectedPlanDecision`, `appendSelectedTaskVerification`, `appendDoctorVerification`, `appendRefactorVerification` | Notebook 작성 카드에 빠른 기록 가져오기 패널을 추가했다. 현재 Planning 선택 계획/태스크 출력, Operations Doctor 보고서/fix 결과, Refactor preview/read 결과를 decision 또는 verification 초안으로 병합한다. |
| 반영됨 | 다음 액션 체크리스트 | `buildNotebookChecklist` | 문서 존재 여부에 따라 학습/결정/검증/핸드오프 다음 액션을 표시한다. |
| 부분 반영 | 문서 메트릭/상태 카드 | `renderNotebookMetricCard`, status card | 남긴 문서/작성 대상/초안 길이/projectKey 메트릭을 표시한다. 저장 루트/최근 동기화 상태 리스트는 아직 없다. |
| 반영됨 | 전체 보기 모달과 긴 문서 truncation 안내 | `setNotebookExpandedDocument` | 카드 preview와 별도로 전체 보기 모달을 제공한다. |

## 6. 작업 계획 탭

근거 파일:

- 구: `modules/plans-renderers.js`
- 구: `modules/task-graph-renderers.js`
- 현재: `apps/desktop/src/features/planning/PlanningPage.tsx`
- 현재: `apps/desktop/src/features/planning/planning-store.ts`

현재 반영됨:

- 계획 생성, 목록, 상세, 리뷰, 승인, 실행.
- 태스크 그래프 목록, 생성, 상세, 실행, task cancel, output.
- 계획 생성 모드(빠른 초안/질문 먼저).
- 계획 템플릿(기능 개선/버그 수정/요구사항 점검).
- 계획 생성 constraints 입력.
- 승인 전 계획 title/objective/constraints 수정(`plan_update`).
- 태스크 재시도/그래프 재개(`task_retry`, `task_resume`).
- 다음 액션 체크리스트.
- 계획 리뷰 상세(findings/risks/missing verification), 단계(mustDo/mustNotDo/verification), 결정 로그, 실행 요약 표시.
- 태스크 그래프 노드 구조 편집(`task_graph_update`: 제목/분류/지시/선행작업/스킬·도구, 추가·삭제).

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | 빠른 초안/질문 먼저 모드 선택 | `formatPlanModeLabel`, plan create mode | Planning 생성 카드에서 빠른 초안/질문 먼저 모드를 선택하고 `plan_create.mode`로 전달한다. |
| 반영됨 | 계획 템플릿 | 구 템플릿: 기능 개선/버그 수정/요구사항 점검 | 기능 개선/버그 수정/요구사항 점검 템플릿이 objective/constraints/mode 초안을 채운다. |
| 부분 반영 | constraints 편집 | `renderPlansPanel` constraints 입력 | Planning에서 승인 전 계획의 title/objective/constraints 편집과 `plan_update` 저장을 연결했다. 단계별 step 편집은 없다. |
| 부분 반영 | planner/reviewer 라우팅 미니 편집기 | `renderAutomationRouteEditor` | 현재 백엔드 `TaskNode`에 provider/model 필드가 없어 노드별 LLM 라우팅 편집은 불가하다. 대신 노드별 `category`(coding/research/review 등) 편집으로 실행 경로(스킬·도구)를 조정한다. |
| 부분 반영 | 다음 액션 체크리스트 | `buildPlanChecklist`, `buildGraphChecklist` | 선택 계획의 리뷰/승인/실행/그래프 다음 액션을 표시한다. 태스크 그래프 전용 체크리스트는 아직 없다. |
| 반영됨 | 리뷰 상세 | review findings/risks/missing verification | 계획 상세에 리뷰 summary/findings/risks/missingVerification + 승인 권장 여부 + reviewerRoute 블록을 표시한다. |
| 반영됨 | 실행 요약, step, decision log | `renderPlansPanel` plan detail | 계획 상세에 단계(mustDo/mustNotDo/verification), 결정 로그, 실행 status/message/resultSummary 블록을 표시한다. |
| 반영됨 | `plan_update` | 백엔드 요청 | 승인 전 계획 title/objective/constraints 저장으로 연결됐다. |
| 반영됨 | 태스크 그래프 업데이트/재시도/재개 | 백엔드 `task_graph_update`, `task_retry`, `task_resume` | `task_retry`, `task_resume`에 더해 `task_graph_update` 기반 노드 구조 편집(제목/분류/지시/선행작업/스킬·도구, 추가·삭제)을 연결했다. 저장 시 실행 기록 초기화를 확인 모달로 안내한다. |
| 반영됨 | 태스크 그래프 라우팅(분류) 편집 | `task-graph-renderers.js` `renderAutomationRouteEditor` | 노드별 `category` 편집으로 실행 경로를 조정한다. provider/model chain은 백엔드 task 모델에 없어 미지원. |

## 7. 스킬 탭

근거 파일:

- 구: `modules/skills-renderers.js`
- 현재: `apps/desktop/src/features/skills/SkillsPage.tsx`
- 현재: `apps/desktop/src/features/skills/skill-store.ts`

현재 반영됨:

- 스킬 목록 조회.
- project/global scope.
- 새 스킬 생성, 편집, 저장, 삭제.
- description/body 편집.
- 목록 검색.
- 전체/프로젝트/전역/선택 메트릭.
- 기본 SKILL.md 양식 삽입.
- 대화 사용 예시와 이름 규칙 inline validation.

부분 반영/누락:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 반영됨 | 스킬 검색 | `skillSearch`, `renderSkillSidebar` | 목록에서 이름/설명/스코프 검색을 제공한다. |
| 반영됨 | 메트릭 카드 | 전체/프로젝트/전역/선택 count | 전체/프로젝트/전역/선택 메트릭을 상단에 표시한다. |
| 반영됨 | 기본 양식 넣기 | `defaultSkillBody` 버튼 | 편집기에서 기본 SKILL.md 양식을 삽입한다. 기존 본문이 있으면 커스텀 확인 모달을 거친다. |
| 반영됨 | 사용 예시 카드 | `skills-usage-card` | 편집기에서 “대화에서 이렇게 사용” 예시를 표시한다. |
| 반영됨 | 이름 validation 안내 | `SKILL_NAME_PATTERN`, error hint | 신규 스킬 이름은 소문자/숫자/하이픈 규칙을 inline으로 표시하고 저장 전 차단한다. |

## 8. 설정 탭

근거 파일:

- 구: `modules/dashboard-settings-renderers.js`
- 구: `modules/dashboard-ops-renderers.js`
- 구: `modules/context-renderers.js`
- 구: `modules/routing-policy-renderers.js`
- 구: `modules/doctor-renderers.js`
- 현재: `apps/desktop/src/features/settings/SettingsPage.tsx`
- 현재: `apps/desktop/src/features/routing/RoutingPolicyPage.tsx`
- 현재: `apps/desktop/src/features/operations`, `explore`, `insights`, `agents`

현재 반영됨:

- OTP 인증.
- 외부접속(LAN).
- Telegram credentials/test/delete.
- LLM key 저장/삭제.
- Copilot/Codex CLI status/login/logout.
- Groq/Copilot/Cerebras 모델 조회/선택.
- 사용량.
- 메모리 노트, memory search, memory index rebuild.
- 백업 export/import preview/apply.
- 전역 권한 기본값과 `Always allow here` grant 관리.
- 라우팅 정책 조회/저장/초기화/last decision.
- Doctor run/last/fix preview.
- Operations 운영 도구의 cleanup preview/apply, cron status/list/run, nodes status/pending/approve/reject/invoke, 자연어 command 콘솔, Telegram stub command.
- Operations 운영 도구의 context scan, commands list, setup state, workspace file browser/search/preview.
- Operations 운영 도구의 metrics 수동 조회와 workspace path browser.
- Explore의 web search/fetch/sessions/browser/canvas.
- Insights/Agents로 telemetry/MCP/local LLM/terminal/agent bus 등 일부 운영 패널 분리.

부분 반영/누락/보류:

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 부분 반영 | 화면/단축키 설정 | `app.js` `uiPreferences`, `shortcutGroups` | Settings `일반 > 앱 표시`는 glass/light/dark와 상세도를 저장하고, `일반 > 단축키`는 shortcut capture/conflict/reset을 제공한다. system theme와 session rollback UI는 없다. |
| 반영됨 | TTS 세부 설정 | `app.js` `tts-controls` | Settings `일반 > 음성 출력`에서 자동 읽기/음성/속도/음높이/음량/markdown 제거/샘플 재생/정지 UI를 제공한다. |
| 부분 반영 | 테마 설정 | 구 settings + topbar theme | 현재 topbar에서 glass/light/dark 순환만 가능하고 설정 페이지 내 persistence/시스템 모드 UI가 없다. |
| 반영됨 | 도구 통합의 `cron` 제어 | `dashboard-ops-renderers.js` | Operations 운영 도구에서 `cron` status/list/run/runs/wake/add/update/remove를 연결했다. 구 UI의 통합 결과 히스토리는 남아 있다. |
| 반영됨 | 도구 통합의 `nodes` 제어 | `dashboard-ops-renderers.js` | Operations 운영 도구에서 status/pending/approve/reject/invoke/describe/notify를 연결했다. 통합 결과 히스토리는 남아 있다. |
| 반영됨 | 도구 통합의 `command` | `dashboard-ops-renderers.js`, 백엔드 `WsAiCommandDispatcher.cs` | Operations 운영 도구에서 자연어 또는 slash 명령을 백엔드 command 라우터로 전송하고 결과/최근 실행을 표시한다. 위험 키워드는 실행 전 확인 모달을 거친다. |
| 부분 반영 | 도구 통합의 `telegram_stub_command` | `dashboard-ops-renderers.js` | Operations 운영 도구에서 Telegram stub 명령 입력/전송/결과 요약을 연결했다. |
| 부분 반영 | cleanup preview/apply | `dashboard-ops-renderers.js`, 백엔드 `cleanup_preview/apply` | Operations 운영 도구에서 cleanup preview/apply를 연결했다. 제외 목록/undo/세부 승인 정책은 없다. |
| 의도적 보류 | Doctor fix apply | `doctor-renderers.js`, 현재 `ops-gateway.ts` 주석 | 현재 앱은 `doctor_fix_preview`만 연결하고 `doctor_fix_apply`는 위험 명령으로 UI 연결하지 않는다. |
| 부분 반영 | Doctor 상세 count/issue/fix 카드 | `doctor-renderers.js` | 현재 Doctor 패널은 있으나 구 UI의 count card/상세 issue/fix action 표시와 완전히 같지는 않다. |
| 반영됨 | 프로젝트 문맥 패널 | `context-renderers.js` | Operations 운영 도구에서 context scan/commands list를 read-only로 확인한다. Ask/Build 입력과 Logic 속성 패널에 memory search/detail, workspace preview, path browser를 묶은 공통 문맥 picker가 연결됐다. |
| 부분 반영 | commands 관리/표시 | `context-renderers.js` `renderCommandTable` | Operations 운영 도구에서 `commands_list` 목록과 자연어 command 실행 콘솔은 표시한다. alias 관리/명령 편집 UI는 없다. |
| 부분 반영 | context scan instruction source 표 | `context-renderers.js` `renderInstructionSourcesTable` | Operations 운영 도구에서 `context_scan` instruction sources를 표시한다. 상세 본문/필터/주입 UI는 없다. |
| 반영됨 | workspace 파일 브라우저/검색 | `dashboard-message-handlers.js`, 백엔드 `read_workspace_file` | Operations `문맥 · 파일`에서 workspace 현재 폴더를 탐색하고 현재 폴더·문맥·명령·최근 preview 후보를 검색해 `read_workspace_file` preview로 바로 연다. |
| 누락 | 도구 결과 히스토리/필터 | `dashboard-observability.js` `TOOL_RESULT_TYPES`, `TOOL_RESULT_GROUPS`, `TOOL_RESULT_FILTERS`, `TOOL_DOMAIN_FILTERS`, `OPS_DOMAIN_FILTERS` | 구 UI는 sessions/cron/browser/canvas/nodes/web/memory/telegram/doctor/cleanup 결과를 그룹·도메인 필터로 모았다. 현재 Explore/Insights/Operations로 기능이 분산되어 있고 통합 도구 결과 히스토리와 필터 UI는 없다. |
| 부분 반영 | Guard 관측/alert/retry timeline | `dashboard-ops-renderers.js`, `GuardRetryTimelineStore` | Operations에서 metrics 수동 조회, guard retry timeline, guard alert dispatch 설정/테스트를 연결했다. Insights에서 provider route metrics, sandbox readiness, repair/quality 파생 timeline을 표시한다. 통합 도구 결과 히스토리는 아직 분산되어 있다. |
| 부분 반영 | sessions/browser/canvas 도구 제어 | `dashboard-ops-renderers.js` | 현재 Explore에 분리돼 있다. 구 설정의 “도구 통합” 한 화면 구성은 사라졌다. |

## 전역 셸/공통 UI에서 빠진 구 기능

| 상태 | 항목 | 구 구현 근거 | 현재 차이 |
|---|---|---|---|
| 부분 반영 | 실제 command palette | `app.js` `renderCommandPalette` | `⌘K`/`Ctrl+K` 팔레트, 검색, 그룹별 명령, route payload 이동, Ask/Build provider·모델 ID 전환은 추가됐다. legacy 수준의 스킬 적용/본문 검색/명령 실행 전체 목록은 남아 있다. |
| 반영됨 | 사용자 커스터마이즈 단축키 | `DEFAULT_UI_PREFERENCES.shortcuts` | `preference-store.ts`가 단축키를 localStorage에 저장하고 App/Ask/Build가 팔레트, 페이지 이동, 작성창 포커스, 새 대화/작업, 보관함 검색, 전송, 자동 읽기/정지 동작에 적용한다. |
| 부분 반영 | responsive pane per tab state | `setResponsivePane`, `mobileComposerOpenByTab` | 현재 각 페이지별 반응형만 있고 탭별 pane 상태 저장이 없다. |
| 부분 반영 | 대화/코딩 공통 composer support dock | `renderComposerSupportDocks` | 현재 Ask/Build가 별도 구현되어 있어 구 UI의 공통 composer support dock 구조는 없다. |

## 우선 이식 순서 제안

1. ~~로직 탭 visual editor: 노드 팔레트, 드래그, 엣지 연결, inspector, 노드 리사이즈, path browser, 노드별 run I/O 상세~~ → 반영됨(2026-06-04).
2. ~~계획/태스크: `task_graph_update`, route editor(분류), 리뷰 상세~~ → 반영됨(2026-06-04). provider/model chain은 백엔드 task 모델에 없어 미지원.
3. 설정/운영: context/commands와 guard timeline/alert는 반영됨. 남은 것은 provider 상태 통합, tool result history, cron/nodes/cleanup의 고급 액션.
4. 노트북/스킬: 메트릭 보강.
5. 루틴: 품질 필터, split test, file trigger/권한 정책은 백엔드 계약 확인 후.

## 추가 소스 파일 감사 메모

아래 파일들은 파일명 기준 2차 감사에서 별도로 확인했다. 독립 탭/화면 기능이 아니라 상태, 포맷, 메시지 라우팅, 테스트 보조인 경우가 많아 위 표의 대응 항목에 묶었다.

| 파일/그룹 | 감사 결과 |
|---|---|
| `dashboard-attachments.js`, `chat-state.js`, `coding-state.js` | 첨부 6개/15MB 제한, drag 파일 감지, base64 인코딩, URL 추출은 현재 Ask/Build 첨부와 store에 반영되어 있다. 별도 누락은 찾지 못했다. |
| `dashboard-message-handlers.js` | 대화/메모리/루틴/코딩/파일 preview 메시지 처리 파일이다. `workspace_file_preview`는 백엔드 미연결 문서에 `read_workspace_file`로 보강했고, coding preview 자동 요청/루틴 progress는 현재 Build/Automate에 반영되어 있다. |
| `dashboard-server-message-router.mjs` | tool result history, provider runtime, guard alert/retry timeline, model/settings 응답 라우팅을 담당한다. tool result 통합 필터와 guard 관측 누락은 설정 탭 항목에 보강했다. |
| `routine-progress-renderer.js`, `routine-state.js`, `routine-utils.js` | 루틴 생성 단계 progress는 현재 Automate progress 배너와 store에 반영되어 있다. 품질 필터/split test/file trigger 차이는 루틴 탭 항목에 남겼다. |
| `dashboard-model-data.js`, `dashboard-derived-state.js` | 모델 테이블, provider health/runtime, guard/tool/ops 파생 통계 파일이다. 현재 Settings/Insights에 분산 반영되어 있고, 구 통합 도구 결과/guard 통계 차이는 설정 탭 항목에 남겼다. |
| `dashboard-markdown.js`, `dashboard-formatters.js`, `dashboard-ui-helpers.js`, `dashboard-constants.js`, `error-messages.js` | 렌더링/포맷/상수/공통 UI 보조 파일이다. 독립 기능 누락보다는 각 탭의 표시 품질 보조로 판단했다. |
| `*-state.js`, `ws-*.js` | 탭별 초기 상태와 WebSocket wrapper다. 기능 차이는 대응 renderer/gateway 항목에서 이미 정리했다. |
| `check-*.js`, `worker.js`, `index.html`, `styles.css` | 회귀 테스트, worker, 앱 부트스트랩, 스타일 파일이다. 테스트 파일에서 드러난 guard/ops/security 흐름은 guard/운영 항목에 반영했고, 별도 탭 기능 누락은 찾지 못했다. |
