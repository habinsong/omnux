import { create } from "zustand";

const WIDGET_STORAGE_KEY = "omnux-desktop-widgets-v1";

export type WidgetLayout = {
  readonly defaultY: number;
  readonly height: number;
  readonly order: number;
};

type WidgetState = {
  positions: Record<string, number>;
  layouts: Record<string, WidgetLayout>;
  setWidgetLayout: (id: string, layout: WidgetLayout) => void;
  setWidgetPositionY: (id: string, y: number) => void;
  setWidgetPositions: (positions: Record<string, number>) => void;
};

function readStoredPositions(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WIDGET_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function savePositions(next: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export const useDesktopWidgetStore = create<WidgetState>((set, get) => ({
  positions: readStoredPositions(),
  layouts: {},
  setWidgetLayout: (id: string, layout: WidgetLayout) => {
    const previous = get().layouts[id];
    if (
      previous &&
      previous.defaultY === layout.defaultY &&
      previous.height === layout.height &&
      previous.order === layout.order
    ) {
      return;
    }
    set({ layouts: { ...get().layouts, [id]: layout } });
  },
  setWidgetPositionY: (id: string, y: number) => {
    const next = { ...get().positions, [id]: y };
    savePositions(next);
    set({ positions: next });
  },
  setWidgetPositions: (positions: Record<string, number>) => {
    savePositions(positions);
    set({ positions });
  }
}));
