import { create } from "zustand";
import type { DesktopPageId } from "./DesktopNavigation";

// 데스크톱 활성 페이지를 보관하는 작은 네비게이션 store. App.tsx와 각 page(예: Home 허브)가
// 공유해 cross-page 이동을 할 수 있게 한다. presentation 전용 — 도메인/WS 상태 없음.
type NavigationState = {
  activePage: DesktopPageId;
  setActivePage: (page: DesktopPageId) => void;
};

export const useDesktopNavigationStore = create<NavigationState>((set) => ({
  activePage: "home",
  setActivePage: (page) => set({ activePage: page })
}));
