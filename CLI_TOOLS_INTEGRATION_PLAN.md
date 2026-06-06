# CLI 도구 통합 계획서: ripgrep · fd · fzf · jq · gh · ast-grep

작성 기준: 2026-06-06

## 1. 목표

ripgrep, fd, fzf, jq, gh, ast-grep의 핵심 기능을 omnux 미들웨어에 통합한다.
데스크톱 앱과 웹 대시보드에서 대화, 코딩, 탐색 화면을 통해 사용할 수 있게 한다.

원칙:
- **래핑하지 않고 호출한다.** 각 도구의 바이너리를 직접 실행하고 stdout을 파싱한다.
- **없으면 gracefully degrade한다.** 바이너리가 없으면 관련 기능을 숨기거나 대안 경로를 안내한다.
- **기존 패턴을 따른다.** `AstGrepRefactorService`와 `CopilotCliWrapper`가 이미 확립한 probe → execute → parse 패턴을 재사용한다.

## 2. 현재 구현 현황

| 도구 | 상태 | 위치 | 비고 |
|---|---|---|---|
| **ast-grep** | ✅ 구현됨 | `Application/Refactor/AstGrepRefactorService.cs` | Safe Refactor에서만 사용. 탐색/검색으로는 노출 안 됨 |
| **Process 실행 인프라** | ✅ 있음 | `UniversalCodeRunner.cs`, `CopilotCliWrapper.cs` | `Process.Start` + timeout + stdout/stderr 파싱 패턴 확립 |
| **gh (GitHub CLI)** | ⚠️ 부분 | `GitAutomation/GitOperationExecutor.cs` | PR 생성, Gist 업로드만. 이슈, PR 목록, 검색 없음 |
| **ripgrep** | ❌ 없음 | — | 파일 내용 검색 기능 없음 |
| **fd** | ❌ 없음 | — | 파일명/경로 검색 기능 없음 |
| **fzf** | ❌ 없음 | — | 퍼지 파인더, Command Palette 없음 |
| **jq** | ❌ 없음 | — | JSON 쿼리 기능 없음 |
| **코드 검색 (일반)** | ❌ 없음 | — | grep, semantic code search 없음 |

## 3. 아키텍처

### 3.1 실행 계층

```
데스크톱/대시보드 UI
       │
       ▼
WebSocket 명령 (WsToolDispatcher)
       │
       ▼
ToolExecutionApplicationService  ← 새로운 통합 서비스
       │
       ├── CliToolProbe          ← 바이너리 탐지 (probe)
       ├── CliToolExecutor       ← Process.Start 실행 (execute)
       └── OutputParser          ← stdout 파싱 (parse)
              │
              ├── RipgrepRunner
              ├── FdRunner
              ├── JqRunner
              ├── GhRunner
              └── AstGrepSearchRunner
```

### 3.2 기존 패턴 재사용

`RefactorToolAvailability`가 이미 probe 패턴을 구현하고 있다:

```csharp
// 기존 패턴 (AstGrepRefactorService)
var probe = _toolAvailability.ProbeAstGrep(path, enabled);
if (!probe.Enabled || !probe.Available) return BuildResult(probe, probe.Message);
var result = await RunAstGrepAsync(probe, ...);
```

이 패턴을 일반화한다:

```csharp
// 일반화된 패턴
public sealed class CliToolProbe(string tool, bool available, string? binaryPath);
public sealed class CliToolProbeService {
    public CliToolProbe Probe(string toolName, string[] candidates);
    // candidates: ["rg", "ripgrep"], ["fd", "fdfind"], ["jq"], ["gh"], ["sg", "ast-grep"]
}
```

## 4. 도구별 설계

### 4.1 ripgrep — 파일 내용 검색

**목적:** workspace와 프로젝트 디렉터리에서 파일 내용을 검색한다.

**바이너리 탐지:** `rg` 또는 `ripgrep`

**노출할 기능:**

| 기능 | rg 명령 | 설명 |
|---|---|---|
| 내용 검색 | `rg --json <pattern> <path>` | 정규식으로 파일 내용 검색 |
| 파일 타입 필터 | `rg --type-add` + `--type <lang>` | 언어별 필터 |
| 컨텍스트 | `rg -C 3` | 매치 전후 3줄 |
| 통계 | `rg --stats` | 파일 수, 매치 수 |

**미들웨어 구현:**

```
새 파일: Application/Tools/RipgrepRunner.cs
  - ProbeAsync(): rg 바이너리 탐지
  - SearchAsync(pattern, path, options): rg 실행, JSON 출력 파싱
  - 반환: RipgrepResult { matches: [{ file, line, col, text, context }] }
```

**UI 노출:**
- Explore 화면에 "코드 검색" 탭 추가
- Ask 화면의 RAG preflight에서 `code` 검색 후보가 rg 결과를 활용
- 코딩 탭에서 "관련 코드 찾기" 액션

**없을 때 대안:** MemorySearchTool의 SQLite FTS가 이미 메모리 노트 내용 검색을 지원하지만, 일반 파일 내용 검색은 불가. rg가 없으면 "ripgrep 설치 후 사용 가능" 안내.

### 4.2 fd — 파일명/경로 검색

**목적:** 프로젝트 디렉터리에서 파일을 이름, 확장자, 경로로 빠르게 찾는다.

**바이너리 탐지:** `fd` 또는 `fdfind` (Ubuntu)

**노출할 기능:**

| 기능 | fd 명령 | 설명 |
|---|---|---|
| 이름 검색 | `fd <pattern> <path>` | 파일명으로 검색 |
| 확장자 필터 | `fd -e ts -e tsx` | 확장자 필터 |
| 타입 필터 | `fd -t f` / `fd -t d` | 파일/디렉터리 |
| 정규식 | `fd --regex` | 정규식 모드 |
| 숨김 포함 | `fd -H` | 숨김 파일 포함 |

**미들웨어 구현:**

```
새 파일: Application/Tools/FdRunner.cs
  - ProbeAsync(): fd 바이너리 탐지
  - FindAsync(pattern, path, options): fd 실행, 라인별 출력 파싱
  - 반환: FdResult { files: [{ path, name, type }] }
```

**UI 노출:**
- Explore 화면에 "파일 검색" 탭 추가
- 코딩 탭에서 "파일 열기" 액션
- Projects 화면에서 파일 브라우저

**없을 때 대안:** `Directory.EnumerateFiles`로 기본 파일 검색 구현 (성능은 낮지만 동작). fd가 있으면 fd를 우선.

### 4.3 fzf — 퍼지 파인더

**목적:** 모든 리스트(대화, 파일, 명령, 스킬, 모델)에서 퍼지 검색을 제공한다.

**바이너리 탐지:** `fzf` — 하지만 omnux에서는 **fzf 바이너리를 직접 호출하지 않는다.** 대신 **fzf의 매칭 알고리즘을 C#으로 포팅**하거나 **JavaScript로 프론트엔드에서 구현**한다.

이유:
- fzf는 TUI 도구다. 터미널에서 대화형으로 동작하도록 설계되어 HTTP/WebSocket 서비스에 부적합.
- omnux에는 터미널이 없다. 대신 데스크톱 앱과 웹 대시보드에서 퍼지 매칭이 필요.

**구현 방식:**

```
옵션 A (권장): 프론트엔드 퍼지 매칭
  - 라이브러리: fuse.js (npm, ~15KB, 종속성 없음)
  - 위치: apps/desktop/src/lib/fuzzy.ts
  - 대상: 대화 목록, 파일 목록, 명령 목록, 스킬 목록, 모델 목록
  - Command Palette에서 fuse.js로 필터링

옵션 B: 미들웨어 퍼지 매칭
  - 새 파일: Application/Tools/FuzzyMatcher.cs
  - FuzzyMatcher.Match(query, candidates) → ranked results
  - 간단한 Smith-Waterman 또는 FTS 기반 구현
  - 대상: 대화 검색, 메모리 검색 (이미 FTS 있음)
```

**UI 노출:**
- Command Palette (⌘K) — 모든 페이지에서 통합 검색
- 대화 검색 — 보관함 검색에 퍼지 매칭 적용
- 파일 검색 — Explore 화면 파일 목록에 퍼지 필터
- 스킬/명령/모델 검색 — 각 ChoiceMenu에 퍼지 필터 (이미 부분 구현됨: `ChoiceMenu`에 `searchable` prop이 있음)

### 4.4 jq — JSON 쿼리

**목적:** 상태 파일, API 응답, 코딩 결과 JSON에서 특정 필드를 추출한다.

**바이너리 탐지:** `jq`

**노출할 기능:**

| 기능 | jq 명령 | 설명 |
|---|---|---|
| 필드 추출 | `jq '.field'` | JSON에서 필드 값 추출 |
| 배열 필터 | `jq '.[] \| select(.status == "ok")'` | 조건 필터 |
| 통계 | `jq 'length'`, `jq 'group_by'` | 집계 |
| 변환 | `jq 'map'`, `jq 'sort_by'` | 데이터 변환 |

**미들웨어 구현:**

```
새 파일: Application/Tools/JqRunner.cs
  - ProbeAsync(): jq 바이너리 탐지
  - ExecuteAsync(filter, input): jq 실행, stdin으로 JSON 입력, stdout 파싱
  - 반환: JqResult { output, error, exitCode }
```

**UI 노출:**
- 코딩 탭에서 "JSON 쿼리" 액션
- Settings 화면에서 상태 파일 검사기
- Explore 화면에서 API 응답 분석
- 텔레그램에서 `/jq <filter>` 명령

**없을 때 대안:** `System.Text.Json`의 `JsonNode`/`JsonDocument`로 기본 경로 접근 구현. 복잡한 필터는 불가하지만 `.field`, `.[index]` 정도는 커버.

### 4.5 gh — GitHub CLI

**목적:** GitHub 리포지토리, 이슈, PR, Gist와 직접 상호작용한다.

**바이너리 탐지:** `gh`

**현재 구현:**
- `GitOperationExecutor.cs`: PR 생성 (`gh pr create`)
- `GistSyncApplicationService.cs`: Gist 업로드/다운로드 (GitHub API 직접 호출, gh 미사용)

**추가할 기능:**

| 기능 | gh 명령 | 설명 |
|---|---|---|
| 이슈 목록 | `gh issue list` | 오픈 이슈 조회 |
| 이슈 생성 | `gh issue create` | 이슈 생성 |
| PR 목록 | `gh pr list` | PR 조회 |
| PR 리뷰 | `gh pr view` | PR 상세 + diff |
| 리포 검색 | `gh search repos` | 공개 리포 검색 |
| 코드 검색 | `gh search code` | GitHub 코드 검색 |
| Gist 관리 | `gh gist` | Gist CRUD (기존 API 직접 호출 → gh로 전환) |

**미들웨어 구현:**

```
새 파일: Application/Tools/GhRunner.cs
  - ProbeAsync(): gh 바이너리 + 인증 상태 탐지 (gh auth status)
  - IssueListAsync(), IssueCreateAsync(), PrListAsync(), PrViewAsync()
  - SearchReposAsync(), SearchCodeAsync()
  - 반환: 각각 타입별 결과 객체

기존 파일 수정:
  - GitOperationExecutor.cs: 이미 gh를 사용 중, 확장만
  - GistSyncApplicationService.cs: API 직접 호출 → GhRunner 경유로 전환 고려
```

**UI 노출:**
- Explore 화면에 "GitHub" 탭 추가 (이슈, PR, 코드 검색)
- Operations 화면의 Git Automation에 PR 리뷰 추가
- 코딩 탭에서 "GitHub에 공개 리포지토리에서 예제 찾기"

### 4.6 ast-grep — AST 코드 검색

**목적:** 정규식이 아닌 AST 기반으로 코드 패턴을 검색한다. 현재 Safe Refactor에서만 사용하며, 일반 코드 검색으로 확장한다.

**바이너리 탐지:** `sg` 또는 `ast-grep` — 이미 `RefactorToolAvailability`에 구현됨.

**현재 구현:**
- `AstGrepRefactorService.cs`: AST Replace만 수행 (Safe Refactor용)
- `RefactorToolAvailability.cs`: 바이너리 probe, 언어 감지

**추가할 기능:**

| 기능 | sg 명령 | 설명 |
|---|---|---|
| 패턴 검색 | `sg run --pattern <pattern>` | AST 패턴으로 코드 검색 |
| 언어 지정 | `sg run -l python` | 언어별 검색 |
| JSON 출력 | `sg run --json` | 구조화된 결과 |
| rewrite | 이미 구현됨 | AST Replace (Safe Refactor) |

**미들웨어 구현:**

```
기존 파일 확장: Application/Refactor/AstGrepRefactorService.cs
  - SearchAsync(pattern, path, language): sg run --pattern --json 실행
  - 반환: AstGrepSearchResult { matches: [{ file, startLine, endLine, text, meta }] }

새 파일 (필요시): Application/Tools/AstGrepSearchRunner.cs
  - AstGrepRefactorService에서 검색 로직만 분리
```

**UI 노출:**
- Explore 화면에 "AST 검색" 탭
- 코딩 탭에서 "패턴으로 코드 찾기"
- Ask 화면에서 "이 패턴이 프로젝트에 있는지 찾아줘" 자연어 → AST 패턴 변환

## 5. 공통 인프라

### 5.1 CliToolProbeService

모든 CLI 도구의 바이너리 탐지를 통합한다.

```
새 파일: Infrastructure/Tools/CliToolProbeService.cs

public sealed class CliToolProbe(string tool, bool available, string? binaryPath, string version);
public sealed class CliToolProbeService {
    public CliToolProbe Probe(string toolName, string[] candidates);
    public Dictionary<string, CliToolProbe> ProbeAll();
}
```

### 5.2 CliToolExecutor

외부 프로세스 실행을 통합한다. 기존 `UniversalCodeRunner`와 `CopilotCliWrapper`의 공통 패턴을 추출.

```
새 파일: Infrastructure/Tools/CliToolExecutor.cs

public sealed class CliToolResult(int exitCode, string stdOut, string stdErr, long durationMs);
public sealed class CliToolExecutor {
    Task<CliToolResult> ExecuteAsync(string binary, string[] args, string? stdin = null, int timeoutSec = 30, string? workingDir = null, CancellationToken ct = default);
}
```

### 5.3 Doctor 통합

각 도구의 설치/인증 상태를 Doctor 체크에 추가.

```
기존 파일 수정: Application/Doctor/Checks/
  - ToolChainDoctorCheck.cs (새 파일)
    - rg: installed? version?
    - fd: installed? version?
    - jq: installed? version?
    - gh: installed? authenticated?
    - sg: installed? version?
```

### 5.4 WebSocket Dispatcher

```
새 파일: WsToolCommandDispatcher.cs
  - tool_probe: 설치된 도구 목록 조회
  - tool_search: ripgrep/fd/ast-grep 검색 실행
  - tool_jq: jq 실행
  - tool_gh: gh 명령 실행
```

## 6. 프론트엔드

### 6.1 Command Palette (fzf 역할)

```
새 파일: apps/desktop/src/features/command-palette/
  - CommandPalette.tsx: 모달 오버레이
  - command-palette-store.ts: fuse.js 기반 퍼지 매칭
  - 등록 소스: 페이지, 대화, 파일, 명령, 스킬, 모델
```

⌘K로 열고, 타이핑하면 fuse.js가 모든 소스에서 퍼지 매칭.

### 6.2 Explore 화면 확장

```
기존 파일 수정: apps/desktop/src/features/explore/ExplorePage.tsx
  - 탭 추가: "코드" (ripgrep), "파일" (fd), "AST" (ast-grep), "GitHub" (gh)
  - 각 탭마다 전용 gateway + store 확장
```

### 6.3 퍼지 검색 라이브러리

```
npm install fuse.js --prefix apps/desktop
```

또는 직접 구현 (의존성 추가를 피하려면):
- 간단한 substring + bigram 스코어링으로 충분
- 1000개 이하 항목에서는 fuse.js와 체감 차이 없음

## 7. 구현 순서

### Phase 1: 인프라 (기반)
1. `CliToolProbeService` + `CliToolExecutor` 구현
2. `WsToolCommandDispatcher` 추가
3. Doctor 체크에 도구 탐지 추가
4. `npm test`에 도구 계약 검사 추가

### Phase 2: 검색 (ripgrep + fd)
5. `RipgrepRunner` 구현
6. `FdRunner` 구현 (없을 때 `Directory.EnumerateFiles` 대안 포함)
7. Explore 화면에 "코드" / "파일" 탭 추가
8. Ask RAG preflight에서 ripgrep 결과 활용

### Phase 3: AST 검색 (ast-grep 확장)
9. `AstGrepRefactorService`에 검색 기능 추가
10. Explore 화면에 "AST" 탭 추가

### Phase 4: GitHub (gh 확장)
11. `GhRunner` 구현
12. Explore 화면에 "GitHub" 탭 추가
13. Operations 화면에 PR 리뷰 추가

### Phase 5: JSON 쿼리 (jq)
14. `JqRunner` 구현 (없을 때 `JsonNode` 대안 포함)
15. 코딩 탭에 JSON 쿼리 액션 추가

### Phase 6: 퍼지 파인더 (fzf 대체)
16. Command Palette UI 구현
17. fuse.js 또는 커스텀 퍼지 매칭 적용
18. 모든 리스트 화면에 퍼지 필터 적용

## 8. 보안 고려사항

- **경로 제한**: ripgrep/fd/ast-grep은 `workspace/`와 등록된 프로젝트 경로만 검색. `~/.omnux`는 검색에서 제외.
- **명령 인젝션 방지**: 모든 인자를 `ProcessStartInfo.ArgumentList`로 전달. 셸 문자열 조립 금지.
- **출력 크기 제한**: stdout이 1MB 초과 시 잘라냄. 무한 출력 방지.
- **타임아웃**: 모든 외부 명령에 30초 타이밍아웃. ripgrep만 60초 허용 (대규모 코드베이스).
- **원격 접근 제한**: 외부접속 클라이언트는 도구 실행 차단. probe(설치 상태 조회)만 허용.

## 9. 검증 계획

각 도구별:
1. 바이너리 없을 때 graceful degradation 확인
2. 바이너리 있을 때 정상 동작 확인
3. 타임아웃 동작 확인
4. 출력 크기 제한 동작 확인
5. 경로 제한 동작 확인
6. `npm test`에 계약 검사 추가

통합:
- `dotnet build` 통과
- `npm test` 통과
- Doctor에서 도구 상태 정상 보고
- 데스크톱 앱에서 각 탭 정상 동작
