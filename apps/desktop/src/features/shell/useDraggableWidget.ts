import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDesktopWidgetStore, type WidgetLayout } from "./widget-store";

const WIDGET_TOP_MARGIN = 64;
const WIDGET_BOTTOM_MARGIN = 16;
const WIDGET_GAP = 12;
const DEFAULT_VIEWPORT_HEIGHT = 800;

type DraggableWidgetOptions = {
  readonly height: number;
  readonly order: number;
};

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function resolveDefaultY(defaultY: string | number, viewportHeight: number) {
  if (typeof defaultY === "number") return defaultY;

  const match = /^calc\(50%\s*([+-])\s*(\d+(?:\.\d+)?)px\)$/.exec(defaultY.trim());
  const operator = match?.[1];
  const amountText = match?.[2];
  if (!operator || !amountText) return WIDGET_TOP_MARGIN;

  const amount = Number(amountText);
  if (!Number.isFinite(amount)) return WIDGET_TOP_MARGIN;
  return viewportHeight * 0.5 + (operator === "-" ? -amount : amount);
}

function positionMapsEqual(left: Record<string, number>, right: Record<string, number>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

/**
 * 드래그 중인 위젯이 다른 위젯의 중심점을 넘으면 swap 정보를 반환한다.
 */
function detectOrderSwap(
  layouts: Record<string, WidgetLayout>,
  positions: Record<string, number>,
  active: { readonly id: string; readonly y: number }
): { a: string; b: string } | null {
  const activeLayout = layouts[active.id];
  if (!activeLayout) return null;

  const entries = Object.entries(layouts);
  if (entries.length < 2) return null;

  const activeMid = active.y + activeLayout.height / 2;

  for (const [otherId, otherLayout] of entries) {
    if (otherId === active.id) continue;

    const otherY = positions[otherId] ?? otherLayout.defaultY;
    const otherMid = otherY + otherLayout.height / 2;

    const activeAboveOther = activeLayout.order < otherLayout.order;
    const shouldSwap = activeAboveOther
      ? activeMid > otherMid
      : activeMid < otherMid;

    if (shouldSwap) {
      return { a: active.id, b: otherId };
    }
  }

  return null;
}

function normalizeWidgetPositions(
  positions: Record<string, number>,
  layouts: Record<string, WidgetLayout>,
  viewportHeight: number,
  active?: { readonly id: string; readonly y: number }
) {
  // 드래그 중이면 swap 감지하여 유효 레이아웃 생성
  let effectiveLayouts = layouts;
  let swap: { a: string; b: string } | null = null;

  if (active) {
    swap = detectOrderSwap(layouts, positions, active);
    if (swap) {
      const la = layouts[swap.a];
      const lb = layouts[swap.b];
      if (la && lb) {
        effectiveLayouts = {
          ...layouts,
          [swap.a]: { ...la, order: lb.order },
          [swap.b]: { ...lb, order: la.order }
        };
      }
    }
  }

  const ordered = Object.entries(effectiveLayouts).sort(([, left], [, right]) => left.order - right.order);
  if (ordered.length === 0) return { positions, swap };

  const maxBottom = Math.max(WIDGET_TOP_MARGIN, viewportHeight - WIDGET_BOTTOM_MARGIN);
  const next: Record<string, number> = { ...positions };

  if (active) {
    for (const [widgetId, layout] of ordered) {
      const requestedY = widgetId === active.id ? active.y : next[widgetId] ?? layout.defaultY;
      next[widgetId] = clamp(requestedY, WIDGET_TOP_MARGIN, maxBottom - layout.height);
    }
  } else {
    let previous: { readonly y: number; readonly height: number } | null = null;
    for (const [widgetId, layout] of ordered) {
      const requestedY = next[widgetId] ?? layout.defaultY;
      const clampedY = clamp(requestedY, WIDGET_TOP_MARGIN, maxBottom - layout.height);
      next[widgetId] = previous
        ? Math.max(clampedY, previous.y + previous.height + WIDGET_GAP)
        : clampedY;
      previous = { y: next[widgetId] ?? layout.defaultY, height: layout.height };
    }

    const lastEntry = ordered[ordered.length - 1];
    if (lastEntry) {
      const [lastId, lastLayout] = lastEntry;
      const overflow = (next[lastId] ?? lastLayout.defaultY) + lastLayout.height - maxBottom;
      if (overflow > 0) {
        for (const [widgetId] of ordered) {
          next[widgetId] = (next[widgetId] ?? effectiveLayouts[widgetId]?.defaultY ?? WIDGET_TOP_MARGIN) - overflow;
        }
      }
    }

    const firstEntry = ordered[0];
    if (firstEntry) {
      const [firstId, firstLayout] = firstEntry;
      const underflow = WIDGET_TOP_MARGIN - (next[firstId] ?? firstLayout.defaultY);
      if (underflow > 0) {
        for (const [widgetId] of ordered) {
          next[widgetId] = (next[widgetId] ?? effectiveLayouts[widgetId]?.defaultY ?? WIDGET_TOP_MARGIN) + underflow;
        }
      }
    }
  }

  return { positions: next, swap };
}

export function useDraggableWidget(id: string, defaultY: string | number, options: DraggableWidgetOptions) {
  const positions = useDesktopWidgetStore((state) => state.positions);
  const layouts = useDesktopWidgetStore((state) => state.layouts);
  const storeY = positions[id];
  const setWidgetLayout = useDesktopWidgetStore((state) => state.setWidgetLayout);
  const setWidgetPositions = useDesktopWidgetStore((state) => state.setWidgetPositions);
  const swapWidgetOrders = useDesktopWidgetStore((state) => state.swapWidgetOrders);
  const globalDragging = useDesktopWidgetStore((state) => state.globalDragging);
  const setGlobalDragging = useDesktopWidgetStore((state) => state.setGlobalDragging);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? DEFAULT_VIEWPORT_HEIGHT : window.innerHeight
  );

  // store에서 swap된 order가 있으면 그것을 사용
  const storeOrder = useDesktopWidgetStore((state) => state.layouts[id]?.order);
  const effectiveOrder = storeOrder ?? options.order;

  const layout = useMemo<WidgetLayout>(() => ({
    defaultY: resolveDefaultY(defaultY, viewportHeight),
    height: options.height,
    order: effectiveOrder
  }), [defaultY, options.height, effectiveOrder, viewportHeight]);

  // 현재 렌더링에 사용할 Y. 스토어에 있으면 스토어 값, 없으면 defaultY
  const currentY = storeY !== undefined ? storeY : layout.defaultY;

  const [isDragging, setIsDragging] = useState(false);
  
  // 드래그 상태를 추적하기 위한 ref
  const dragState = useRef({
    startY: 0,
    initialWidgetY: 0,
    dragging: false,
    moved: false // 클릭과 드래그 구분용
  });

  // swap 중복 호출 방지
  const lastSwapRef = useRef<{ a: string; b: string } | null>(null);

  useEffect(() => {
    setWidgetLayout(id, layout);
  }, [id, layout, setWidgetLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  useEffect(() => {
    if (globalDragging) return;
    const result = normalizeWidgetPositions(positions, { ...layouts, [id]: layout }, viewportHeight);
    if (!positionMapsEqual(positions, result.positions)) setWidgetPositions(result.positions);
  }, [id, layout, layouts, positions, setWidgetPositions, viewportHeight, globalDragging]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // 터치/펜/마우스 모두 대응. 왼쪽 버튼만 허용.
    if (e.button !== 0) return;
    
    // 드래그 중 다른 요소가 선택되거나 이벤트가 끊기지 않도록 캡처
    e.currentTarget.setPointerCapture(e.pointerId);

    // 요소의 현재 위치(픽셀) 가져오기.
    let startingY = 0;
    if (typeof currentY === "number") {
      startingY = currentY;
    } else {
      const widgetContainer = e.currentTarget.closest(".draggable-widget-container");
      if (widgetContainer instanceof HTMLElement) {
        startingY = widgetContainer.offsetTop;
      }
    }

    dragState.current = {
      startY: e.clientY,
      initialWidgetY: startingY,
      dragging: true,
      moved: false
    };
    lastSwapRef.current = null;
  }, [currentY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;

    const deltaY = e.clientY - dragState.current.startY;
    
    // 3px 이상 움직이면 드래그로 간주
    if (!dragState.current.moved && Math.abs(deltaY) > 3) {
      dragState.current.moved = true;
      setIsDragging(true);
      setGlobalDragging(true);
    }

    if (dragState.current.moved) {
      const nextY = dragState.current.initialWidgetY + deltaY;
      const height = typeof window !== "undefined" ? window.innerHeight : viewportHeight;
      const result = normalizeWidgetPositions(
        positions,
        { ...layouts, [id]: layout },
        height,
        { id, y: nextY }
      );
      setWidgetPositions(result.positions);

      // order swap 감지 → store에 반영 (중복 방지)
      if (result.swap) {
        const last = lastSwapRef.current;
        if (!last || last.a !== result.swap.a || last.b !== result.swap.b) {
          lastSwapRef.current = result.swap;
          swapWidgetOrders(result.swap.a, result.swap.b);
        }
      } else {
        lastSwapRef.current = null;
      }
    }
  }, [id, layout, layouts, positions, setWidgetPositions, swapWidgetOrders, viewportHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    const wasMoved = dragState.current.moved;
    dragState.current.dragging = false;
    dragState.current.moved = false;
    lastSwapRef.current = null;
    
    // 드래그가 끝난 직후 onClick 이벤트가 발생할 수 있으므로, 
    // 약간의 지연 후에 isDragging 플래그를 해제하여 onClick에서 필터링할 수 있게 함.
    if (wasMoved) {
      setGlobalDragging(false);
      setTimeout(() => setIsDragging(false), 50);
    }
  }, [setGlobalDragging]);

  return {
    y: currentY,
    isDragging,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp
    }
  };
}
