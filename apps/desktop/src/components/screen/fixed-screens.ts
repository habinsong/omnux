/**
 * 화면 높이에 고정되는 페이지 목록.
 *
 * 여기 있는 페이지는 페이지 자체가 스크롤되지 않는다. 본문이 남은 높이를 정확히 차지하고
 * 스크롤은 펼친 칸 안쪽에서만 생긴다. 새 화면 껍데기(`Screen`)로 옮긴 페이지를 여기에 넣는다.
 * 아직 옮기지 않은 페이지는 예전처럼 페이지가 스크롤된다.
 */
export const FIXED_SCREEN_PAGES = new Set<string>(["home", "insights", "activity", "operations", "routing", "agents", "refactor", "skills", "notebooks", "shell", "projects", "extensions", "logic", "settings", "explore", "automate", "planning", "ask", "build"]);

export function isFixedScreenPage(pageId: string): boolean {
  return FIXED_SCREEN_PAGES.has(pageId);
}
