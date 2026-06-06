import type { LucideIcon } from "lucide-react";
import { Activity, Cpu, FolderKanban, Home, PanelsTopLeft, Settings } from "lucide-react";
import type { DesktopPageId } from "./DesktopNavigation";

// 2단 네비게이션의 상위 "영역" 정의 — 17개 평면 메뉴를 6개 영역으로 묶는다.
// 페이지 → 영역 매핑의 단일 출처. 레일(아이콘)과 서브패널(페이지 목록)이 모두 이걸 참조한다.
export type NavAreaId = "home" | "workspace" | "projects" | "engine" | "monitor" | "system";

export type NavAreaDefinition = {
  id: NavAreaId;
  label: string;
  icon: LucideIcon;
  pages: DesktopPageId[];
};

export const NAV_AREAS: NavAreaDefinition[] = [
  { id: "home", label: "홈", icon: Home, pages: ["home"] },
  { id: "workspace", label: "워크스페이스", icon: PanelsTopLeft, pages: ["ask", "build", "automate", "explore", "refactor"] },
  { id: "projects", label: "프로젝트", icon: FolderKanban, pages: ["projects", "planning", "notebooks"] },
  { id: "engine", label: "엔진", icon: Cpu, pages: ["agents", "skills", "routing", "logic"] },
  { id: "monitor", label: "모니터", icon: Activity, pages: ["activity", "insights", "operations"] },
  { id: "system", label: "설정", icon: Settings, pages: ["settings"] }
];

const PAGE_TO_AREA = new Map<DesktopPageId, NavAreaId>();
for (const area of NAV_AREAS) {
  for (const page of area.pages) {
    PAGE_TO_AREA.set(page, area.id);
  }
}

/** 페이지가 속한 영역을 돌려준다. 매핑이 없으면(예: 숨김 shell) 홈으로 폴백. */
export function areaForPage(page: DesktopPageId): NavAreaId {
  return PAGE_TO_AREA.get(page) ?? "home";
}

/** 영역의 기본(첫) 페이지. selectArea가 마지막 방문 페이지를 모를 때 사용. */
export function firstPageOfArea(areaId: NavAreaId): DesktopPageId {
  return NAV_AREAS.find((area) => area.id === areaId)?.pages[0] ?? "home";
}

export function areaDefinition(areaId: NavAreaId): NavAreaDefinition {
  return NAV_AREAS.find((area) => area.id === areaId) ?? NAV_AREAS[0];
}
