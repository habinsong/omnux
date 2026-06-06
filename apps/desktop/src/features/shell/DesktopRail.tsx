import { Layers3 } from "lucide-react";
import { cn } from "../../components/ui/primitives";
import type { DesktopPageId } from "./DesktopNavigation";
import { NAV_AREAS, areaForPage, type NavAreaId } from "./nav-areas";

type DesktopRailProps = {
  activePage: DesktopPageId;
  areaBadges?: Partial<Record<NavAreaId, number>>;
  onSelectArea: (area: NavAreaId) => void;
};

function RailButton({
  label,
  active,
  badge,
  onClick,
  children
}: {
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 ease-out",
        "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-2 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0"
        )}
      />
      {children}
      {badge && badge > 0 ? (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export function DesktopRail({ activePage, areaBadges, onSelectArea }: DesktopRailProps) {
  const activeArea = areaForPage(activePage);
  const middleAreas = NAV_AREAS.filter((area) => area.id !== "home" && area.id !== "system");
  const systemArea = NAV_AREAS.find((area) => area.id === "system");

  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
      {/* 로고 = 홈 영역 진입 */}
      <RailButton label="omnux · 홈" active={activeArea === "home"} onClick={() => onSelectArea("home")}>
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[6px] bg-primary/90 text-primary-foreground">
          <Layers3 size={15} strokeWidth={2.5} aria-hidden="true" />
        </span>
      </RailButton>

      <div className="mt-1 flex flex-1 flex-col items-center gap-1">
        {middleAreas.map((area) => {
          const Icon = area.icon;
          return (
            <RailButton
              key={area.id}
              label={area.label}
              active={area.id === activeArea}
              badge={areaBadges?.[area.id]}
              onClick={() => onSelectArea(area.id)}
            >
              <Icon size={22} strokeWidth={2} aria-hidden="true" />
            </RailButton>
          );
        })}
      </div>

      {systemArea ? (
        <RailButton label={systemArea.label} active={activeArea === "system"} onClick={() => onSelectArea("system")}>
          <systemArea.icon size={22} strokeWidth={2} aria-hidden="true" />
        </RailButton>
      ) : null}
    </div>
  );
}
