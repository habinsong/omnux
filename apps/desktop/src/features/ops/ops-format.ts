/* ============================================================================
   상태 화면의 표시 형식(순수 모듈).
   상태 색·이름은 공용 모듈(`components/ui/status-tone`)이 맡는다. 여기서는 값 형식만 다룬다.
   ============================================================================ */

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}초`;
}

/** ISO 문자열. 해석하지 못하면 원문을 남긴다(값을 조용히 "-" 로 바꾸지 않는다). */
export function formatUtc(value: string): string {
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

export function formatEpochMs(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

/** 긴 경로를 뒤쪽 몇 조각만 남겨 줄인다. 원문은 title 속성으로 함께 보여준다. */
export function compactPath(value: string, maxSegments = 4): string {
  const normalized = (value ?? "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return normalized || "/";
  return `.../${segments.slice(-maxSegments).join("/")}`;
}

export function basename(value: string): string {
  const normalized = (value ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").filter(Boolean).pop() || normalized || "/";
}

export type FileCandidate = {
  key: string;
  path: string;
  name: string;
  description: string;
  source: string;
  isDirectory: boolean;
  browsePath: string;
};

type CandidateInput = {
  entries: readonly { name: string; description: string; selectPath: string; browsePath: string; isDirectory: boolean }[];
  recentFiles: readonly string[];
  currentPath: string;
  query: string;
};

/**
 * 파일 고르기 후보.
 * 같은 경로를 여러 번 넣지 않고, 사용자가 직접 친 경로도 후보로 받는다.
 */
export function buildFileCandidates(input: CandidateInput): FileCandidate[] {
  const candidates: FileCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: Omit<FileCandidate, "key">) => {
    const path = candidate.path.trim();
    if (path.length === 0) return;
    const key = `${candidate.isDirectory ? "dir" : "file"}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, key, path });
  };

  for (const entry of input.entries) {
    push({
      path: entry.isDirectory ? entry.browsePath : entry.selectPath,
      name: entry.name,
      description: entry.description || entry.selectPath || entry.browsePath,
      source: "현재 폴더",
      isDirectory: entry.isDirectory,
      browsePath: entry.browsePath
    });
  }

  for (const path of input.recentFiles) {
    push({ path, name: basename(path), description: "최근에 연 파일", source: "최근", isDirectory: false, browsePath: "" });
  }

  if (input.currentPath) {
    push({
      path: input.currentPath,
      name: basename(input.currentPath),
      description: "지금 보고 있는 파일",
      source: "현재",
      isDirectory: false,
      browsePath: ""
    });
  }

  const typed = input.query.trim();
  if (/[/\\.]|^~/.test(typed)) {
    push({ path: typed, name: basename(typed), description: "직접 입력한 경로", source: "직접", isDirectory: false, browsePath: "" });
  }

  return candidates;
}

export const FILE_CANDIDATE_LIMIT = 40;

/** 폴더를 먼저, 그다음 경로 순. 검색어가 있으면 이름·경로·설명·출처에서 찾는다. */
export function filterFileCandidates(candidates: readonly FileCandidate[], query: string): FileCandidate[] {
  const sorted = [...candidates].sort(
    (left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.path.localeCompare(right.path)
  );
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return sorted.slice(0, FILE_CANDIDATE_LIMIT);
  return sorted
    .filter((candidate) =>
      `${candidate.name} ${candidate.path} ${candidate.description} ${candidate.source}`.toLowerCase().includes(normalized)
    )
    .slice(0, FILE_CANDIDATE_LIMIT);
}
