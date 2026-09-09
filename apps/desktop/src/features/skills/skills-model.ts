/* ============================================================================
   도구(스킬) 화면의 순수 모델.
   화면·저장소를 가져오지 않는다.

   실제 앱에서 확인한 문제:
     - 새 도구를 저장해도 편집기가 계속 "새 도구"로 남아, 저장을 한 번 더 누르면
       "같은 이름의 스킬이 이미 있습니다" 로 실패했다. 방금 자기가 저장한 것인데도.
     - 목록 조회가 실패하면 목록이 통째로 비워졌다.
     - 어떤 조회 응답이든 편집기를 덮어써서, 늦게 온 이전 응답이 화면을 바꿀 수 있었다.
   ============================================================================ */

export type SkillScope = "project" | "global";

export type SkillListItem = {
  name: string;
  scope: SkillScope;
  description: string;
};

export type SkillEditorState = {
  name: string;
  scope: SkillScope;
  description: string;
  body: string;
  /** 아직 저장한 적 없는 도구인지. 저장에 성공하면 false 가 되어야 한다. */
  isNew: boolean;
};

/** 서버가 받는 이름 규칙. 소문자·숫자·하이픈, 첫 글자는 소문자나 숫자. */
export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function skillKey(item: { name: string; scope: SkillScope }): string {
  return `${item.scope}:${item.name}`;
}

export function scopeLabel(scope: SkillScope | string): string {
  return scope === "global" ? "전역" : "프로젝트";
}

export function parseScope(value: string): SkillScope {
  return value === "global" ? "global" : "project";
}

/** 저장을 못 하는 이유. 빈 문자열이면 눌러도 된다. */
export function describeSaveBlock(editor: SkillEditorState | null): string {
  if (editor === null) return "먼저 도구를 고르거나 새로 만드세요.";
  const name = editor.name.trim();
  if (name.length === 0) return "도구 이름을 입력하세요.";
  if (editor.isNew && !SKILL_NAME_PATTERN.test(name)) {
    return "이름은 소문자·숫자·하이픈만 쓸 수 있고 소문자나 숫자로 시작해야 합니다.";
  }
  if (editor.body.trim().length === 0) return "본문을 입력하세요.";
  return "";
}

/** 이름 칸에 바로 보여줄 안내. 잘못된 값일 때만 문구가 바뀐다. */
export function describeNameHint(editor: SkillEditorState | null): { text: string; invalid: boolean } {
  if (editor === null) return { text: "", invalid: false };
  const name = editor.name.trim();
  if (editor.isNew && name.length > 0 && !SKILL_NAME_PATTERN.test(name)) {
    return { text: "소문자·숫자·하이픈만 쓸 수 있습니다.", invalid: true };
  }
  return { text: "예: ui-review, backend-audit", invalid: false };
}

/**
 * 목록 응답을 반영할지.
 * 실패 응답에는 항목이 없다. 그 값을 그대로 쓰면 이미 받아 둔 목록이 지워진다.
 */
export function shouldReplaceList(ok: boolean, itemCount: number, previousCount: number): boolean {
  if (ok) return true;
  // 실패인데 항목이 하나도 없으면 이전 목록을 지키는 편이 낫다.
  return itemCount > 0 || previousCount === 0;
}

export function filterSkills(items: readonly SkillListItem[], query: string): SkillListItem[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return [...items];
  return items.filter((item) =>
    `${item.name} ${item.scope} ${scopeLabel(item.scope)} ${item.description}`.toLowerCase().includes(normalized)
  );
}

export function countByScope(items: readonly SkillListItem[]): { project: number; global: number } {
  let project = 0;
  let global = 0;
  for (const item of items) {
    if (item.scope === "global") global += 1;
    else project += 1;
  }
  return { project, global };
}

/** 대화에서 이 도구를 부르는 방법. 이름이 없으면 그렇게 말한다. */
export function describeUsage(name: string): string {
  const trimmed = name.trim();
  return trimmed.length === 0 ? "이름을 먼저 입력하세요." : `대화에서 "${trimmed} 도구 사용" 이라고 적으면 됩니다.`;
}

/** 새 도구 본문 기본 양식. */
export function defaultSkillBody(name: string): string {
  const title =
    name
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || "새 도구";

  return [
    `# ${title}`,
    "",
    "## 언제 쓰나",
    "- 이 도구가 맡을 일을 한두 문장으로 적는다.",
    "",
    "## 어떻게 하나",
    "- 입력에서 먼저 확인할 것을 적는다.",
    "- 모자란 정보가 있으면 짧게 한 번만 되묻는다.",
    "- 요청한 범위 안에서 끝까지 처리한다.",
    "",
    "## 답할 때",
    "- 근거가 없으면 추측하지 않고 모른다고 적는다.",
    "- 배경 설명보다 바로 쓸 수 있는 결과를 앞에 둔다.",
    "",
    "## 마치기 전에",
    "- 원래 요청을 다 반영했는지 확인한다.",
    "- 요청하지 않은 것을 덧붙이지 않았는지 확인한다."
  ].join("\n");
}

export const SKILL_REQUEST_PREFIX = "skill-";

export function skillRequestId(kind: "list" | "get" | "save" | "delete", sequence: number): string {
  return `${SKILL_REQUEST_PREFIX}${kind}-${sequence}`;
}
