import { create } from "zustand";

const WIDGET_STORAGE_KEY = "omnux-desktop-widgets-v1";
const WIDGET_ORDER_KEY = "omnux-desktop-widget-orders-v1";

export type WidgetLayout = {
  readonly defaultY: number;
  readonly height: number;
  readonly order: number;
};

type WidgetState = {
  positions: Record<string, number>;
  orders: Record<string, number>;
  layouts: Record<string, WidgetLayout>;
  globalDragging: boolean;
  setWidgetLayout: (id: string, layout: WidgetLayout) => void;
  setWidgetPositionY: (id: string, y: number) => void;
  setWidgetPositions: (positions: Record<string, number>) => void;
  swapWidgetOrders: (a: string, b: string) => void;
  setGlobalDragging: (value: boolean) => void;
};

function readStored(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function saveStored(key: string, next: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export const useDesktopWidgetStore = create<WidgetState>((set, get) => ({
  positions: readStored(WIDGET_STORAGE_KEY),
  orders: readStored(WIDGET_ORDER_KEY),
  layouts: {},
  globalDragging: false,
  setWidgetLayout: (id: string, layout: WidgetLayout) => {
    // 저장된 order가 있으면 그것을 우선 사용 (swap된 order 유지)
    const storedOrder = get().orders[id];
    const effectiveLayout = storedOrder !== undefined
      ? { ...layout, order: storedOrder }
      : layout;
    const previous = get().layouts[id];
    if (
      previous &&
      previous.defaultY === effectiveLayout.defaultY &&
      previous.height === effectiveLayout.height &&
      previous.order === effectiveLayout.order
    ) {
      return;
    }
    set({ layouts: { ...get().layouts, [id]: effectiveLayout } });
  },
  setWidgetPositionY: (id: string, y: number) => {
    const next = { ...get().positions, [id]: y };
    saveStored(WIDGET_STORAGE_KEY, next);
    set({ positions: next });
  },
  setWidgetPositions: (positions: Record<string, number>) => {
    saveStored(WIDGET_STORAGE_KEY, positions);
    set({ positions });
  },
  swapWidgetOrders: (a: string, b: string) => {
    const { layouts, orders } = get();
    const la = layouts[a];
    const lb = layouts[b];
    if (!la || !lb || la.order === lb.order) return;
    const newOrders = { ...orders, [a]: lb.order, [b]: la.order };
    saveStored(WIDGET_ORDER_KEY, newOrders);
    set({
      orders: newOrders,
      layouts: {
        ...layouts,
        [a]: { ...la, order: lb.order },
        [b]: { ...lb, order: la.order }
      }
    });
  },
  setGlobalDragging: (value: boolean) => {
    set({ globalDragging: value });
  }
}));
