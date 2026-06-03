import type { ReactNode } from "react";

export type DesktopPageId = "shell" | "ask" | "build" | "explore" | "automate" | "settings" | "operations";

export type DesktopPageDefinition = {
  id: DesktopPageId;
  label: string;
  description: string;
  render: () => ReactNode;
};

type DesktopNavigationProps = {
  pages: DesktopPageDefinition[];
  activePage: DesktopPageId;
  onSelectPage: (page: DesktopPageId) => void;
};

export function DesktopNavigation({ pages, activePage, onSelectPage }: DesktopNavigationProps) {
  return (
    <nav className="desktop-tabs" aria-label="Desktop pages">
      {pages.map((page) => (
        <button
          key={page.id}
          className={page.id === activePage ? "desktop-tab active" : "desktop-tab"}
          type="button"
          onClick={() => onSelectPage(page.id)}
        >
          <span>{page.label}</span>
          <small>{page.description}</small>
        </button>
      ))}
    </nav>
  );
}
