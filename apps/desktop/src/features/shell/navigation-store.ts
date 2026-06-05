import { create } from "zustand";
import type { DesktopPageId } from "./DesktopNavigation";
import { areaForPage, firstPageOfArea, type NavAreaId } from "./nav-areas";

export type DesktopRoutePayload = {
  input?: string;
  mode?: string;
  create?: boolean;
  focus?: string;
  projectKey?: string;
  projectName?: string;
  projectPath?: string;
  openAttachmentPanel?: boolean;
};

// 데스크톱 활성 페이지와 route payload를 보관하는 작은 네비게이션 store.
// presentation 전용이며, payload는 홈/팔레트/프로젝트에서 목적지 페이지 초안으로만 소비한다.
type NavigationState = {
  activePage: DesktopPageId;
  routePayload: DesktopRoutePayload | null;
  routeVersion: number;
  // 영역별 마지막 방문 페이지 — 레일에서 영역을 다시 누르면 보던 곳으로 복귀시킨다.
  lastPageByArea: Partial<Record<NavAreaId, DesktopPageId>>;
  setActivePage: (page: DesktopPageId, payload?: DesktopRoutePayload | null) => void;
  selectArea: (area: NavAreaId) => void;
  clearRoutePayload: () => void;
};

export const useDesktopNavigationStore = create<NavigationState>((set, get) => ({
  activePage: "home",
  routePayload: null,
  routeVersion: 0,
  lastPageByArea: { home: "home" },
  setActivePage: (page, payload = null) =>
    set((state) => ({
      activePage: page,
      routePayload: payload,
      routeVersion: state.routeVersion + 1,
      lastPageByArea: { ...state.lastPageByArea, [areaForPage(page)]: page }
    })),
  selectArea: (area) => {
    const target = get().lastPageByArea[area] ?? firstPageOfArea(area);
    get().setActivePage(target);
  },
  clearRoutePayload: () => set({ routePayload: null })
}));
