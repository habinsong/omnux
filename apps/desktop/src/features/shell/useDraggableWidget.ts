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

function normalizeWidgetPositions(
  positions: Record<string, number>,
  layouts: Record<string, WidgetLayout>,
  viewportHeight: number,
  active?: { readonly id: string; readonly y: number }
) {
  const ordered = Object.entries(layouts).sort(([, left], [, right]) => left.order - right.order);
  if (ordered.length === 0) return positions;

  const maxBottom = Math.max(WIDGET_TOP_MARGIN, viewportHeight - WIDGET_BOTTOM_MARGIN);
  const next: Record<string, number> = { ...positions };

  for (const [widgetId, layout] of ordered) {
    const requestedY = active?.id === widgetId ? active.y : next[widgetId] ?? layout.defaultY;
    next[widgetId] = clamp(requestedY, WIDGET_TOP_MARGIN, maxBottom - layout.height);
  }

  let previous: { readonly y: number; readonly height: number } | null = null;
  for (const [widgetId, layout] of ordered) {
    const currentY = next[widgetId] ?? layout.defaultY;
    if (previous) {
      next[widgetId] = Math.max(currentY, previous.y + previous.height + WIDGET_GAP);
    }
    previous = { y: next[widgetId] ?? layout.defaultY, height: layout.height };
  }

  const lastEntry = ordered[ordered.length - 1];
  if (!lastEntry) return next;
  const [lastId, lastLayout] = lastEntry;
  const overflow = (next[lastId] ?? lastLayout.defaultY) + lastLayout.height - maxBottom;
  if (overflow > 0) {
    for (const [widgetId] of ordered) {
      next[widgetId] = (next[widgetId] ?? layouts[widgetId]?.defaultY ?? WIDGET_TOP_MARGIN) - overflow;
    }
  }

  const firstEntry = ordered[0];
  if (!firstEntry) return next;
  const [firstId, firstLayout] = firstEntry;
  const underflow = WIDGET_TOP_MARGIN - (next[firstId] ?? firstLayout.defaultY);
  if (underflow > 0) {
    for (const [widgetId] of ordered) {
      next[widgetId] = (next[widgetId] ?? layouts[widgetId]?.defaultY ?? WIDGET_TOP_MARGIN) + underflow;
    }
  }

  return next;
}

export function useDraggableWidget(id: string, defaultY: string | number, options: DraggableWidgetOptions) {
  const positions = useDesktopWidgetStore((state) => state.positions);
  const layouts = useDesktopWidgetStore((state) => state.layouts);
  const storeY = positions[id];
  const setWidgetLayout = useDesktopWidgetStore((state) => state.setWidgetLayout);
  const setWidgetPositions = useDesktopWidgetStore((state) => state.setWidgetPositions);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? DEFAULT_VIEWPORT_HEIGHT : window.innerHeight
  );

  const layout = useMemo<WidgetLayout>(() => ({
    defaultY: resolveDefaultY(defaultY, viewportHeight),
    height: options.height,
    order: options.order
  }), [defaultY, options.height, options.order, viewportHeight]);

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
    const next = normalizeWidgetPositions(positions, { ...layouts, [id]: layout }, viewportHeight);
    if (!positionMapsEqual(positions, next)) setWidgetPositions(next);
  }, [id, layout, layouts, positions, setWidgetPositions, viewportHeight]);

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
      // DOM에서 실제 픽셀 구하기 (문자열 calc/퍼센트일 경우)
      // 최상위 래퍼 기준 Y 좌표 추출.
      // e.currentTarget은 핸들(버튼), 우리는 전체 뷰의 Y가 필요하므로 offsetParent 등을 고려해야 함.
      // 안전하게 getBoundingClientRect를 사용하되, 부모(<main>등)가 relative면
      // 해당 값을 약간 조정해야 할 수도 있음. 그러나 보통 fixed/absolute면 getBoundingClientRect.top 이나 offsetTop 사용.
      
      const widgetContainer = e.currentTarget.closest(".draggable-widget-container");
      if (widgetContainer instanceof HTMLElement) {
        // HTMLElement.offsetTop 은 offsetParent 기준 좌표
        startingY = widgetContainer.offsetTop;
      }
    }

    dragState.current = {
      startY: e.clientY,
      initialWidgetY: startingY,
      dragging: true,
      moved: false
    };
  }, [currentY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;

    const deltaY = e.clientY - dragState.current.startY;
    
    // 3px 이상 움직이면 드래그로 간주
    if (!dragState.current.moved && Math.abs(deltaY) > 3) {
      dragState.current.moved = true;
      setIsDragging(true);
    }

    if (dragState.current.moved) {
      // 실시간 위치 업데이트
      const nextY = dragState.current.initialWidgetY + deltaY;
      const height = typeof window !== "undefined" ? window.innerHeight : viewportHeight;
      const next = normalizeWidgetPositions(
        positions,
        { ...layouts, [id]: layout },
        height,
        { id, y: nextY }
      );
      setWidgetPositions(next);
    }
  }, [id, layout, layouts, positions, setWidgetPositions, viewportHeight]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.dragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    const wasMoved = dragState.current.moved;
    dragState.current.dragging = false;
    dragState.current.moved = false;
    
    // 드래그가 끝난 직후 onClick 이벤트가 발생할 수 있으므로, 
    // 약간의 지연 후에 isDragging 플래그를 해제하여 onClick에서 필터링할 수 있게 함.
    if (wasMoved) {
      setTimeout(() => setIsDragging(false), 50);
    }
  }, []);

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
