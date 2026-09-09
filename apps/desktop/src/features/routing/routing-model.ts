/* ============================================================================
   라우팅 화면의 순수 모델.
   화면·저장소를 가져오지 않는다.

   가장 중요한 규칙: **저장하지 않은 편집을 서버 응답이 덮어쓰지 않는다.**
   이전 화면은 조회 응답이 올 때마다 편집 중이던 값을 통째로 서버 값으로 바꿨다.
   실제 앱에서 재현했다. 입력칸에 "grok, groq" 를 넣고 새로고침을 누르면
   아무 경고 없이 이전 값으로 되돌아갔다. 실시간 연결이 끊겼다 붙어도 같은 일이 생긴다.
   ============================================================================ */

export type ChainMap = Record<string, string[]>;
export type DraftMap = Record<string, string>;

export type CategoryMeta = {
  key: string;
  label: string;
  hint: string;
};

const CATEGORY_META: Record<string, { label: string; hint: string }> = {
  generalChat: { label: "일반 대화", hint: "기본 질문과 대화" },
  planner: { label: "계획 세우기", hint: "작업 계획 초안" },
  reviewer: { label: "계획 검토", hint: "세운 계획을 다시 살펴보기" },
  searchTimeSensitive: { label: "최신 정보 검색", hint: "지금 시점의 정보가 필요할 때" },
  searchFallback: { label: "검색 보조", hint: "검색이 필요한지 판단" },
  deepCode: { label: "큰 코딩 작업", hint: "여러 파일에 걸친 구현" },
  safeRefactor: { label: "안전한 정리", hint: "구조 정리와 조심스러운 수정" },
  quickFix: { label: "빠른 수정", hint: "짧은 버그 수정" },
  visualUi: { label: "화면 작업", hint: "배치와 모양 다듬기" },
  routineBuilder: { label: "자동화 만들기", hint: "자동화 생성과 갱신" },
  backgroundMonitor: { label: "배경 확인", hint: "상태 확인과 분석" },
  documentation: { label: "문서 쓰기", hint: "설명과 안내 문서" }
};

/** 모르는 키는 키 그대로 보여준다. 임의로 이름을 지어내지 않는다. */
export function categoryMeta(key: string): CategoryMeta {
  const meta = CATEGORY_META[key];
  return meta === undefined
    ? { key, label: key, hint: "직접 추가한 작업 종류" }
    : { key, label: meta.label, hint: meta.hint };
}

/** 쉼표로 나누고 빈 칸을 버린다. 저장 요청이 쓰는 형태다. */
export function parseChain(text: string): string[] {
  return (text ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function formatChain(chain: readonly string[] | undefined): string {
  return (chain ?? []).join(", ");
}

/** 서버 값과 편집 값이 실제로 다른지. 공백과 순서 표기는 정규화해서 비교한다. */
export function isDirty(draftText: string, serverChain: readonly string[] | undefined): boolean {
  return formatChain(parseChain(draftText)) !== formatChain(serverChain);
}

/** 저장하지 않은 편집이 있는 키들. 화면 위쪽에 건수를 적는 데 쓴다. */
export function dirtyKeys(draft: DraftMap, effective: ChainMap): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(draft)) {
    if (isDirty(draft[key], effective[key])) keys.push(key);
  }
  keys.sort();
  return keys;
}

/**
 * 서버에서 새 값이 왔을 때 만들 편집 상태.
 * 사용자가 손대지 않은 키만 서버 값으로 맞추고, **손댄 키는 그대로 둔다.**
 * 손대지 않았다는 판정은 "직전 서버 값과 같다"이다.
 */
export function mergeServerChains(
  previousDraft: DraftMap,
  previousEffective: ChainMap,
  nextEffective: ChainMap
): DraftMap {
  const next: DraftMap = {};
  for (const key of Object.keys(nextEffective)) {
    const draftText = previousDraft[key];
    if (draftText !== undefined && isDirty(draftText, previousEffective[key])) {
      next[key] = draftText;
      continue;
    }
    next[key] = formatChain(nextEffective[key]);
  }

  // 서버가 더 이상 주지 않는 키라도 사용자가 편집 중이면 잃지 않는다.
  for (const key of Object.keys(previousDraft)) {
    if (next[key] !== undefined) continue;
    if (isDirty(previousDraft[key], previousEffective[key])) next[key] = previousDraft[key];
  }

  return next;
}

/** 저장 요청에 실을 정책. 빈 칸은 빈 목록이 되어 기본값을 쓰라는 뜻이 된다. */
export function buildPolicy(draft: DraftMap): ChainMap {
  const policy: ChainMap = {};
  for (const key of Object.keys(draft)) {
    policy[key] = parseChain(draft[key]);
  }
  return policy;
}

/** 사용자 지정이 걸린 키 수. 기본값과 다른 항목만 센다. */
export function overrideCount(overrides: ChainMap): number {
  let count = 0;
  for (const key of Object.keys(overrides)) {
    if ((overrides[key] ?? []).length > 0) count += 1;
  }
  return count;
}

/** 한 항목의 접힌 상태 요약. 무엇이 쓰이는지 한 줄로 말한다. */
export function describeChain(effective: readonly string[] | undefined, hasOverride: boolean): string {
  const text = formatChain(effective);
  if (text.length === 0) return hasOverride ? "빈 경로(기본값 사용)" : "기본값";
  return text;
}

export function formatDecisionTime(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

/** 로컬 모델 점검 항목의 사람 말 이름. 모르는 이름은 원문 그대로. */
export function localCheckLabel(name: string): string {
  if (name === "offline_flag") return "오프라인 설정";
  if (name === "local_models") return "로컬 모델";
  if (name === "cloud_credentials") return "클라우드 키";
  if (name === "provider_routing") return "경로 전환";
  return name;
}
