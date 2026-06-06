// 홈 컴포저: 입력이 "질문(Ask)"인지 "코드 작업(Build)"인지 전송 전에 판별한다.
// 핵심 — 주제 단어(코드/코딩/함수/버그)가 아니라 "동작 동사"로 본다.
//   · 정보를 원함(알려줘/추천/설명/예제 알려…) → Ask
//   · 직접 작업 지시(만들어/짜줘/고쳐/구현/디버그…) → Build
//   · 둘 다 걸리면 한국어는 "문장 끝 동사"가 진짜 요청이므로 끝을 본다. 애매하면 Ask.
export type ComposerIntent = "ask" | "build";

// 정보·설명·추천을 요청하는 신호
const ASK_SIGNAL =
  /(알려\s?줘|알려주|가르쳐|설명|요약|정리|비교|추천|찾아|검색|뭐(?:야|가|지|니)|뭔지|무엇|무슨|어떤\s|어떻게|어디|누가|누구|언제|왜|차이|의미|뜻|정보|예시|예제\s*(?:좀|를|알려|보여|있|찾)|방법\s*(?:좀|을|이|알려)|어때|가능(?:해\?|할까|한가|한지)|좋을까|골라|recommend|explain|summari[sz]e|compare|what(?:'s| is| are)|why|how (?:do|to|can|should|much|many)|which|where|who|tell me|show me|example|difference|\?\s*$)/i;

// 직접 코드/파일 작업을 시키는 명령형 동사 신호
const BUILD_SIGNAL =
  /(만들어|구현(?:해|하|할)|짜\s?(?:줘|봐|면|줄)|작성(?:해|하)|코딩\s?(?:해|하)|개발(?:해|하)|고쳐|수정(?:해|하)|디버그|리팩터|리팩토링|빌드(?:해|하)|배포(?:해|하)|컴파일|실행(?:해|하|시켜)|테스트\s?(?:해|코드|작성)|추가(?:해|하)|삭제(?:해|하)|지워\s?줘|적용(?:해|하)|바꿔\s?(?:줘|라|봐)|커밋|머지|푸시|build|implement|refactor|debug|compile|deploy|scaffold|\bfix\b|create (?:a |the |my )?(?:function|class|component|script|app|api|file|module|page)|write (?:a |the |me )?(?:function|class|component|script|code|program)|generate (?:a |the )?(?:function|class|component|code|script))/i;

// 둘 다 걸렸을 때 문장 끝에서 Ask 종결을 식별
const ASK_TAIL =
  /(알려\s?줘|알려주|추천|설명|요약|정리|비교|찾아|검색|어때|좋을까|골라|뭐(?:야|가)|무엇|어떻게|\?\s*$)/i;

export function inferComposerIntent(text: string): ComposerIntent {
  const t = text.trim();
  if (!t) return "ask";
  const ask = ASK_SIGNAL.test(t);
  const build = BUILD_SIGNAL.test(t);
  if (build && !ask) return "build";
  if (ask && !build) return "ask";
  if (!ask && !build) return "ask"; // 기본값: 질문
  // 둘 다 매칭 → 문장 끝(마지막 동사)의 의도를 따른다.
  const tail = t.slice(-20);
  if (ASK_TAIL.test(tail)) return "ask";
  if (BUILD_SIGNAL.test(tail)) return "build";
  return "ask";
}

// 모델 ID에서 쓸데없는 꼬리(preview/latest/date/provider prefix 등)를 떼어 표시용으로 축약한다.
export function abbreviateModel(id: string): string {
  let value = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id; // provider prefix 제거
  // Claude(코파일럿 등): "claude" 프리픽스만 떼고 버전·qualifier는 보존(변종 중복 방지).
  if (/claude/i.test(value) && /(haiku|opus|sonnet)/i.test(value)) {
    return (
      value
        .replace(/^claude[-_\s]?/i, "")
        .replace(/[-_]\d{6,8}\b/g, "") // 날짜 코드만 제거
        .replace(/[-_]/g, " ")
        .trim() || value
    );
  }
  value = value.replace(/[-_](preview|latest|exp|experimental|beta|stable|instruct|chat|nightly|turbo|hf|it)\b/gi, "");
  value = value.replace(/[-_]\d{6,8}\b/g, ""); // 날짜 코드(20240101 등)
  value = value.replace(/[-_]+$/g, "").replace(/^[-_]+/g, "");
  return value || id;
}
