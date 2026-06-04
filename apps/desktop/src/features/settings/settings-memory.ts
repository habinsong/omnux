export type MemorySearchResultItem = {
  path: string;
  snippet: string;
  score: number;
  source: string;
  memoryTier: string;
  lastAccessedAtUnixMs: number;
  startLine: number;
  endLine: number;
};

export type MemoryIndexStatus = {
  ok: boolean;
  message: string;
  error: string;
  scannedDocuments: number;
  indexedDocuments: number;
  skippedDocuments: number;
  removedDocuments: number;
  memoryDocuments: number;
  sessionDocuments: number;
  projectDocuments: number;
  elapsedMs: number;
  ftsAvailable: boolean;
  dbPath: string;
} | null;

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((item) => item as Record<string, unknown>) : [];
}

export function normalizeMemorySearchResults(value: unknown): MemorySearchResultItem[] {
  return records(value).map((item) => ({
    path: String(item.path || item.fullPath || ""),
    snippet: String(item.snippet || ""),
    score: Number(item.score || 0),
    source: String(item.source || ""),
    memoryTier: String(item.memoryTier || ""),
    lastAccessedAtUnixMs: Number(item.lastAccessedAtUnixMs || 0),
    startLine: Number(item.startLine || 0),
    endLine: Number(item.endLine || 0)
  }));
}

export function normalizeMemoryIndexStatus(message: Record<string, unknown>): NonNullable<MemoryIndexStatus> {
  const snapshot = (message.snapshot || {}) as Record<string, unknown>;
  return {
    ok: !!message.ok,
    message: String(message.message || ""),
    error: String(message.error || ""),
    scannedDocuments: Number(snapshot.scannedDocuments || 0),
    indexedDocuments: Number(snapshot.indexedDocuments || 0),
    skippedDocuments: Number(snapshot.skippedDocuments || 0),
    removedDocuments: Number(snapshot.removedDocuments || 0),
    memoryDocuments: Number(snapshot.memoryDocuments || 0),
    sessionDocuments: Number(snapshot.sessionDocuments || 0),
    projectDocuments: Number(snapshot.projectDocuments || 0),
    elapsedMs: Number(snapshot.elapsedMs || 0),
    ftsAvailable: !!snapshot.ftsAvailable,
    dbPath: String(snapshot.dbPath || "")
  };
}
