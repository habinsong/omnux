/* ============================================================================
   노트 화면의 순수 모델.
   화면·저장소를 가져오지 않는다.

   확인한 문제:
     - 서버는 문서 본문을 20,000자에서 자르고 `contentTruncated` 로 알려 주는데,
       화면이 그 값을 읽지 않아 **잘린 문서를 전문인 것처럼** 보여줬다.
     - 저장 중에 사용자가 더 쓴 초안이 저장 성공 응답에 통째로 지워졌다.
     - 프로젝트 기준을 바꿔도 늦게 온 이전 응답이 새 화면을 덮어썼다.
   ============================================================================ */

export type NotebookKind = "learning" | "decision" | "verification";
export type NotebookField = "learnings" | "decisions" | "verification" | "handoff";

export type NotebookDocument = {
  exists: boolean;
  content: string;
  path: string;
  /** 서버가 본문을 잘랐는지. 화면은 이 사실을 반드시 밝혀야 한다. */
  truncated: boolean;
  sizeBytes: number;
  updatedAtUtc: string;
};

export const EMPTY_DOCUMENT: NotebookDocument = {
  exists: false,
  content: "",
  path: "",
  truncated: false,
  sizeBytes: 0,
  updatedAtUtc: ""
};

export type NotebookSnapshot = Record<NotebookField, NotebookDocument>;

export const EMPTY_SNAPSHOT: NotebookSnapshot = {
  learnings: EMPTY_DOCUMENT,
  decisions: EMPTY_DOCUMENT,
  verification: EMPTY_DOCUMENT,
  handoff: EMPTY_DOCUMENT
};

export type NotebookDocumentDefinition = {
  field: NotebookField;
  label: string;
  description: string;
  /** 이 문서에 바로 기록할 수 있는 종류. 이어보기 문서는 직접 쓰지 않는다. */
  kind: NotebookKind | null;
};

export const NOTEBOOK_DOCUMENTS: NotebookDocumentDefinition[] = [
  { field: "decisions", label: "결정", description: "무엇을 하기로 했고 무엇은 안 하기로 했는지.", kind: "decision" },
  { field: "verification", label: "확인", description: "직접 확인한 것과 아직 못 본 것.", kind: "verification" },
  { field: "learnings", label: "메모", description: "다음에 다시 쓸 내용과 헷갈렸던 점.", kind: "learning" },
  { field: "handoff", label: "이어보기", description: "지금 상태를 한 번에 묶은 문서. 버튼으로 만듭니다.", kind: null }
];

export const NOTEBOOK_KINDS: { kind: NotebookKind; label: string; field: NotebookField }[] = [
  { kind: "decision", label: "결정", field: "decisions" },
  { kind: "verification", label: "확인", field: "verification" },
  { kind: "learning", label: "메모", field: "learnings" }
];

export function kindLabel(kind: NotebookKind): string {
  return NOTEBOOK_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

export function fieldForKind(kind: NotebookKind): NotebookField {
  return NOTEBOOK_KINDS.find((entry) => entry.kind === kind)?.field ?? "learnings";
}

export const NOTEBOOK_TEMPLATES: Record<NotebookKind, string> = {
  decision: ["무엇을 하기로 했나:", "- ", "", "왜 그렇게 정했나:", "- ", "", "이번에는 안 하기로 한 것:", "- "].join("\n"),
  verification: ["무엇을 확인했나:", "- ", "", "어떻게 확인했나:", "- ", "", "결과:", "- ", "", "아직 못 본 것:", "- "].join("\n"),
  learning: ["오늘 알게 된 것:", "- ", "", "다음에 다시 쓸 것:", "- ", "", "조심할 것:", "- "].join("\n")
};

/**
 * 초안 합치기.
 * 이미 있는 내용을 지우지 않고 아래에 붙인다. 같은 내용을 두 번 붙이지 않는다.
 */
export function mergeDraft(current: string, addition: string): string {
  const base = (current ?? "").trim();
  const next = (addition ?? "").trim();
  if (base.length === 0) return next;
  if (next.length === 0 || base.includes(next)) return base;
  return `${base}\n\n${next}`;
}

/**
 * 저장에 성공했을 때 남길 초안.
 * 보낸 내용만 지운다. 보내는 동안 사용자가 더 쓴 부분은 지우지 않는다.
 */
export function draftAfterAppend(currentDraft: string, sentText: string): string {
  const draft = currentDraft ?? "";
  const sent = (sentText ?? "").trim();
  if (sent.length === 0) return draft;
  if (draft.trim() === sent) return "";
  const index = draft.indexOf(sent);
  if (index < 0) return draft;
  return `${draft.slice(0, index)}${draft.slice(index + sent.length)}`.trim();
}

/** 기록을 못 하는 이유. 빈 문자열이면 눌러도 된다. */
export function describeAppendBlock(draft: string): string {
  return (draft ?? "").trim().length === 0 ? "남길 내용을 입력하세요." : "";
}

/** 문서 한 건을 한 줄로 설명한다. 잘린 사실을 반드시 포함한다. */
export function describeDocument(document: NotebookDocument): string {
  if (!document.exists) return "아직 없음";
  const parts: string[] = [];
  if (document.sizeBytes > 0) parts.push(formatBytes(document.sizeBytes));
  if (document.updatedAtUtc) parts.push(`${formatUpdated(document.updatedAtUtc)} 수정`);
  if (document.truncated) parts.push("일부만 받음");
  return parts.length === 0 ? "있음" : parts.join(" · ");
}

/** 잘린 문서에 붙일 안내. 잘리지 않았으면 빈 문자열. */
export function describeTruncation(document: NotebookDocument): string {
  if (!document.truncated) return "";
  return `이 문서는 너무 길어 앞부분만 받았습니다. 전체 내용은 파일에서 확인하세요: ${document.path || "경로 없음"}`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB"] as const;
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function formatUpdated(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

/** 아직 없는 문서. 화면 위쪽에 무엇부터 채우면 되는지 적는다. */
export function missingDocuments(snapshot: NotebookSnapshot): NotebookDocumentDefinition[] {
  return NOTEBOOK_DOCUMENTS.filter((definition) => !snapshot[definition.field].exists);
}

/** 프로젝트 기준 표시. 비우면 기본 프로젝트다. */
export function describeProject(projectKey: string): string {
  const trimmed = (projectKey ?? "").trim();
  return trimmed.length === 0 ? "기본 프로젝트" : trimmed;
}

export const NOTEBOOK_REQUEST_PREFIX = "notebook-";

export function notebookRequestId(action: "get" | "append" | "handoff", sequence: number): string {
  return `${NOTEBOOK_REQUEST_PREFIX}${action}-${sequence}`;
}
