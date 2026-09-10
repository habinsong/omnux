import type { ReactNode } from "react";
import { useCallback, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "./primitives";

/* ============================================================================
   Accordion — 직접 작성한 접이식 본문 primitive.
   외부 컴포넌트 코드를 복사하지 않고 WAI-ARIA disclosure 패턴만 참고했다.
   기본 상태는 닫힘이다. 구성 요소를 숨겨 화면을 단순하게 유지하는 것이 목적이다.
   ============================================================================ */

export type AccordionItemProps = {
  /** 목록 안에서 고유한 값. 제어 모드에서 열림 여부를 판정한다. */
  value: string;
  title: string;
  /** 제목 오른쪽에 놓는 짧은 상태 문구. 접힌 상태에서도 보여야 하는 정보만 넣는다. */
  summary?: ReactNode;
  icon?: LucideIcon;
  /** 헤더 오른쪽 끝의 조작부. 클릭이 펼침/닫힘으로 전파되지 않는다. */
  actions?: ReactNode;
  /**
   * 항목 테두리 강조. 오류·주의처럼 접힌 상태에서도 구분되어야 하는 경우에만 쓴다.
   * 색만으로 뜻을 전하지 않도록 본문이나 actions 에 글자 표시를 함께 둔다.
   */
  tone?: "default" | "warning" | "destructive";
  disabled?: boolean;
  children: ReactNode;
};

type AccordionProps = {
  items: AccordionItemProps[];
  /** 열린 항목의 value 목록. 지정하지 않으면 내부 상태로 동작한다. */
  open?: string[];
  onOpenChange?: (next: string[]) => void;
  /** true 면 한 번에 하나만 열린다. */
  single?: boolean;
  className?: string;
};

export function Accordion({ items, open, onOpenChange, single = false, className }: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState<string[]>([]);
  const isControlled = open !== undefined;
  const openValues = isControlled ? open : internalOpen;

  const toggle = useCallback(
    (value: string) => {
      const isOpen = openValues.includes(value);
      const next = isOpen
        ? openValues.filter((entry) => entry !== value)
        : single
          ? [value]
          : [...openValues, value];
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange, openValues, single]
  );

  const headerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onHeaderKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const headers = headerRefs.current.filter(Boolean) as HTMLButtonElement[];
    if (headers.length === 0) return;
    const move = (delta: number) => {
      event.preventDefault();
      const next = (index + delta + headers.length) % headers.length;
      headers[next]?.focus();
    };
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Home") {
      event.preventDefault();
      headers[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      headers[headers.length - 1]?.focus();
    }
  }, []);

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
      {items.map((item, index) => (
        <AccordionRow
          key={item.value}
          item={item}
          index={index}
          expanded={openValues.includes(item.value)}
          onToggle={toggle}
          onKeyDown={onHeaderKeyDown}
          registerRef={(node) => {
            headerRefs.current[index] = node;
          }}
        />
      ))}
    </div>
  );
}

type AccordionRowProps = {
  item: AccordionItemProps;
  index: number;
  expanded: boolean;
  onToggle: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => void;
  registerRef: (node: HTMLButtonElement | null) => void;
};

function AccordionRow({ item, index, expanded, onToggle, onKeyDown, registerRef }: AccordionRowProps) {
  const reactId = useId();
  const headerId = `acc-h-${reactId}`;
  const panelId = `acc-p-${reactId}`;
  const Icon = item.icon;

  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
        "bg-card",
        item.tone === "destructive" && "border-destructive/50",
        item.tone === "warning" && "border-warning/50",
        item.disabled && "opacity-60"
      )}
    >
      <div className="flex min-w-0 items-center gap-1 pr-2">
        <button
          ref={registerRef}
          id={headerId}
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          disabled={item.disabled}
          onClick={() => onToggle(item.value)}
          onKeyDown={(event) => onKeyDown(event, index)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left transition-colors duration-200",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
            "hover:bg-accent/60 disabled:cursor-not-allowed sm:px-4"
          )}
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
              expanded && "rotate-180"
            )}
          />
          {Icon ? <Icon size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" /> : null}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
          {item.summary ? (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{item.summary}</span>
          ) : null}
        </button>
        {item.actions ? <div className="flex shrink-0 items-center gap-1">{item.actions}</div> : null}
      </div>
      {expanded ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="min-w-0 border-t border-border px-3 py-3 sm:px-4"
        >
          {item.children}
        </div>
      ) : null}
    </div>
  );
}
