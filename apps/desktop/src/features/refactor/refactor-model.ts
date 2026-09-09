/* ============================================================================
   리뷰(Safe Refactor) 화면의 순수 모델.
   화면·저장소를 가져오지 않는다.

   이 화면은 파일을 실제로 바꾼다. 그래서 "무엇을 왜 못 하는지"를 화면이 정확히 말해야 한다.
   이전 화면에서 실제로 확인한 문제:
     - 요청을 보내고 화면을 떠났다 돌아오면 **모든 버튼이 영원히 비활성**이었다.
     - 새 미리보기가 실패해도 **이전 previewId 가 남아 적용 버튼이 켜져 있었다.**
     - 줄을 지울 수 없었다(교체 코드가 비면 요청 자체를 막았다).
   ============================================================================ */

export type RefactorRequestKind = "read" | "preview" | "ast" | "rename" | "apply";

export type AnchorLine = {
  lineNumber: number;
  hash: string;
  content: string;
};

export const REQUEST_PREFIX = "refactor-";

export function buildRequestId(kind: RefactorRequestKind, sequence: number): string {
  return `${REQUEST_PREFIX}${kind}-${sequence}`;
}

export function requestKindOf(requestId: string): RefactorRequestKind | null {
  if (!requestId.startsWith(REQUEST_PREFIX)) return null;
  const rest = requestId.slice(REQUEST_PREFIX.length);
  const kind = rest.split("-")[0] as RefactorRequestKind;
  return ["read", "preview", "ast", "rename", "apply"].includes(kind) ? kind : null;
}

/**
 * 응답이 오지 않아도 화면이 잠기지 않게 하는 기한.
 * 화면을 떠났다 돌아와도 이 기한이 지나면 잠금이 풀린다.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

export type AnchorSelection =
  | { ok: true; lines: AnchorLine[] }
  | { ok: false; reason: string };

/**
 * 고른 줄 범위가 방금 읽은 파일의 줄과 정확히 맞는지 확인한다.
 * 맞지 않으면 서버에 보내지 않는다. 파일이 그 사이에 바뀌었을 수 있기 때문이다.
 */
export function selectAnchorRange(
  lines: readonly AnchorLine[],
  startLine: number,
  endLine: number
): AnchorSelection {
  if (!Number.isInteger(startLine) || startLine < 1) return { ok: false, reason: "시작 줄 번호를 확인하세요." };
  if (!Number.isInteger(endLine) || endLine < startLine) return { ok: false, reason: "끝 줄은 시작 줄보다 같거나 커야 합니다." };
  if (lines.length === 0) return { ok: false, reason: "먼저 파일을 읽으세요." };

  const selected = lines
    .filter((line) => line.lineNumber >= startLine && line.lineNumber <= endLine)
    .sort((left, right) => left.lineNumber - right.lineNumber);

  const expected = endLine - startLine + 1;
  if (selected.length !== expected) {
    return { ok: false, reason: "읽어 둔 줄과 범위가 맞지 않습니다. 파일을 다시 읽으세요." };
  }
  return { ok: true, lines: selected };
}

export type RefactorFormState = {
  path: string;
  anchorLines: readonly AnchorLine[];
  anchorStartLine: string;
  anchorEndLine: string;
  anchorReplacement: string;
  /** 줄을 지우려는 의도인지. 빈 교체 코드를 실수로 보내지 않기 위한 명시 표시다. */
  anchorDelete: boolean;
  pattern: string;
  replacement: string;
  symbol: string;
  newName: string;
  previewId: string;
  previewPath: string;
};

/** 못 누르는 이유. 빈 문자열이면 눌러도 된다. */
export function describeBlocked(kind: RefactorRequestKind, state: RefactorFormState): string {
  if (kind === "read") {
    return state.path.trim().length === 0 ? "파일 경로를 입력하세요." : "";
  }

  if (kind === "preview") {
    if (state.anchorLines.length === 0) return "먼저 파일을 읽으세요.";
    const selection = selectAnchorRange(
      state.anchorLines,
      Number(state.anchorStartLine || 0),
      Number(state.anchorEndLine || 0)
    );
    if (!selection.ok) return selection.reason;
    if (!state.anchorDelete && state.anchorReplacement.length === 0) {
      return "교체할 코드를 입력하거나 「이 줄을 지웁니다」를 고르세요.";
    }
    return "";
  }

  if (kind === "ast") {
    if (state.path.trim().length === 0) return "파일 경로를 입력하세요.";
    return state.pattern.trim().length === 0 ? "찾을 패턴을 입력하세요." : "";
  }

  if (kind === "rename") {
    if (state.path.trim().length === 0) return "파일 경로를 입력하세요.";
    if (state.symbol.trim().length === 0) return "바꿀 이름을 입력하세요.";
    return state.newName.trim().length === 0 ? "새 이름을 입력하세요." : "";
  }

  if (state.previewId.trim().length === 0) return "먼저 미리보기를 만드세요.";
  if (isPreviewForAnotherFile(state)) return "미리보기가 다른 파일 것입니다. 다시 만드세요.";
  return "";
}

/** 미리보기가 지금 보고 있는 파일 것인지. 다른 파일이면 적용하면 안 된다. */
export function isPreviewForAnotherFile(state: Pick<RefactorFormState, "previewPath" | "path">): boolean {
  const previewPath = state.previewPath.trim();
  const path = state.path.trim();
  if (previewPath.length === 0 || path.length === 0) return false;
  return !previewPath.endsWith(path) && !path.endsWith(previewPath);
}

/** 지우기일 때 서버에 보낼 교체 코드. */
export function replacementForRequest(state: Pick<RefactorFormState, "anchorDelete" | "anchorReplacement">): string {
  return state.anchorDelete ? "" : state.anchorReplacement;
}

/** 읽은 결과로 채울 기본 줄 범위. 처음 몇 줄만 고른다. */
export function defaultAnchorRange(lines: readonly AnchorLine[]): { start: string; end: string } {
  if (lines.length === 0) return { start: "", end: "" };
  const start = lines[0].lineNumber;
  const end = lines[Math.min(lines.length - 1, 4)].lineNumber;
  return { start: String(start), end: String(end) };
}

/** 읽은 본문을 줄 번호와 함께 보여준다. */
export function formatAnchorContent(lines: readonly AnchorLine[]): string {
  return lines.map((line) => `${String(line.lineNumber).padStart(4, " ")}  ${line.content}`).join("\n");
}

export const REQUEST_LABELS: Record<RefactorRequestKind, string> = {
  read: "파일 읽기",
  preview: "줄 교체 미리보기",
  ast: "패턴 치환 미리보기",
  rename: "이름 변경 미리보기",
  apply: "적용"
};
