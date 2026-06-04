import { registerDesktopRequestTypes, sendDesktopRequest } from "./desktop-message-gateway";

// Memory index/detail tools. 검색 결과 상세 읽기와 FTS 인덱스 재구축만 담당한다.
registerDesktopRequestTypes("memory_get", "memory_index_rebuild");

export const requestDesktopMemory = {
  get(memoryPath: string, fromLine?: number, lines?: number) {
    const payload: Record<string, unknown> = { type: "memory_get", memoryPath: memoryPath.trim() };
    if (fromLine && fromLine > 0) payload.fromLine = fromLine;
    if (lines && lines > 0) payload.lines = lines;
    return sendDesktopRequest(payload as { type: string } & Record<string, unknown>);
  },
  rebuildIndex() {
    return sendDesktopRequest({ type: "memory_index_rebuild" });
  }
};
