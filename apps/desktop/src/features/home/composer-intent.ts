// 홈 컴포저: 입력이 "질문(Ask)"인지 "코드 작업(Build)"인지 전송 전에 판별한다.
//
// 설계 — 주제 단어(코드/함수/버그)가 아니라 "동작 의도"로 본다. 여러 문장이 꼬여 들어와도
// 견고하도록 절(clause) 단위로 쪼개 각 절의 operative verb(절 끝 동사)로 판별한 뒤 종합한다.
//   1) 문장 종결부호/줄바꿈으로 절을 나눈다.
//   2) 각 절을 build / ask(strong) / ask(weak) / 무신호로 분류한다.
//        · 정보 요청(알려줘/설명/추천/뭐야/어떻게…) → ask(strong)
//        · 완곡 확인(가능할까?/될까?/단독 물음표) → ask(weak)
//        · 직접 작업 지시(만들어/구현/고쳐/디버그…) → build
//        · 한 절에 둘 다면 절 끝(진짜 지시)으로 결정. 끝이 약한 확인뿐이면 build 지시가 우선.
//   3) 종합: build 지시가 있고 강한 정보 요청이 없으면 build(끝의 "가능할까?"가 뒤집지 못함).
//            강한 정보 요청만 있으면 ask. 둘 다 강하면 마지막 절(가장 최근 지시)을 따른다.
//   애매하면 Ask.
export type ComposerIntent = "ask" | "build";

// 강한 정보 요청: 명시적 정보 요청 동사 + 내용 의문사. (완곡 확인은 ASK_WEAK)
const ASK_STRONG =
  /(알려|가르쳐|설명|요약|정리|비교|추천|찾아|검색|뭐(?:야|가|지|니|냐|예요|에요)|뭔지|무엇|무슨|뜻(?:이|은|을|:|\b)|의미(?:가|는|를|을)|차이|예시\s*(?:좀|를|알려|보여|줘|있|찾)|예제\s*(?:좀|를|알려|보여|줘|있|찾)|방법\s*(?:좀|을|이|은|알려|줘|뭐|있)|어떻게(?!든)|어떤\s|어디(?:서|에|로|야|니|가)|누가|누구|언제|왜(?!냐)|얼마|몇\s|recommend|explain|summari[sz]e|compare|tell me|show me|what(?:'s| is| are| does| do)|how (?:do|to|can|should|much|many|does)|why|which|where|who|difference|example)/i;

// 약한 ask: 완곡 확인/단독 의문. build 지시가 함께 있으면 이것이 의도를 뒤집지 못한다.
const ASK_WEAK =
  /(가능(?:해|할까|한가|한지|할지|하나)|될까|되나|되니|되려나|괜찮(?:아|을까|은가|나|겠)|어때|어떨까|좋(?:을까|겠|을지)|맞(?:아|을까|나|지)|궁금|\?\s*$)/i;

// 직접 코드/파일 작업을 시키는 명령형 동사 신호
const BUILD_SIGNAL =
  /(만들어|만들래|만들자|구현(?:해|하|할|줘)|짜\s?(?:줘|봐|면|줄|자)|작성(?:해|하)|코딩\s?(?:해|하)|개발(?:해|하)|고쳐|고칠|수정(?:해|하)|디버그|디버깅|리팩터|리팩토링|빌드(?:해|하)|배포(?:해|하)|컴파일|실행(?:해|하|시켜)|해결(?:해|하)|테스트\s?(?:해|코드|작성)|추가(?:해|하)|삭제(?:해|하)|제거(?:해|하)|지워\s?줘|적용(?:해|하)|바꿔\s?(?:줘|라|봐)|설치(?:해|하)|커밋|머지|푸시|build|implement|refactor|debug|compile|deploy|scaffold|\bfix\b|create (?:a |the |my )?(?:function|class|component|script|app|api|file|module|page|endpoint)|write (?:a |the |me )?(?:function|class|component|script|code|program|test)|generate (?:a |the )?(?:function|class|component|code|script)|add (?:a |the |an )?(?:function|class|component|endpoint|test|feature))/i;

// 명령형 요청 어미: "?"로 끝나도 의문이 아니라 정중한 지시("만들어줄래?")로 본다.
const IMPERATIVE_END = /(?:줘|줄래요?|주라|주세요|주실래요?|주시겠어요?|해줘|해라|해주세요|하자|봐|보자|시오|렴)\s*\??$/;

// 의문형 종결: "?" 또는 명백한 의문 어미. (한국어 명령형과 겹치지 않는 어미만 무표시 허용)
const INTERROGATIVE_END = /\?\s*$|(?:까|까요|을까|는가|은가|나요)\s*$/;

// 영어는 어순상 맨 앞 동사/의문사로 의도를 판별한다(한국어 "절 끝 동사" 규칙이 안 통함).
const LEADING_QUESTION_EN =
  /^\s*(?:how|what|whats?|why|which|where|who|when|can|could|should|would|do|does|did|is|are|will|explain|tell me|show me|describe|compare)\b/i;
const LEADING_BUILD_EN =
  /^\s*(?:create|build|make|implement|write|generate|refactor|debug|scaffold|deploy|compile|add|develop|rewrite|set ?up|install|code)\b/i;

type ClauseClass = { intent: ComposerIntent; strong: boolean };

// 입력을 절 단위로 나눈다. 종결부호(. ! ? 。 ！ ？)는 절에 남겨 의문형 판별에 쓴다.
function splitClauses(text: string): string[] {
  return (text.match(/[^.!?。！？\n]+[.!?。！？]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

function classifyClause(raw: string): ClauseClass | null {
  const c = raw.trim();
  if (!c) return null;

  // 영어 선두 의문사 → 질문, 선두 명령형 동사 → 작업 (질문이 우선: "how to create…" = ask)
  if (LEADING_QUESTION_EN.test(c)) return { intent: "ask", strong: true };
  if (LEADING_BUILD_EN.test(c)) return { intent: "build", strong: true };

  const build = BUILD_SIGNAL.test(c);
  const askStrong = ASK_STRONG.test(c);
  const askWeak = ASK_WEAK.test(c);
  const ask = askStrong || askWeak;
  const interrogative = INTERROGATIVE_END.test(c) && !IMPERATIVE_END.test(c);

  if (build && !ask) {
    // 빌드 동사라도 의문형으로 끝나면("만들 수 있어?", "어떻게 해결하지?") 정보 요청이다.
    return interrogative ? { intent: "ask", strong: true } : { intent: "build", strong: true };
  }
  if (ask && !build) {
    return { intent: "ask", strong: askStrong };
  }
  if (build && ask) {
    // 끝이 강한 정보 요청 의문이면 ask. 약한 확인(가능할까?)뿐이면 build 지시가 우선.
    if (interrogative) {
      if (askStrong) return { intent: "ask", strong: true };
      return { intent: "build", strong: true };
    }
    // 비의문 종결 → operative verb(절 끝)로 결정.
    const tail = c.slice(-16);
    const tailBuild = BUILD_SIGNAL.test(tail);
    const tailAsk = ASK_STRONG.test(tail);
    if (tailBuild && !tailAsk) return { intent: "build", strong: true };
    if (tailAsk && !tailBuild) return { intent: "ask", strong: true };
    if (IMPERATIVE_END.test(c)) return { intent: "build", strong: true };
    return { intent: "ask", strong: askStrong };
  }
  return null;
}

export function inferComposerIntent(text: string): ComposerIntent {
  const t = text.trim();
  if (!t) return "ask";

  const classed = splitClauses(t)
    .map(classifyClause)
    .filter((c): c is ClauseClass => c !== null);

  // 마지막 "강한 지시"(build 또는 강한 정보 요청)를 따른다 — 가장 최근에 내린 진짜 요청이 의도다.
  // 끝에 붙은 약한 확인("가능할까?", "될까?")은 의도를 결정하지 못한다.
  for (let i = classed.length - 1; i >= 0; i--) {
    const c = classed[i];
    if (c.intent === "build") return "build"; // build 절은 항상 강한 지시
    if (c.strong) return "ask"; // 강한 정보 요청
  }

  return "ask"; // 강한 지시 없이 약한 확인만 → 기본 질문
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
