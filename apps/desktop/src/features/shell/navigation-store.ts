import { create } from "zustand";
import type { DesktopPageId } from "./DesktopNavigation";

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
  setActivePage: (page: DesktopPageId, payload?: DesktopRoutePayload | null) => void;
  clearRoutePayload: () => void;
};

export const useDesktopNavigationStore = create<NavigationState>((set) => ({
  activePage: "home",
  routePayload: null,
  routeVersion: 0,
  setActivePage: (page, payload = null) =>
    set((state) => ({
      activePage: page,
      routePayload: payload,
      routeVersion: state.routeVersion + 1
    })),
  clearRoutePayload: () => set({ routePayload: null })
}));
